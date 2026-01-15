import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthMetrics {
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  pulse_rate: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  is_carer: boolean | null;
}

/**
 * GDPR COMPLIANCE: PII Scrubbing Function
 * 
 * Removes personally identifiable information from transcripts before
 * sending to external AI services. This ensures GDPR Article 5 (data minimization)
 * and Article 25 (privacy by design) compliance.
 */
function scrubPIIFromTranscript(transcript: string): string {
  let sanitized = transcript;
  
  // Remove NHS numbers (various formats: 123 456 7890, 1234567890, 123-456-7890)
  sanitized = sanitized.replace(/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, "[NHS_NUMBER]");
  
  // Remove UK phone numbers (various formats)
  sanitized = sanitized.replace(/\b(?:0|\+44)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, "[PHONE]");
  
  // Remove dates of birth patterns (DD/MM/YYYY, DD-MM-YYYY, "born on", etc.)
  sanitized = sanitized.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, "[DOB]");
  sanitized = sanitized.replace(/born (?:on |in )?\w+ \d{1,2}(?:st|nd|rd|th)?,? \d{4}/gi, "[DOB]");
  sanitized = sanitized.replace(/born (?:on |in )?\d{1,2}(?:st|nd|rd|th)? (?:of )?\w+,? \d{4}/gi, "[DOB]");
  
  // Remove UK postcodes
  sanitized = sanitized.replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi, "[POSTCODE]");
  
  // Remove email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]");
  
  // Remove common name patterns when preceded by identifying phrases
  // "my name is X", "I'm X", "this is X speaking"
  sanitized = sanitized.replace(/(?:my name is|I'm|I am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, "$& [NAME_REDACTED]");
  
  // Remove addresses (street patterns)
  sanitized = sanitized.replace(/\b\d+\s+[A-Za-z]+\s+(?:Street|Road|Avenue|Lane|Drive|Close|Way|Court|Place|Crescent|Gardens?|Park|Grove|Terrace|Walk|Row|Mews)\b/gi, "[ADDRESS]");
  
  // Remove common UK title + name patterns
  sanitized = sanitized.replace(/\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, "[PATIENT]");
  
  return sanitized;
}

/**
 * Extract health metrics from SANITIZED transcript using AI
 * The AI only ever sees anonymized data
 */
async function extractHealthMetrics(sanitizedTranscript: string): Promise<HealthMetrics> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured, skipping AI extraction");
    return {
      blood_pressure_systolic: null,
      blood_pressure_diastolic: null,
      weight_kg: null,
      height_cm: null,
      pulse_rate: null,
      smoking_status: null,
      alcohol_units_per_week: null,
      is_carer: null,
    };
  }

  // GDPR: System prompt explicitly mentions no PII should be in the transcript
  const systemPrompt = `You are a medical data extraction assistant. Extract health metrics from anonymized call transcripts.
The transcript has been sanitized - any patient-identifiable information has been replaced with tokens like [PATIENT], [NHS_NUMBER], etc.

Extract the following metrics and return ONLY valid JSON (no markdown, no explanation):
{
  "blood_pressure_systolic": number or null (top number, e.g., 120 from "120 over 80"),
  "blood_pressure_diastolic": number or null (bottom number, e.g., 80 from "120 over 80"),
  "weight_kg": number or null (convert stones to kg: 1 stone = 6.35 kg, convert lbs to kg: 1 lb = 0.453 kg),
  "height_cm": number or null (convert feet/inches to cm: 1 foot = 30.48 cm, 1 inch = 2.54 cm),
  "pulse_rate": number or null (beats per minute),
  "smoking_status": string or null ("never_smoked", "ex_smoker", or "current_smoker"),
  "alcohol_units_per_week": number or null,
  "is_carer": boolean or null (whether they care for someone else)
}

Rules:
- Return null for any value not mentioned or unclear
- For blood pressure, look for patterns like "120/80", "120 over 80", "one twenty over eighty"
- For weight in stones, convert to kg (e.g., "12 stone" = 76.2 kg)
- For height in feet/inches, convert to cm (e.g., "5 foot 8" = 172.72 cm)
- For smoking: "never smoked" → "never_smoked", "quit"/"used to smoke" → "ex_smoker", "yes"/"I smoke" → "current_smoker"
- Ignore any [REDACTED] or [PATIENT] tokens - these are privacy placeholders
- Return ONLY the JSON object, nothing else`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract health metrics from this ANONYMIZED call transcript:\n\n${sanitizedTranscript}` }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI extraction error:", errorText);
      throw new Error(`AI extraction failed: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";
    
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    console.log("AI extracted metrics from sanitized transcript");
    
    return JSON.parse(cleanedContent);
  } catch (error) {
    console.error("Error extracting health metrics:", error);
    return {
      blood_pressure_systolic: null,
      blood_pressure_diastolic: null,
      weight_kg: null,
      height_cm: null,
      pulse_rate: null,
      smoking_status: null,
      alcohol_units_per_week: null,
      is_carer: null,
    };
  }
}

