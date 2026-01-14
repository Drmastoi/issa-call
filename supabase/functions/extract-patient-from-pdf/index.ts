import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText } = await req.json();

    if (!pdfText || typeof pdfText !== "string") {
      return new Response(
        JSON.stringify({ error: "PDF text content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Extracting patient info from PDF text, length:", pdfText.length);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

const prompt = `Extract patient information and clinical data from this medical summary document. Look for:

PATIENT DETAILS:
1. Patient name (full name)
2. Phone number (UK format preferred)
3. NHS number (if present)
4. Date of birth (format: YYYY-MM-DD)

CLINICAL DATA:
5. Conditions/diagnoses (diabetes, hypertension, COPD, asthma, CHD, AF, stroke, mental health conditions, etc.)
6. Current smoking status (current smoker, ex-smoker, never smoked, unknown)
7. Last HbA1c value (mmol/mol) and date if present
8. Last blood pressure reading (systolic/diastolic) and date if present
9. Medications list (active medications)
10. Frailty status if mentioned (mild, moderate, severe)
11. Alcohol units per week if mentioned

Document content:
${pdfText.substring(0, 12000)}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "name": "extracted full name or null if not found",
  "phone_number": "extracted phone number or null if not found",
  "nhs_number": "extracted NHS number or null if not found",
  "date_of_birth": "YYYY-MM-DD or null if not found",
  "conditions": ["array of condition names"] or [],
  "smoking_status": "current_smoker|ex_smoker|never_smoked|unknown",
  "hba1c_mmol_mol": number or null,
  "hba1c_date": "YYYY-MM-DD or null",
  "blood_pressure_systolic": number or null,
  "blood_pressure_diastolic": number or null,
  "bp_date": "YYYY-MM-DD or null",
  "medications": ["array of medication names"] or [],
  "frailty_status": "mild|moderate|severe or null",
  "alcohol_units_per_week": number or null
}

If you cannot find a field, use null or empty array. For phone numbers, try to format as UK mobile (+44...) if possible.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a medical document parser. Extract patient information accurately and respond only with valid JSON."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    console.log("AI response:", content);

    // Parse the JSON response
    let extracted;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      extracted = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse extracted data");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          name: extracted.name || null,
          phone_number: extracted.phone_number || null,
          nhs_number: extracted.nhs_number || null,
          date_of_birth: extracted.date_of_birth || null,
          conditions: extracted.conditions || [],
          smoking_status: extracted.smoking_status || null,
          hba1c_mmol_mol: extracted.hba1c_mmol_mol || null,
          hba1c_date: extracted.hba1c_date || null,
          blood_pressure_systolic: extracted.blood_pressure_systolic || null,
          blood_pressure_diastolic: extracted.blood_pressure_diastolic || null,
          bp_date: extracted.bp_date || null,
          medications: extracted.medications || [],
          frailty_status: extracted.frailty_status || null,
          alcohol_units_per_week: extracted.alcohol_units_per_week || null,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error extracting patient info:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
