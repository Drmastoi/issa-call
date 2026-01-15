import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR Article 15 - Right of Access
 * 
 * This function exports all patient data in a portable format
 * allowing data subjects to receive their personal data.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId, requestId } = await req.json();
    
    if (!patientId) {
      throw new Error("Patient ID is required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Processing GDPR data export request for patient:", patientId);

    // Fetch all patient data
    const [
      patientResult,
      callsResult,
      responsesResult,
      alertsResult,
      summariesResult,
      auditResult
    ] = await Promise.all([
      // Patient profile
      supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .single(),
      
      // All calls (without transcript for security, include metadata)
      supabase
        .from("calls")
        .select("id, status, created_at, started_at, ended_at, duration_seconds, attempt_number")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      
      // Call responses (health metrics)
      supabase
        .from("call_responses")
        .select("*")
        .eq("patient_id", patientId)
        .order("collected_at", { ascending: false }),
      
      // Health alerts
      supabase
        .from("health_alerts")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      
      // AI summaries (clinical only, no PII)
      supabase
        .from("ai_summaries")
        .select("clinical_summary, key_findings, action_items, qof_relevance, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      
      // Audit log entries related to this patient
      supabase
        .from("audit_logs")
        .select("action, entity_type, created_at, details")
        .eq("entity_id", patientId)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    // Compile the export package
    const exportData = {
      export_metadata: {
        generated_at: new Date().toISOString(),
        gdpr_article: "Article 15 - Right of Access",
        patient_id: patientId,
        request_id: requestId || null,
      },
      personal_data: patientResult.data ? {
        name: patientResult.data.name,
        phone_number: patientResult.data.phone_number,
        nhs_number: patientResult.data.nhs_number,
        date_of_birth: patientResult.data.date_of_birth,
        gp_practice: patientResult.data.gp_practice,
        gp_name: patientResult.data.gp_name,
        care_home_name: patientResult.data.care_home_name,
        next_of_kin: {
          name: patientResult.data.next_of_kin_name,
          phone: patientResult.data.next_of_kin_phone,
          relationship: patientResult.data.next_of_kin_relationship,
        },
        communication_needs: patientResult.data.communication_needs,
        preferred_call_time: patientResult.data.preferred_call_time,
        created_at: patientResult.data.created_at,
        updated_at: patientResult.data.updated_at,
      } : null,
      health_data: {
        conditions: patientResult.data?.conditions || [],
        medications: patientResult.data?.medications || [],
        allergies: patientResult.data?.allergies || [],
        frailty_status: patientResult.data?.frailty_status,
        mobility_status: patientResult.data?.mobility_status,
        dnacpr_status: patientResult.data?.dnacpr_status,
        hba1c: {
          value: patientResult.data?.hba1c_mmol_mol,
          date: patientResult.data?.hba1c_date,
        },
        cholesterol: {
          hdl: patientResult.data?.cholesterol_hdl,
          ldl: patientResult.data?.cholesterol_ldl,
          date: patientResult.data?.cholesterol_date,
        },
      },
      call_history: {
        total_calls: callsResult.data?.length || 0,
        calls: callsResult.data || [],
      },
      collected_health_metrics: responsesResult.data || [],
      health_alerts: alertsResult.data || [],
      clinical_summaries: summariesResult.data || [],
      data_access_log: auditResult.data || [],
      data_processors: [
        {
          name: "Twilio",
          purpose: "Telephone call infrastructure",
          data_processed: "Phone number (for call routing only)",
        },
        {
          name: "ElevenLabs",
          purpose: "AI voice assistant",
          data_processed: "Voice audio (processed in real-time, not stored)",
        },
        {
          name: "Lovable AI Gateway",
          purpose: "Health metric extraction",
          data_processed: "Anonymized transcript (PII removed before processing)",
        },
      ],
      your_rights: {
        right_to_rectification: "You can request corrections to your data",
        right_to_erasure: "You can request deletion of your data (Article 17)",
        right_to_restrict_processing: "You can request we limit how we use your data",
        right_to_data_portability: "You can request your data in a machine-readable format",
        right_to_object: "You can object to certain processing activities",
        contact: "Contact your GP practice Data Protection Officer for any requests",
      },
    };

    // Log the export in audit trail
    await supabase
      .from("audit_logs")
      .insert({
        action: "gdpr_data_export",
        entity_type: "patient",
        entity_id: patientId,
        details: { 
          request_id: requestId,
          export_generated_at: new Date().toISOString(),
        },
      });

    // If there's a request ID, update its status
    if (requestId) {
      await supabase
        .from("data_subject_requests")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          response_data: { export_generated: true },
        })
        .eq("id", requestId);
    }

    console.log("GDPR data export completed for patient:", patientId);

    return new Response(
      JSON.stringify(exportData),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="gdpr-export-${patientId}.json"`,
        } 
      }
    );

  } catch (error) {
    console.error("GDPR export error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
