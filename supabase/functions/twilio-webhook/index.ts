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
    
    console.log("Twilio webhook received:", { callSid, callStatus, callDuration });

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

    // Return empty TwiML response
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
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/xml" 
        } 
      }
    );
  }
});