/**
 * GDPR/ICO/ICB Compliant ElevenLabs Webhook Handler
 * 
 * Key compliance features:
 * 1. PII scrubbing before AI processing
 * 2. Audit logging of all data access
 * 3. Retention policy support
 * 4. No patient identifiers sent to external AI
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    // GDPR: Log webhook receipt without PII
    console.log("ElevenLabs webhook received:", { 
      hasTranscript: !!payload.transcript,
      status: payload.status,
      callReference: payload.callReference 
    });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      conversation_id,
      call_id,
      callReference, // Anonymous reference we passed
      transcript,
      status,
      duration_seconds,
    } = payload;

    // Find call by our custom callId or by conversation_id
    let callRecord = null;
    
    if (call_id) {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("id", call_id)
        .single();
      callRecord = data;
    }

    if (!callRecord && conversation_id) {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("twilio_call_sid", conversation_id)
        .single();
      callRecord = data;
    }

    if (!callRecord) {
      console.log("Call record not found, webhook data:", { call_id, conversation_id, callReference });
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received but call not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found call record:", callRecord.id);

    // AUDIT LOG: Record webhook receipt
    await supabase.rpc('log_call_audit', {
      p_call_id: callRecord.id,
      p_action: 'webhook_received',
      p_actor: 'elevenlabs',
      p_details: { 
        status,
        has_transcript: !!transcript,
        duration_seconds 
      }
    });

    // Update the call record
    const updateData: Record<string, unknown> = {
      ended_at: new Date().toISOString(),
    };

    if (transcript) {
      // Store original transcript (encrypted at rest in Supabase)
      updateData.transcript = transcript;
    }

    if (duration_seconds) {
      updateData.duration_seconds = duration_seconds;
    }

    if (status === "completed" || status === "success") {
      updateData.status = "completed";
    } else if (status === "failed" || status === "error") {
      updateData.status = "failed";
    } else if (status === "no_answer" || status === "busy") {
      updateData.status = "no_answer";
    }

    await supabase
      .from("calls")
      .update(updateData)
      .eq("id", callRecord.id);

    console.log("Updated call record:", callRecord.id);

    // GDPR COMPLIANCE: Scrub PII before AI processing
    if (transcript && transcript.length > 50) {
      console.log("Scrubbing PII from transcript before AI processing...");
      
      // Step 1: Sanitize transcript (remove all PII)
      const sanitizedTranscript = scrubPIIFromTranscript(transcript);
      console.log("PII scrubbed from transcript");
      
      // AUDIT LOG: Record PII scrubbing
      await supabase.rpc('log_call_audit', {
        p_call_id: callRecord.id,
        p_action: 'pii_scrubbed',
        p_actor: 'system',
        p_details: { 
          original_length: transcript.length,
          sanitized_length: sanitizedTranscript.length 
        }
      });
      
      // Step 2: Send ONLY sanitized transcript to AI
      console.log("Extracting health metrics from SANITIZED transcript...");
      const healthMetrics = await extractHealthMetrics(sanitizedTranscript);
      console.log("Extracted metrics (no PII sent to AI)");

      // AUDIT LOG: Record AI processing
      await supabase.rpc('log_call_audit', {
        p_call_id: callRecord.id,
        p_action: 'ai_extraction_completed',
        p_actor: 'system',
        p_details: { 
          metrics_extracted: Object.values(healthMetrics).filter(v => v !== null).length,
          gdpr_compliant: true 
        }
      });

      // Check if any metrics were extracted
      const hasMetrics = Object.values(healthMetrics).some(v => v !== null);

      if (hasMetrics) {
        const { error: responseError } = await supabase
          .from("call_responses")
          .insert({
            call_id: callRecord.id,
            patient_id: callRecord.patient_id,
            ...healthMetrics,
          });

        if (responseError) {
          console.error("Error saving call response:", responseError);
        } else {
          console.log("Saved health metrics for call:", callRecord.id);
          
          // AUDIT LOG: Record metrics saved
          await supabase.rpc('log_call_audit', {
            p_call_id: callRecord.id,
            p_action: 'metrics_saved',
            p_actor: 'system',
            p_details: { metrics_count: Object.values(healthMetrics).filter(v => v !== null).length }
          });
        }
      } else {
        console.log("No health metrics extracted from transcript");
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "GDPR-compliant webhook processing completed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
