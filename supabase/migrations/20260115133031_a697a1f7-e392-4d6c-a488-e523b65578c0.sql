-- Create patient pseudonyms table for anonymous ID mapping
CREATE TABLE public.patient_pseudonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  anonymous_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

-- Create index for fast lookups
CREATE INDEX idx_patient_pseudonyms_patient_id ON public.patient_pseudonyms(patient_id);
CREATE INDEX idx_patient_pseudonyms_anonymous_id ON public.patient_pseudonyms(anonymous_id);

-- Enable RLS but NO policies = only service role can access
ALTER TABLE public.patient_pseudonyms ENABLE ROW LEVEL SECURITY;

-- Function to get or create anonymous ID for a patient
CREATE OR REPLACE FUNCTION public.get_anonymous_id(p_patient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymous_id UUID;
BEGIN
  -- Try to get existing anonymous ID
  SELECT anonymous_id INTO v_anonymous_id
  FROM patient_pseudonyms
  WHERE patient_id = p_patient_id;
  
  -- If not found, create new mapping
  IF v_anonymous_id IS NULL THEN
    INSERT INTO patient_pseudonyms (patient_id)
    VALUES (p_patient_id)
    RETURNING anonymous_id INTO v_anonymous_id;
  END IF;
  
  RETURN v_anonymous_id;
END;
$$;

-- Function to resolve anonymous ID back to patient ID (service role only)
CREATE OR REPLACE FUNCTION public.resolve_anonymous_id(p_anonymous_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT patient_id INTO v_patient_id
  FROM patient_pseudonyms
  WHERE anonymous_id = p_anonymous_id;
  
  RETURN v_patient_id;
END;
$$;

-- Create anonymized analytics view for AI consumption
CREATE OR REPLACE VIEW public.analytics_aggregate AS
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

-- Create anonymized call metrics view
CREATE OR REPLACE VIEW public.call_analytics_aggregate AS
SELECT
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_calls,
  ROUND(AVG(duration_seconds)::numeric, 0) as avg_duration_seconds,
  DATE_TRUNC('day', created_at) as call_date
FROM public.calls
GROUP BY DATE_TRUNC('day', created_at);

-- Create anonymized health alerts aggregate
CREATE OR REPLACE VIEW public.alerts_analytics_aggregate AS
SELECT
  alert_type,
  severity,
  COUNT(*) as alert_count,
  COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) as acknowledged_count,
  DATE_TRUNC('day', created_at) as alert_date
FROM public.health_alerts
GROUP BY alert_type, severity, DATE_TRUNC('day', created_at);