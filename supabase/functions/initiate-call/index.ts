import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callId, patientId, patientName, phoneNumber, batchPurpose, customQuestions } = await req.json();
    
    // Convert UK phone numbers to E.164 format
    let formattedPhone = phoneNumber;
    if (phoneNumber.startsWith('0') && !phoneNumber.startsWith('+')) {
      // UK number starting with 0 - convert to +44
      formattedPhone = '+44' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
      // Add + if missing
      formattedPhone = '+' + phoneNumber;
    }
    
    console.log("Initiating call:", { callId, patientId, patientName, phoneNumber, formattedPhone, batchPurpose });

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

    // Create Supabase client for database updates
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get a signed URL from ElevenLabs for the conversation
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

    // Create TwiML for connecting the call to ElevenLabs
    // Using Twilio's <Stream> to connect audio to ElevenLabs WebSocket
    const webhookUrl = `${SUPABASE_URL}/functions/v1/twilio-webhook`;
    
    // Build context message based on batch purpose
    let purposeContext = "This is a general health check call.";
    if (batchPurpose === "smoking_status") {
      purposeContext = "The main purpose of this call is to collect the patient's current smoking status for their medical records.";
    } else if (batchPurpose === "bp_check") {
      purposeContext = "The main purpose of this call is to collect the patient's blood pressure reading if they have one available.";
    } else if (batchPurpose === "hba1c_check") {
      purposeContext = "The main purpose of this call is to check on the patient's diabetes management and recent HbA1c readings.";
    } else if (batchPurpose === "medication_review") {
      purposeContext = "The main purpose of this call is to review the patient's medication adherence and any issues they may have.";
    } else if (batchPurpose === "custom" && customQuestions?.length > 0) {
      purposeContext = `Please ask the following specific questions: ${customQuestions.join("; ")}`;
    }
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello ${patientName}. This is an automated health check call from your GP practice. Please hold while we connect you to our health assistant.</Say>
  <Connect>
    <Stream url="${signed_url}">
      <Parameter name="callId" value="${callId}" />
      <Parameter name="patientId" value="${patientId}" />
      <Parameter name="patientName" value="${patientName}" />
      <Parameter name="purposeContext" value="${purposeContext}" />
    </Stream>
  </Connect>
  <Say voice="alice">Thank you for your time. The call has ended. Goodbye.</Say>
</Response>`;

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

    // Update call record with Twilio SID
    await supabase
      .from("calls")
      .update({ 
        twilio_call_sid: twilioData.sid,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", callId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: twilioData.sid,
        message: "Call initiated successfully" 
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
