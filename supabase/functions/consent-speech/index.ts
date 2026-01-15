import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Words/phrases that indicate consent
const CONSENT_PHRASES = [
  "yes", "yeah", "yep", "yup", "aye", "sure", "okay", "ok", "alright",
  "i agree", "i consent", "that's fine", "go ahead", "please continue",
  "i'm happy", "happy to", "fine", "correct", "right", "absolutely",
  "of course", "certainly", "definitely", "proceed", "continue"
];

// Words/phrases that indicate refusal
const REFUSAL_PHRASES = [
  "no", "nope", "nah", "never", "don't", "do not", "i decline",
  "i refuse", "not interested", "no thank you", "no thanks",
  "i disagree", "stop", "hang up", "goodbye", "bye"
];

function detectConsent(transcript: string): "consent" | "decline" | "unclear" {
  const lower = transcript.toLowerCase().trim();
  
  // Check for consent phrases
  for (const phrase of CONSENT_PHRASES) {
    if (lower.includes(phrase)) {
      return "consent";
    }
  }
  
  // Check for refusal phrases
  for (const phrase of REFUSAL_PHRASES) {
    if (lower.includes(phrase)) {
      return "decline";
    }
  }
  
  return "unclear";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse form data from Twilio <Record> callback
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const recordingUrl = formData.get("RecordingUrl") as string;
    const recordingSid = formData.get("RecordingSid") as string;
    const speechResult = formData.get("SpeechResult") as string; // From <Gather input="speech">
    
    console.log("Consent speech handler received:", { callSid, recordingSid, speechResult });

    // Find the call
    const { data: callData, error: callError } = await supabase
      .from("calls")
      .select("id, elevenlabs_signed_url, purpose_context")
      .eq("twilio_call_sid", callSid)
      .single();

    if (callError || !callData) {
      console.error("Error finding call:", callError);
      const consentAudioUrl = `${SUPABASE_URL}/functions/v1/consent-audio`;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=error</Play>
  <Hangup/>
</Response>`;
      return new Response(twiml, { 
        headers: { ...corsHeaders, "Content-Type": "text/xml" } 
      });
    }

    const consentAudioUrl = `${SUPABASE_URL}/functions/v1/consent-audio`;
    const consentResult = detectConsent(speechResult || "");
    
    console.log("Speech result:", speechResult);
    console.log("Consent detection:", consentResult);

    if (consentResult === "consent") {
      // User gave verbal consent
      console.log("Verbal consent detected");
      
      await supabase
        .from("calls")
        .update({
          consent_verified: true,
          consent_given_at: new Date().toISOString(),
          consent_method: "verbal",
        })
        .eq("id", callData.id);

      // Log consent in audit
      await supabase.rpc('log_call_audit', {
        p_call_id: callData.id,
        p_action: 'consent_given',
        p_actor: 'patient',
        p_details: { 
          method: 'verbal', 
          speech_result: speechResult,
          detected_as: 'consent'
        }
      });

      const signedUrl = callData.elevenlabs_signed_url;
      const purposeContext = callData.purpose_context || "general health check";

      if (signedUrl) {
        // Connect to ElevenLabs AI assistant
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=thank_you</Play>
  <Connect>
    <Stream url="${signedUrl}">
      <Parameter name="purposeContext" value="${purposeContext}" />
    </Stream>
  </Connect>
  <Play>${consentAudioUrl}?type=goodbye</Play>
</Response>`;
        
        return new Response(twiml, { 
          headers: { ...corsHeaders, "Content-Type": "text/xml" } 
        });
      } else {
        console.error("No ElevenLabs signed URL found");
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=error</Play>
  <Hangup/>
</Response>`;
        return new Response(twiml, { 
          headers: { ...corsHeaders, "Content-Type": "text/xml" } 
        });
      }
    } else if (consentResult === "decline") {
      // User declined verbally
      console.log("Verbal decline detected");
      
      await supabase
        .from("calls")
        .update({
          consent_verified: false,
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callData.id);

      await supabase.rpc('log_call_audit', {
        p_call_id: callData.id,
        p_action: 'consent_declined',
        p_actor: 'patient',
        p_details: { 
          method: 'verbal', 
          speech_result: speechResult,
          detected_as: 'decline'
        }
      });

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=declined</Play>
  <Hangup/>
</Response>`;
      
      return new Response(twiml, { 
        headers: { ...corsHeaders, "Content-Type": "text/xml" } 
      });
    } else {
      // Unclear response - ask again with clarification
      console.log("Unclear response, asking again");
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=unclear_response</Play>
  <Gather input="speech" action="${SUPABASE_URL}/functions/v1/consent-speech" method="POST" timeout="8" speechTimeout="auto" language="en-GB">
    <Play>${consentAudioUrl}?type=consent_verbal</Play>
  </Gather>
  <Play>${consentAudioUrl}?type=no_response</Play>
  <Hangup/>
</Response>`;
      
      return new Response(twiml, { 
        headers: { ...corsHeaders, "Content-Type": "text/xml" } 
      });
    }

  } catch (error) {
    console.error("Consent speech error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">An error occurred. Goodbye.</Say><Hangup/></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }
});