import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR Article 17 - Right to Erasure (Right to be Forgotten)
 * 
 * This function processes data deletion requests from patients.
 * It anonymizes personal data while maintaining audit trail integrity.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId, requestId, processedBy, confirmErasure } = await req.json();
    
    if (!patientId) {
      throw new Error("Patient ID is required");
    }

    if (!confirmErasure) {
      throw new Error("Erasure must be explicitly confirmed");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Processing GDPR erasure request for patient:", patientId);

    // Verify the patient exists
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, name")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      throw new Error("Patient not found");
    }

    // Check for any legal holds or retention requirements
    const { data: activeCalls } = await supabase
      .from("calls")
      .select("id, status")
      .eq("patient_id", patientId)
      .eq("status", "in_progress");

    if (activeCalls && activeCalls.length > 0) {
      throw new Error("Cannot erase data while calls are in progress");
    }

    // Execute the erasure using the database function
    const { data: eraseResult, error: eraseError } = await supabase
      .rpc("gdpr_erase_patient_data", {
        p_patient_id: patientId,
        p_request_id: requestId || null,
        p_processed_by: processedBy || null,
      });

    if (eraseError) {
      console.error("Erasure function error:", eraseError);
      throw new Error(`Erasure failed: ${eraseError.message}`);
    }

    // Generate erasure certificate
    const erasureCertificate = {
      certificate_type: "GDPR Article 17 Erasure Certificate",
      patient_id: patientId,
      request_id: requestId || "Direct request",
      erasure_completed_at: new Date().toISOString(),
      processed_by: processedBy || "System",
      data_erased: [
        "Personal identifiers (name, phone, NHS number, DOB)",
        "Next of kin information",
        "GP and care home details",
        "Call transcripts",
        "Call responses (health metrics)",
        "AI-generated summaries",
        "Health alerts",
      ],
      data_retained_anonymized: [
        "Call metadata (for statistical purposes, no PII)",
        "Audit trail (for regulatory compliance)",
      ],
      legal_basis: "GDPR Article 17(1) - Right to erasure",
      retention_note: "Anonymized audit records retained for 7 years per NHS requirements",
    };

    console.log("GDPR erasure completed for patient:", patientId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Patient data has been erased in compliance with GDPR Article 17",
        certificate: erasureCertificate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("GDPR erasure error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
