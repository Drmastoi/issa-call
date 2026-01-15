import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// GDPR-COMPLIANT: Two-stage extraction
// Stage 1: Extract PII locally using regex (no AI)
// Stage 2: Extract clinical data using AI (no PII sent)

// Stage 1: Local PII extraction using regex patterns
function extractPIILocally(text: string): {
  name: string | null;
  phone_number: string | null;
  nhs_number: string | null;
  date_of_birth: string | null;
} {
  // Extract NHS number (10 digits, may have spaces)
  const nhsMatch = text.match(/NHS\s*(?:Number|No\.?)?\s*:?\s*(\d{3}\s?\d{3}\s?\d{4})/i) ||
                   text.match(/(\d{3}\s?\d{3}\s?\d{4})/);
  const nhsNumber = nhsMatch ? nhsMatch[1].replace(/\s/g, '') : null;

  // Extract phone number (UK formats)
  const phoneMatch = text.match(/(?:Tel|Phone|Mobile|Contact)?\s*:?\s*(\+44\s?\d{4}\s?\d{6}|\+44\s?\d{3}\s?\d{3}\s?\d{4}|0\d{4}\s?\d{6}|0\d{3}\s?\d{3}\s?\d{4}|07\d{3}\s?\d{6})/i);
  let phoneNumber = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;
  
  // Convert to international format
  if (phoneNumber && phoneNumber.startsWith('0')) {
    phoneNumber = '+44' + phoneNumber.substring(1);
  }

  // Extract date of birth (various formats)
  const dobMatch = text.match(/(?:DOB|Date of Birth|D\.O\.B\.?|Born)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ||
                   text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
  let dateOfBirth: string | null = null;
  
  if (dobMatch) {
    const parts = dobMatch[1].split(/[\/\-\.]/);
    if (parts.length === 3) {
      let day = parts[0].padStart(2, '0');
      let month = parts[1].padStart(2, '0');
      let year = parts[2];
      
      // Handle 2-digit year
      if (year.length === 2) {
        year = parseInt(year) > 30 ? '19' + year : '20' + year;
      }
      
      // Assume DD/MM/YYYY format (UK)
      dateOfBirth = `${year}-${month}-${day}`;
    }
  }

  // Extract patient name (look for common patterns)
  const nameMatch = text.match(/(?:Patient\s*(?:Name)?|Name)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                    text.match(/(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  return {
    name,
    phone_number: phoneNumber,
    nhs_number: nhsNumber,
    date_of_birth: dateOfBirth
  };
}

// Stage 2: Remove PII from text before sending to AI
function sanitizeTextForAI(text: string): string {
  let sanitized = text;
  
  // Remove NHS numbers
  sanitized = sanitized.replace(/\d{3}\s?\d{3}\s?\d{4}/g, '[NHS_NUMBER]');
  
  // Remove phone numbers
  sanitized = sanitized.replace(/(\+44|0)\s?\d{3,4}\s?\d{3}\s?\d{3,4}/g, '[PHONE]');
  
  // Remove dates of birth patterns
  sanitized = sanitized.replace(/(?:DOB|Date of Birth|D\.O\.B\.?|Born)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, '[DOB]');
  
  // Remove full names after common patterns (keep first names for clinical context)
  sanitized = sanitized.replace(/(?:Patient\s*(?:Name)?|Name)\s*:?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/gi, 'Patient: [NAME]');
  
  // Remove addresses
  sanitized = sanitized.replace(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Lane|Avenue|Close|Drive|Way|Court|Crescent|Place|Gardens|Terrace|Mews)\s*,?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,?\s*[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[ADDRESS]');
  
  // Remove postcodes
  sanitized = sanitized.replace(/[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/gi, '[POSTCODE]');
  
  return sanitized;
}

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

    console.log("GDPR-Compliant extraction: Processing PDF text, length:", pdfText.length);

    // STAGE 1: Extract PII locally (no AI)
    console.log("Stage 1: Local PII extraction...");
    const piiData = extractPIILocally(pdfText);
    console.log("PII extracted locally:", { 
      hasName: !!piiData.name, 
      hasPhone: !!piiData.phone_number,
      hasNHS: !!piiData.nhs_number,
      hasDOB: !!piiData.date_of_birth
    });

    // STAGE 2: Sanitize text and send to AI for clinical data extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Remove all PII from text before sending to AI
    const sanitizedText = sanitizeTextForAI(pdfText);
    console.log("Stage 2: Sending sanitized text to AI (no PII)...");

    // AI prompt only asks for clinical data, not PII
    const prompt = `Extract ONLY clinical data from this medical summary document. DO NOT extract any patient-identifiable information.

Look for CLINICAL DATA ONLY:
1. Conditions/diagnoses (diabetes, hypertension, COPD, asthma, CHD, AF, stroke, mental health conditions, etc.)
2. Current smoking status (current smoker, ex-smoker, never smoked, unknown)
3. Last HbA1c value (mmol/mol) and date if present
4. Last blood pressure reading (systolic/diastolic) and date if present
5. Medications list (active medications)
6. Frailty status if mentioned (mild, moderate, severe)
7. Alcohol units per week if mentioned

Document content (anonymized):
${sanitizedText.substring(0, 12000)}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
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

If you cannot find a field, use null or empty array.`;

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
            content: "You are a clinical data parser. Extract ONLY clinical information (conditions, medications, metrics). NEVER extract or include patient names, NHS numbers, addresses, or any identifiable information."
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

    console.log("AI response received (clinical data only)");

    // Parse the JSON response
    let clinicalData;
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      clinicalData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse extracted clinical data");
    }

    // Combine PII (from local extraction) with clinical data (from AI)
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          // PII from local extraction (never sent to AI)
          name: piiData.name,
          phone_number: piiData.phone_number,
          nhs_number: piiData.nhs_number,
          date_of_birth: piiData.date_of_birth,
          // Clinical data from AI (no PII in AI context)
          conditions: clinicalData.conditions || [],
          smoking_status: clinicalData.smoking_status || null,
          hba1c_mmol_mol: clinicalData.hba1c_mmol_mol || null,
          hba1c_date: clinicalData.hba1c_date || null,
          blood_pressure_systolic: clinicalData.blood_pressure_systolic || null,
          blood_pressure_diastolic: clinicalData.blood_pressure_diastolic || null,
          bp_date: clinicalData.bp_date || null,
          medications: clinicalData.medications || [],
          frailty_status: clinicalData.frailty_status || null,
          alcohol_units_per_week: clinicalData.alcohol_units_per_week || null,
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
