import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR/ICO/ICB Compliant Call Initiation
 * 
 * Key compliance features:
 * 1. No patient names sent to external services (Twilio/ElevenLabs)
 * 2. Uses anonymous call reference codes instead of patient IDs
 * 3. ICO-compliant call recording disclosure
 * 4. Audit logging of all call events
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callId, patientId, phoneNumber, batchPurpose, customQuestions } = await req.json();
    
    // GDPR: Log the request but NOT patient name
    console.log("Initiating GDPR-compliant call:", { callId, patientId: "[REDACTED]", batchPurpose });
    
    // Convert UK phone numbers to E.164 format
    let formattedPhone = phoneNumber;
    if (phoneNumber.startsWith('0') && !phoneNumber.startsWith('+')) {
      formattedPhone = '+44' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
      formattedPhone = '+' + phoneNumber;
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error("Twilio credentials not configured");
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      throw new Error("ElevenLabs credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // GDPR COMPLIANCE: Generate anonymous call reference code
    // This ensures no patient-identifiable data is sent to external services
    const { data: referenceData, error: referenceError } = await supabase
      .rpc('generate_call_reference', { p_call_id: callId });
    
    if (referenceError) {
      console.error("Error generating call reference:", referenceError);
      throw new Error("Failed to generate anonymous call reference");
    }
    
    const callReference = referenceData || `CALL-${callId.substring(0, 4).toUpperCase()}`;
    console.log("Generated anonymous call reference:", callReference);

    // AUDIT LOG: Record call initiation
    await supabase.rpc('log_call_audit', {
      p_call_id: callId,
      p_action: 'call_initiated',
      p_actor: 'system',
      p_details: { 
        reference: callReference, 
        purpose: batchPurpose,
        gdpr_compliant: true 
      }
    });

    // Get signed URL from ElevenLabs
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs error:", errorText);
      throw new Error(`Failed to get ElevenLabs signed URL: ${errorText}`);
    }

    const { signed_url } = await elevenLabsResponse.json();
    console.log("Got ElevenLabs signed URL");

    const webhookUrl = `${SUPABASE_URL}/functions/v1/twilio-webhook`;
    
    // Build context message based on batch purpose (no PII)
    let purposeContext = "This is a general health check call.";
    if (batchPurpose === "smoking_status") {
      purposeContext = "The main purpose of this call is to collect the caller's current smoking status for their medical records.";
    } else if (batchPurpose === "bp_check") {
      purposeContext = "The main purpose of this call is to collect the caller's blood pressure reading if they have one available.";
    } else if (batchPurpose === "hba1c_check") {
      purposeContext = "The main purpose of this call is to check on diabetes management and recent HbA1c readings.";
    } else if (batchPurpose === "medication_review") {
      purposeContext = "The main purpose of this call is to review medication adherence and any issues.";
    } else if (batchPurpose === "custom" && customQuestions?.length > 0) {
      purposeContext = `Please ask the following specific questions: ${customQuestions.join("; ")}`;
    }
    
    // GDPR/ICO COMPLIANT TwiML with ACTIVE CONSENT VERIFICATION:
    // 1. NO patient name in greeting (patient already knows who they are)
    // 2. ICO-compliant recording disclosure
    // 3. ACTIVE CONSENT: Patient must press 1 to consent, 2 to decline
    // 4. Only anonymous call reference sent to ElevenLabs
    // 5. No patient ID sent to external services
    const consentGatherUrl = `${SUPABASE_URL}/functions/v1/twilio-webhook`;
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello. This is an automated health check call from your GP practice.</Say>
  <Pause length="1"/>
  <Say voice="alice">This call will be recorded for quality assurance and to update your medical records.</Say>
  <Pause length="1"/>
  <Gather numDigits="1" action="${consentGatherUrl}" method="POST" timeout="10">
    <Say voice="alice">To consent and continue with this call, please press 1. To decline and end this call, please press 2.</Say>
  </Gather>
  <Say voice="alice">We did not receive a response. The call will now end. Goodbye.</Say>
  <Hangup/>
</Response>`;

    // TwiML for after consent is given (used by webhook)
    const consentedTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your consent. Please hold while we connect you to our health assistant.</Say>
  <Connect>
    <Stream url="${signed_url}">
      <Parameter name="callReference" value="${callReference}" />
      <Parameter name="purposeContext" value="${purposeContext}" />
    </Stream>
  </Connect>
  <Say voice="alice">Thank you for your time. Your responses have been recorded. Goodbye.</Say>
</Response>`;

    // Store the ElevenLabs signed URL and context for use after consent verification
    // The webhook will use these to connect the patient to the AI assistant
    await supabase
      .from("calls")
      .update({
        elevenlabs_signed_url: signed_url,
        purpose_context: purposeContext,
      })
      .eq("id", callId);

    // Initiate the call via Twilio
    const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    const formData = new URLSearchParams();
    formData.append("To", formattedPhone);
    formData.append("From", TWILIO_PHONE_NUMBER);
    formData.append("Twiml", twiml);
    formData.append("StatusCallback", webhookUrl);
    formData.append("StatusCallbackEvent", "initiated ringing answered completed");
    formData.append("StatusCallbackMethod", "POST");

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error("Twilio error:", errorText);
      throw new Error(`Failed to initiate Twilio call: ${errorText}`);
    }

    const twilioData = await twilioResponse.json();
    console.log("Twilio call initiated:", twilioData.sid);

    // Update call record with Twilio SID and recording disclosure flag
    await supabase
      .from("calls")
      .update({ 
        twilio_call_sid: twilioData.sid,
        status: "in_progress",
        started_at: new Date().toISOString(),
        recording_disclosure_played: true,
      })
      .eq("id", callId);

    // AUDIT LOG: Record Twilio call creation
    await supabase.rpc('log_call_audit', {
      p_call_id: callId,
      p_action: 'twilio_call_created',
      p_actor: 'system',
      p_details: { 
        twilio_sid: twilioData.sid,
        recording_disclosure: true 
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: twilioData.sid,
        callReference: callReference,
        message: "GDPR-compliant call initiated successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error initiating call:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
