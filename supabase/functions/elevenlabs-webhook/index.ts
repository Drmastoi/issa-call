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

async function extractHealthMetrics(transcript: string): Promise<HealthMetrics> {
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

  const systemPrompt = `You are a medical data extraction assistant. Extract health metrics from call transcripts.

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
          { role: "user", content: `Extract health metrics from this call transcript:\n\n${transcript}` }
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
    
    // Clean up the response (remove markdown code blocks if present)
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    console.log("AI extracted metrics:", cleanedContent);
    
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("ElevenLabs webhook received:", JSON.stringify(payload, null, 2));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Extract relevant data from ElevenLabs webhook
    // The exact structure depends on ElevenLabs webhook format
    const {
      conversation_id,
      call_id, // Custom parameter we passed
      patient_id, // Custom parameter we passed
      transcript,
      status,
      duration_seconds,
      metadata,
    } = payload;

    // Try to find call by our custom callId parameter or by conversation_id
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
      // Try to find by twilio_call_sid or other identifier
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("twilio_call_sid", conversation_id)
        .single();
      callRecord = data;
    }

    if (!callRecord) {
      console.log("Call record not found, webhook data:", { call_id, conversation_id });
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received but call not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found call record:", callRecord.id);

    // Update the call record with transcript and status
    const updateData: Record<string, unknown> = {
      ended_at: new Date().toISOString(),
    };

    if (transcript) {
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

    // If we have a transcript, extract health metrics and save response
    if (transcript && transcript.length > 50) {
      console.log("Extracting health metrics from transcript...");
      const healthMetrics = await extractHealthMetrics(transcript);
      console.log("Extracted metrics:", healthMetrics);

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
        }
      } else {
        console.log("No health metrics extracted from transcript");
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed successfully" }),
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
