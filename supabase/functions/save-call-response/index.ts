import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthData {
  callId: string;
  patientId: string;
  weight_kg?: number;
  height_cm?: number;
  smoking_status?: "never" | "former" | "current";
  alcohol_units_per_week?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  pulse_rate?: number;
  is_carer?: boolean;
  transcript?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const healthData: HealthData = await req.json();
    
    console.log("Saving health data:", healthData);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Save the call response
    const { data: responseData, error: responseError } = await supabase
      .from("call_responses")
      .insert({
        call_id: healthData.callId,
        patient_id: healthData.patientId,
        weight_kg: healthData.weight_kg,
        height_cm: healthData.height_cm,
        smoking_status: healthData.smoking_status,
        alcohol_units_per_week: healthData.alcohol_units_per_week,
        blood_pressure_systolic: healthData.blood_pressure_systolic,
        blood_pressure_diastolic: healthData.blood_pressure_diastolic,
        pulse_rate: healthData.pulse_rate,
        is_carer: healthData.is_carer,
      })
      .select()
      .single();

    if (responseError) {
      console.error("Error saving response:", responseError);
      throw responseError;
    }

    // Update the call with transcript if provided
    if (healthData.transcript) {
      await supabase
        .from("calls")
        .update({ transcript: healthData.transcript })
        .eq("id", healthData.callId);
    }

    console.log("Health data saved:", responseData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        responseId: responseData.id,
        message: "Health data saved successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error saving call response:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
