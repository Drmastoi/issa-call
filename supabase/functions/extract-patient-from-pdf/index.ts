import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractPII, sanitizeForAI, CLINICAL_SYSTEM_PROMPT, CORS_HEADERS } from "../_shared/pii-extraction.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { pdfText } = await req.json();
    if (!pdfText || typeof pdfText !== "string") {
      return new Response(JSON.stringify({ error: "PDF text content is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    console.log("GDPR-Compliant PDF extraction, length:", pdfText.length);

    // STAGE 1: Extract PII locally
    const piiData = extractPII(pdfText);
    console.log("PII extracted locally:", { hasName: !!piiData.name, hasPhone: !!piiData.phone_number, hasNHS: !!piiData.nhs_number });

    // STAGE 2: Sanitize and send to AI for clinical + lab data
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sanitizedText = sanitizeForAI(pdfText);

    const prompt = `Extract ALL clinical data from this medical document. Include conditions, medications, lab values (HbA1c, cholesterol, eGFR, creatinine), vital signs (BP, weight, height), scores (CHA2DS2-VASc, frailty), and smoking/alcohol status.

Document content (anonymized):
${sanitizedText.substring(0, 12000)}

Respond ONLY with valid JSON:
{
  "conditions": [],
  "smoking_status": "current_smoker|ex_smoker|never_smoked|unknown",
  "hba1c_mmol_mol": null,
  "hba1c_date": null,
  "cholesterol_ldl": null,
  "cholesterol_hdl": null,
  "cholesterol_date": null,
  "blood_pressure_systolic": null,
  "blood_pressure_diastolic": null,
  "bp_date": null,
  "medications": [],
  "frailty_status": null,
  "alcohol_units_per_week": null,
  "weight_kg": null,
  "height_cm": null,
  "cha2ds2_vasc_score": null,
  "egfr": null,
  "creatinine": null,
  "last_review_date": null
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: CLINICAL_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", errText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    let clinicalData;
    try {
      let clean = content.trim();
      if (clean.startsWith("```json")) clean = clean.slice(7);
      else if (clean.startsWith("```")) clean = clean.slice(3);
      if (clean.endsWith("```")) clean = clean.slice(0, -3);
      clinicalData = JSON.parse(clean.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse extracted clinical data");
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        // PII from local extraction
        name: piiData.name,
        phone_number: piiData.phone_number,
        nhs_number: piiData.nhs_number,
        date_of_birth: piiData.date_of_birth,
        // Clinical + lab data from AI
        conditions: clinicalData.conditions || [],
        smoking_status: clinicalData.smoking_status || null,
        hba1c_mmol_mol: clinicalData.hba1c_mmol_mol || null,
        hba1c_date: clinicalData.hba1c_date || null,
        cholesterol_ldl: clinicalData.cholesterol_ldl || null,
        cholesterol_hdl: clinicalData.cholesterol_hdl || null,
        cholesterol_date: clinicalData.cholesterol_date || null,
        blood_pressure_systolic: clinicalData.blood_pressure_systolic || null,
        blood_pressure_diastolic: clinicalData.blood_pressure_diastolic || null,
        bp_date: clinicalData.bp_date || null,
        medications: clinicalData.medications || [],
        frailty_status: clinicalData.frailty_status || null,
        alcohol_units_per_week: clinicalData.alcohol_units_per_week || null,
        weight_kg: clinicalData.weight_kg || null,
        height_cm: clinicalData.height_cm || null,
        cha2ds2_vasc_score: clinicalData.cha2ds2_vasc_score || null,
        egfr: clinicalData.egfr || null,
        creatinine: clinicalData.creatinine || null,
        last_review_date: clinicalData.last_review_date || null,
      }
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error extracting patient info:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
