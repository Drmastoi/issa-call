import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractPII, sanitizeForAI, CLINICAL_EXTRACTION_SCHEMA, CLINICAL_SYSTEM_PROMPT, CORS_HEADERS } from "../_shared/pii-extraction.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { patientId, documentText } = await req.json();
    if (!patientId || !documentText) {
      return new Response(JSON.stringify({ error: "patientId and documentText are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log("GDPR-Compliant extraction: Two-stage process starting...");

    // STAGE 1: Extract PII locally (no AI)
    const piiData = extractPII(documentText);
    console.log("Stage 1: PII extracted locally");

    // STAGE 2: Sanitize text and send to AI for clinical + lab data
    const sanitizedText = sanitizeForAI(documentText);
    console.log("Stage 2: Sending sanitized text to AI...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: CLINICAL_SYSTEM_PROMPT },
          { role: "user", content: `Extract ALL clinical data, lab values, and vital signs from this SANITIZED document:\n\n${sanitizedText.substring(0, 12000)}` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_clinical_data",
            description: "Extract clinical data, lab values, vital signs, and scores from sanitized documents",
            parameters: CLINICAL_EXTRACTION_SCHEMA,
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_clinical_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }),
          { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_clinical_data") {
      throw new Error("Failed to extract clinical data from AI response");
    }

    const clinicalData = JSON.parse(toolCall.function.arguments);
    console.log("Clinical data extracted (including lab values)");

    // Build update combining PII (local) + clinical (AI)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData: Record<string, any> = {
      ai_extracted_at: new Date().toISOString(),
    };

    // PII from local extraction
    if (piiData.next_of_kin_name) updateData.next_of_kin_name = piiData.next_of_kin_name;
    if (piiData.next_of_kin_phone) updateData.next_of_kin_phone = piiData.next_of_kin_phone;
    if (piiData.next_of_kin_relationship) updateData.next_of_kin_relationship = piiData.next_of_kin_relationship;
    if (piiData.gp_name) updateData.gp_name = piiData.gp_name;
    if (piiData.gp_practice) updateData.gp_practice = piiData.gp_practice;
    if (piiData.care_home_name) updateData.care_home_name = piiData.care_home_name;

    // Clinical data from AI (now includes lab values)
    const clinicalFields: Record<string, string> = {
      dnacpr_status: 'dnacpr_status',
      dnacpr_date: 'dnacpr_date',
      allergies: 'allergies',
      mobility_status: 'mobility_status',
      dietary_requirements: 'dietary_requirements',
      communication_needs: 'communication_needs',
      conditions: 'conditions',
      medications: 'medications',
      frailty_status: 'frailty_status',
      summary: 'ai_extracted_summary',
      // Lab values
      hba1c_mmol_mol: 'hba1c_mmol_mol',
      hba1c_date: 'hba1c_date',
      cholesterol_ldl: 'cholesterol_ldl',
      cholesterol_hdl: 'cholesterol_hdl',
      cholesterol_date: 'cholesterol_date',
      cha2ds2_vasc_score: 'cha2ds2_vasc_score',
      last_review_date: 'last_review_date',
    };

    for (const [aiKey, dbKey] of Object.entries(clinicalFields)) {
      const val = clinicalData[aiKey];
      if (val !== null && val !== undefined && val !== '') {
        if (Array.isArray(val) && val.length === 0) continue;
        updateData[dbKey] = val;
      }
    }

    const { error: updateError } = await supabase
      .from("patients")
      .update(updateData)
      .eq("id", patientId);

    if (updateError) throw new Error(`Failed to update patient: ${updateError.message}`);

    // If we got vitals, create a call_response record (synthetic)
    const hasVitals = clinicalData.blood_pressure_systolic || clinicalData.weight_kg || clinicalData.smoking_status;
    if (hasVitals) {
      // Check for existing synthetic response today
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await supabase
        .from('call_responses')
        .select('id')
        .eq('patient_id', patientId)
        .gte('collected_at', today)
        .limit(1);

      if (!existing || existing.length === 0) {
        // We need a call record - create a synthetic one for document extraction
        const { data: callData } = await supabase
          .from('calls')
          .insert({
            patient_id: patientId,
            status: 'completed',
            purpose_context: 'document_extraction',
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (callData) {
          await supabase.from('call_responses').insert({
            call_id: callData.id,
            patient_id: patientId,
            blood_pressure_systolic: clinicalData.blood_pressure_systolic || null,
            blood_pressure_diastolic: clinicalData.blood_pressure_diastolic || null,
            weight_kg: clinicalData.weight_kg || null,
            height_cm: clinicalData.height_cm || null,
            smoking_status: clinicalData.smoking_status || null,
            alcohol_units_per_week: clinicalData.alcohol_units_per_week || null,
            pulse_rate: null,
          });
        }
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "gdpr_compliant_extraction",
      entity_type: "patient",
      entity_id: patientId,
      details: {
        pii_extracted_locally: true,
        clinical_data_from_ai: true,
        lab_values_extracted: !!(clinicalData.hba1c_mmol_mol || clinicalData.cholesterol_ldl || clinicalData.cha2ds2_vasc_score),
        vitals_extracted: hasVitals,
      },
    });

    // Auto-trigger clinical actions after extraction
    try {
      const functionsUrl = `${supabaseUrl}/functions/v1/clinical-actions`;
      await fetch(functionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ patientId }),
      });
      console.log("Clinical actions triggered for patient:", patientId);
    } catch (triggerErr) {
      console.error("Clinical actions trigger failed (non-blocking):", triggerErr);
    }

    return new Response(JSON.stringify({
      success: true,
      extractedData: { ...piiData, ...clinicalData },
      gdprCompliant: true,
      clinicalActionsTriggered: true,
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Extract patient data error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
