-- Fix security definer views by recreating with security_invoker
DROP VIEW IF EXISTS public.analytics_aggregate;
DROP VIEW IF EXISTS public.call_analytics_aggregate;
DROP VIEW IF EXISTS public.alerts_analytics_aggregate;

-- Recreate with SECURITY INVOKER (default, but explicit)
CREATE VIEW public.analytics_aggregate 
WITH (security_invoker = true)
AS
SELECT 
  COUNT(*) as total_patients,
  COUNT(*) FILTER (WHERE 'diabetes' = ANY(conditions)) as diabetes_count,
  COUNT(*) FILTER (WHERE 'hypertension' = ANY(conditions)) as hypertension_count,
  COUNT(*) FILTER (WHERE 'copd' = ANY(conditions)) as copd_count,
  COUNT(*) FILTER (WHERE 'asthma' = ANY(conditions)) as asthma_count,
  COUNT(*) FILTER (WHERE 'chd' = ANY(conditions)) as chd_count,
  COUNT(*) FILTER (WHERE 'af' = ANY(conditions) OR 'atrial fibrillation' = ANY(conditions)) as af_count,
  COUNT(*) FILTER (WHERE frailty_status = 'mild') as frailty_mild_count,
  COUNT(*) FILTER (WHERE frailty_status = 'moderate') as frailty_moderate_count,
  COUNT(*) FILTER (WHERE frailty_status = 'severe') as frailty_severe_count,
  ROUND(AVG(hba1c_mmol_mol)::numeric, 1) as avg_hba1c,
  COUNT(*) FILTER (WHERE hba1c_mmol_mol > 58) as hba1c_above_target_count,
  COUNT(*) FILTER (WHERE last_review_date > now() - interval '12 months') as reviewed_last_year
FROM public.patients;

CREATE VIEW public.call_analytics_aggregate
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_calls,
  ROUND(AVG(duration_seconds)::numeric, 0) as avg_duration_seconds,
  DATE_TRUNC('day', created_at) as call_date
FROM public.calls
GROUP BY DATE_TRUNC('day', created_at);

CREATE VIEW public.alerts_analytics_aggregate
WITH (security_invoker = true)
AS
SELECT
  alert_type,
  severity,
  COUNT(*) as alert_count,
  COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) as acknowledged_count,
  DATE_TRUNC('day', created_at) as alert_date
FROM public.health_alerts
GROUP BY alert_type, severity, DATE_TRUNC('day', created_at);