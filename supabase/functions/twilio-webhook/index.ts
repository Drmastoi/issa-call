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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse form data from Twilio webhook
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const callDuration = formData.get("CallDuration") as string;
    const digits = formData.get("Digits") as string;
    
    console.log("Twilio webhook received:", { callSid, callStatus, callDuration, digits });

    // Handle Gather response (consent verification)
    if (digits) {
      console.log("Processing consent digits:", digits);
      
      // Find the call by Twilio SID to get the ElevenLabs signed URL
      const { data: callData, error: callError } = await supabase
        .from("calls")
        .select("id, elevenlabs_signed_url, purpose_context")
        .eq("twilio_call_sid", callSid)
        .single();

      if (callError) {
        console.error("Error finding call:", callError);
      }

      if (digits === "1") {
        // User consented - connect to ElevenLabs
        console.log("User consented, connecting to ElevenLabs");
        
        if (callData) {
          // Update call with consent information
          await supabase
            .from("calls")
            .update({
              consent_verified: true,
              consent_given_at: new Date().toISOString(),
              consent_method: "dtmf_keypress",
            })
            .eq("id", callData.id);

          // Log consent in audit
          await supabase.rpc('log_call_audit', {
            p_call_id: callData.id,
            p_action: 'consent_given',
            p_actor: 'patient',
            p_details: { method: 'dtmf_keypress', digit: '1' }
          });

          const signedUrl = callData.elevenlabs_signed_url;
          const purposeContext = callData.purpose_context || "general health check";

          if (signedUrl) {
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
            const consentAudioUrl = `${SUPABASE_URL}/functions/v1/consent-audio`;
            
            // Return TwiML to connect to ElevenLabs with natural voice
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
            
            console.log("Returning ElevenLabs connect TwiML");
            return new Response(twiml, { 
              headers: { 
                ...corsHeaders, 
                "Content-Type": "text/xml" 
              } 
            });
          } else {
            console.error("No ElevenLabs signed URL found for call");
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, but we're experiencing technical difficulties. Please try again later. Goodbye.</Say>
  <Hangup/>
</Response>`;
            return new Response(twiml, { 
              headers: { 
                ...corsHeaders, 
                "Content-Type": "text/xml" 
              } 
            });
          }
        }
      } else if (digits === "2") {
        // User declined
        console.log("User declined consent");
        
        if (callData) {
          await supabase
            .from("calls")
            .update({
              consent_verified: false,
              status: "declined",
              ended_at: new Date().toISOString(),
            })
            .eq("id", callData.id);

          // Log decline in audit
          await supabase.rpc('log_call_audit', {
            p_call_id: callData.id,
            p_action: 'consent_declined',
            p_actor: 'patient',
            p_details: { method: 'dtmf_keypress', digit: '2' }
          });
        }

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const consentAudioUrl = `${SUPABASE_URL}/functions/v1/consent-audio`;
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${consentAudioUrl}?type=declined</Play>
  <Hangup/>
</Response>`;
        
        return new Response(twiml, { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "text/xml" 
          } 
        });
      } else {
        // Invalid input - ask again
        console.log("Invalid digit received:", digits);
        const consentAudioUrl = `${SUPABASE_URL}/functions/v1/consent-audio`;
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${SUPABASE_URL}/functions/v1/twilio-webhook" method="POST" timeout="10">
    <Play>${consentAudioUrl}?type=invalid_input</Play>
  </Gather>
  <Play>${consentAudioUrl}?type=no_response</Play>
  <Hangup/>
</Response>`;
        
        return new Response(twiml, { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "text/xml" 
          } 
        });
      }
    }

    // Handle status callbacks (no digits - just status updates)
    if (callStatus) {
      // Map Twilio status to our status
      const statusMap: Record<string, string> = {
        "initiated": "in_progress",
        "ringing": "in_progress",
        "in-progress": "in_progress",
        "answered": "in_progress",
        "completed": "completed",
        "busy": "no_answer",
        "no-answer": "no_answer",
        "failed": "failed",
        "canceled": "failed",
      };

      const ourStatus = statusMap[callStatus] || "failed";
      
      // Find the call by Twilio SID and update it
      const updateData: Record<string, unknown> = {
        status: ourStatus,
      };

      if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer") {
        updateData.ended_at = new Date().toISOString();
        if (callDuration) {
          updateData.duration_seconds = parseInt(callDuration, 10);
        }
      }

      const { data, error } = await supabase
        .from("calls")
        .update(updateData)
        .eq("twilio_call_sid", callSid)
        .select()
        .single();

      if (error) {
        console.error("Error updating call:", error);
      } else {
        console.log("Call updated:", data?.id);
      }
    }

    // Return empty TwiML response for status callbacks
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/xml" 
        } 
      }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">An error occurred. Goodbye.</Say><Hangup/></Response>',
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/xml" 
        } 
      }
    );
  }
});
