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
    const { batchId } = await req.json();
    
    console.log("Processing batch:", batchId);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get the batch details
    const { data: batch, error: batchError } = await supabase
      .from("call_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      throw new Error("Batch not found");
    }

    // Get patients in this batch
    const { data: batchPatients, error: patientsError } = await supabase
      .from("batch_patients")
      .select(`
        id,
        priority,
        patient_id,
        patients (id, name, phone_number)
      `)
      .eq("batch_id", batchId)
      .order("priority");

    if (patientsError) {
      throw patientsError;
    }

    console.log(`Found ${batchPatients?.length || 0} patients in batch`);

    // Update batch status to in_progress
    await supabase
      .from("call_batches")
      .update({ status: "in_progress" })
      .eq("id", batchId);

    // Create call records for each patient
    const callRecords = [];
    for (const bp of batchPatients || []) {
      const patient = bp.patients as any;
      
      // Create a call record
      const { data: callData, error: callError } = await supabase
        .from("calls")
        .insert({
          patient_id: patient.id,
          batch_id: batchId,
          status: "pending",
          attempt_number: 1,
        })
        .select()
        .single();

      if (callError) {
        console.error("Error creating call:", callError);
        continue;
      }

      callRecords.push({
        callId: callData.id,
        patientId: patient.id,
        patientName: patient.name,
        phoneNumber: patient.phone_number,
      });
    }

    // Start processing calls with delay between each
    // In production, you'd use a queue system for better reliability
    const results = [];
    for (const callInfo of callRecords) {
      try {
        // Call the initiate-call function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/initiate-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(callInfo),
        });

        const result = await response.json();
        results.push({ ...callInfo, result });

        // Add delay between calls (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (err) {
        console.error("Error initiating call:", err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        results.push({ ...callInfo, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId,
        callsInitiated: results.length,
        results,
        message: "Batch processing started" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing batch:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
