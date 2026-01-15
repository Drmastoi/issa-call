import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GDPR Article 5(1)(e) - Storage Limitation
 * 
 * This function runs on a schedule to clean up expired transcripts
 * and enforce data retention policies.
 * 
 * Default retention: 90 days for transcripts
 * Configurable per-call via retention_days column
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Starting retention cleanup job...");

    // Execute the cleanup function
    const { data: deletedCount, error: cleanupError } = await supabase
      .rpc("cleanup_expired_transcripts");

    if (cleanupError) {
      console.error("Cleanup function error:", cleanupError);
      throw new Error(`Cleanup failed: ${cleanupError.message}`);
    }

    console.log(`Retention cleanup completed. Transcripts deleted: ${deletedCount}`);

    // Also clean up old audit logs (keep 7 years for NHS compliance)
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

    const { data: deletedAuditLogs, error: auditError } = await supabase
      .from("audit_logs")
      .delete()
      .lt("created_at", sevenYearsAgo.toISOString())
      .select("id");

    const auditLogsDeleted = deletedAuditLogs?.length || 0;
    
    if (auditError) {
      console.warn("Audit log cleanup warning:", auditError);
    } else {
      console.log(`Old audit logs deleted: ${auditLogsDeleted}`);
    }

    // Clean up old call audit logs (same 7 year retention)
    const { data: deletedCallAuditLogs, error: callAuditError } = await supabase
      .from("call_audit_log")
      .delete()
      .lt("created_at", sevenYearsAgo.toISOString())
      .select("id");

    const callAuditLogsDeleted = deletedCallAuditLogs?.length || 0;

    if (callAuditError) {
      console.warn("Call audit log cleanup warning:", callAuditError);
    }

    // Clean up completed data subject requests older than 3 years
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const { data: deletedRequests, error: requestsError } = await supabase
      .from("data_subject_requests")
      .delete()
      .eq("status", "completed")
      .lt("processed_at", threeYearsAgo.toISOString())
      .select("id");

    const requestsDeleted = deletedRequests?.length || 0;

    if (requestsError) {
      console.warn("Data subject requests cleanup warning:", requestsError);
    }

    // Log the cleanup summary
    await supabase
      .from("audit_logs")
      .insert({
        action: "scheduled_retention_cleanup",
        entity_type: "system",
        details: {
          transcripts_deleted: deletedCount,
          audit_logs_deleted: auditLogsDeleted,
          call_audit_logs_deleted: callAuditLogsDeleted,
          data_requests_deleted: requestsDeleted,
          run_at: new Date().toISOString(),
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Retention cleanup completed",
        summary: {
          transcripts_deleted: deletedCount,
          audit_logs_deleted: auditLogsDeleted,
          call_audit_logs_deleted: callAuditLogsDeleted,
          data_requests_deleted: requestsDeleted,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Retention cleanup error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
