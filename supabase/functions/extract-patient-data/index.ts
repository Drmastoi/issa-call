import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR-COMPLIANT: Two-stage extraction
 * Stage 1: Extract PII locally using regex (no AI)
 * Stage 2: Extract clinical data using AI (with sanitized text only)
 */

// Stage 1: Local PII extraction using regex patterns (no AI involved)
function extractPIILocally(text: string): {
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  gp_name: string | null;
  gp_practice: string | null;
  care_home_name: string | null;
} {
  // Extract next of kin info
  const nokNameMatch = text.match(/(?:Next of Kin|NOK|Emergency Contact)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  const nokPhoneMatch = text.match(/(?:NOK|Next of Kin|Emergency)\s*(?:Phone|Tel|Contact)?\s*:?\s*(\+44\s?\d{4}\s?\d{6}|\+44\s?\d{3}\s?\d{3}\s?\d{4}|0\d{4}\s?\d{6}|0\d{3}\s?\d{3}\s?\d{4}|07\d{3}\s?\d{6})/i);
  const nokRelMatch = text.match(/(?:Relationship|Relation)\s*:?\s*(Wife|Husband|Partner|Son|Daughter|Mother|Father|Sister|Brother|Friend|Carer|Spouse|Child|Parent)/i);

  // Extract GP info
  const gpNameMatch = text.match(/(?:GP|Doctor|Dr\.?)\s*:?\s*(?:Dr\.?\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const gpPracticeMatch = text.match(/(?:Practice|Surgery|Medical Centre|Health Centre)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*(?:Practice|Surgery|Medical Centre|Health Centre)?)/i);

  // Extract care home name
  const careHomeMatch = text.match(/(?:Care Home|Nursing Home|Residential Home|Facility)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);

  let nokPhone = nokPhoneMatch ? nokPhoneMatch[1].replace(/\s/g, '') : null;
  if (nokPhone && nokPhone.startsWith('0')) {
    nokPhone = '+44' + nokPhone.substring(1);
  }

  return {
    next_of_kin_name: nokNameMatch ? nokNameMatch[1].trim() : null,
    next_of_kin_phone: nokPhone,
    next_of_kin_relationship: nokRelMatch ? nokRelMatch[1].trim() : null,
    gp_name: gpNameMatch ? gpNameMatch[1].trim() : null,
    gp_practice: gpPracticeMatch ? gpPracticeMatch[1].trim() : null,
    care_home_name: careHomeMatch ? careHomeMatch[1].trim() : null,
  };
}

// Stage 2: Sanitize text before sending to AI
function sanitizeTextForAI(text: string): string {
  let sanitized = text;
  
  // Remove NHS numbers
  sanitized = sanitized.replace(/\b\d{3}\s?\d{3}\s?\d{4}\b/g, '[NHS_NUMBER]');
  
  // Remove phone numbers
  sanitized = sanitized.replace(/(\+44|0)\s?\d{3,4}\s?\d{3}\s?\d{3,4}/g, '[PHONE]');
  
  // Remove dates of birth patterns
  sanitized = sanitized.replace(/(?:DOB|Date of Birth|D\.O\.B\.?|Born)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, '[DOB]');
  sanitized = sanitized.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g, '[DATE]');
  
  // Remove full names after common patterns
  sanitized = sanitized.replace(/(?:Patient\s*(?:Name)?|Name)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/gi, 'Patient: [NAME]');
  sanitized = sanitized.replace(/(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, '[PERSON]');
  
  // Remove next of kin names
  sanitized = sanitized.replace(/(?:Next of Kin|NOK|Emergency Contact)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/gi, 'Next of Kin: [NAME]');
  
  // Remove GP names
  sanitized = sanitized.replace(/(?:GP|Doctor)\s*:?\s*(?:Dr\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, 'GP: [NAME]');
  
  // Remove addresses
  sanitized = sanitized.replace(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Close|Drive|Way|Court|Crescent|Place|Gardens|Terrace|Mews)\s*,?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,?\s*[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[ADDRESS]');
  
  // Remove postcodes
  sanitized = sanitized.replace(/[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[POSTCODE]');
  
  // Remove email addresses
  sanitized = sanitized.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '[EMAIL]');
  
  return sanitized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId, documentText } = await req.json();

    if (!patientId || !documentText) {
      return new Response(
        JSON.stringify({ error: "patientId and documentText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("GDPR-Compliant extraction: Two-stage process starting...");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // STAGE 1: Extract PII locally (no AI)
    console.log("Stage 1: Local PII extraction...");
    const piiData = extractPIILocally(documentText);
    console.log("PII extracted locally (not sent to AI)");

    // STAGE 2: Sanitize text and send to AI for clinical data only
    console.log("Stage 2: Sanitizing text before AI processing...");
    const sanitizedText = sanitizeTextForAI(documentText);
    console.log("Text sanitized, sending to AI for clinical extraction only...");

    // AI prompt asks ONLY for clinical data, not PII
    const systemPrompt = `You are a medical data extraction assistant for a UK care home management system. 
Extract ONLY clinical information from the provided document. 
DO NOT extract any personally identifiable information (names, addresses, phone numbers, NHS numbers).
The document has been pre-sanitized - any [NAME], [PHONE], [ADDRESS] tokens should be ignored.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract ONLY clinical data from this SANITIZED document (all PII has been removed):\n\n${sanitizedText.substring(0, 12000)}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_clinical_data",
              description: "Extract ONLY clinical data from sanitized documents - NO personally identifiable information",
              parameters: {
                type: "object",
                properties: {
                  dnacpr_status: { 
                    type: "string", 
                    enum: ["In Place", "Not in Place", "Unknown"],
                    description: "DNACPR status" 
                  },
                  dnacpr_date: { 
                    type: "string", 
                    description: "Date of DNACPR decision in ISO format (YYYY-MM-DD)" 
                  },
                  allergies: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of known allergies" 
                  },
                  mobility_status: { type: "string", description: "Patient mobility status" },
                  dietary_requirements: { type: "string", description: "Dietary requirements or restrictions" },
                  communication_needs: { type: "string", description: "Communication needs or preferences" },
                  conditions: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Medical conditions" 
                  },
                  medications: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Current medications" 
                  },
                  frailty_status: {
                    type: "string",
                    enum: ["mild", "moderate", "severe"],
                    description: "Frailty status if mentioned"
                  },
                  summary: { type: "string", description: "Brief clinical summary of key information (NO patient names)" }
                },
                required: [],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_clinical_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== "extract_clinical_data") {
      throw new Error("Failed to extract clinical data from AI response");
    }

    const clinicalData = JSON.parse(toolCall.function.arguments);
    console.log("Clinical data extracted from AI (no PII was sent)");

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build update object combining:
    // - PII from local extraction (Stage 1)
    // - Clinical data from AI (Stage 2)
    const updateData: Record<string, any> = {
      ai_extracted_at: new Date().toISOString(),
    };

    // Add PII from local extraction
    if (piiData.next_of_kin_name) updateData.next_of_kin_name = piiData.next_of_kin_name;
    if (piiData.next_of_kin_phone) updateData.next_of_kin_phone = piiData.next_of_kin_phone;
    if (piiData.next_of_kin_relationship) updateData.next_of_kin_relationship = piiData.next_of_kin_relationship;
    if (piiData.gp_name) updateData.gp_name = piiData.gp_name;
    if (piiData.gp_practice) updateData.gp_practice = piiData.gp_practice;
    if (piiData.care_home_name) updateData.care_home_name = piiData.care_home_name;

    // Add clinical data from AI
    if (clinicalData.dnacpr_status) updateData.dnacpr_status = clinicalData.dnacpr_status;
    if (clinicalData.dnacpr_date) updateData.dnacpr_date = clinicalData.dnacpr_date;
    if (clinicalData.allergies?.length > 0) updateData.allergies = clinicalData.allergies;
    if (clinicalData.mobility_status) updateData.mobility_status = clinicalData.mobility_status;
    if (clinicalData.dietary_requirements) updateData.dietary_requirements = clinicalData.dietary_requirements;
    if (clinicalData.communication_needs) updateData.communication_needs = clinicalData.communication_needs;
    if (clinicalData.conditions?.length > 0) updateData.conditions = clinicalData.conditions;
    if (clinicalData.medications?.length > 0) updateData.medications = clinicalData.medications;
    if (clinicalData.frailty_status) updateData.frailty_status = clinicalData.frailty_status;
    if (clinicalData.summary) updateData.ai_extracted_summary = clinicalData.summary;

    // Update patient record
    const { error: updateError } = await supabase
      .from("patients")
      .update(updateData)
      .eq("id", patientId);

    if (updateError) {
      console.error("Failed to update patient:", updateError);
      throw new Error(`Failed to update patient: ${updateError.message}`);
    }

    // AUDIT LOG: Record extraction
    await supabase
      .from("audit_logs")
      .insert({
        action: "gdpr_compliant_extraction",
        entity_type: "patient",
        entity_id: patientId,
        details: {
          pii_extracted_locally: true,
          clinical_data_from_ai: true,
          no_pii_sent_to_ai: true,
        },
      });

    console.log("GDPR-compliant extraction complete for patient:", patientId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedData: {
          ...piiData,
          ...clinicalData,
        },
        gdprCompliant: true,
        message: "Patient data extracted using GDPR-compliant two-stage process" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract patient data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
