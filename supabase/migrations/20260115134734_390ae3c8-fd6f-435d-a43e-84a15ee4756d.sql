-- Enable required extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add clinical validation status to call_responses (CQC Regulation 12)
ALTER TABLE public.call_responses 
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_by UUID,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clinical_notes TEXT;

-- Create GDPR data subject requests table (Articles 15, 17)
CREATE TABLE public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'erasure', 'rectification', 'portability')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  response_data JSONB,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view/manage requests
CREATE POLICY "Authenticated users can view data subject requests"
  ON public.data_subject_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert data subject requests"
  ON public.data_subject_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update data subject requests"
  ON public.data_subject_requests FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Add consent tracking to calls table
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_method TEXT;

-- Create function to verify clinical metrics
CREATE OR REPLACE FUNCTION public.verify_call_response(
  p_response_id UUID,
  p_verified_by UUID,
  p_clinical_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE call_responses
  SET 
    verification_status = 'verified',
    verified_by = p_verified_by,
    verified_at = now(),
    clinical_notes = COALESCE(p_clinical_notes, clinical_notes)
  WHERE id = p_response_id;
  
  -- Log the verification
  INSERT INTO call_audit_log (call_id, action, actor, details)
  SELECT 
    call_id, 
    'clinical_verification',
    p_verified_by::text,
    jsonb_build_object('response_id', p_response_id, 'notes', p_clinical_notes)
  FROM call_responses WHERE id = p_response_id;
  
  RETURN FOUND;
END;
$$;

-- Create function to reject clinical metrics
CREATE OR REPLACE FUNCTION public.reject_call_response(
  p_response_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE call_responses
  SET 
    verification_status = 'rejected',
    verified_by = p_rejected_by,
    verified_at = now(),
    clinical_notes = p_rejection_reason
  WHERE id = p_response_id;
  
  -- Log the rejection
  INSERT INTO call_audit_log (call_id, action, actor, details)
  SELECT 
    call_id, 
    'clinical_rejection',
    p_rejected_by::text,
    jsonb_build_object('response_id', p_response_id, 'reason', p_rejection_reason)
  FROM call_responses WHERE id = p_response_id;
  
  RETURN FOUND;
END;
$$;

-- Create function for GDPR data erasure (Article 17)
CREATE OR REPLACE FUNCTION public.gdpr_erase_patient_data(
  p_patient_id UUID,
  p_request_id UUID,
  p_processed_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete call responses
  DELETE FROM call_responses WHERE patient_id = p_patient_id;
  
  -- Delete transcripts from calls (keep anonymized metadata for audit)
  UPDATE calls 
  SET transcript = NULL, transcript_deleted_at = now()
  WHERE patient_id = p_patient_id;
  
  -- Delete AI summaries
  DELETE FROM ai_summaries WHERE patient_id = p_patient_id;
  
  -- Delete health alerts
  DELETE FROM health_alerts WHERE patient_id = p_patient_id;
  
  -- Anonymize patient record (keep for audit, remove PII)
  UPDATE patients
  SET 
    name = 'GDPR_ERASED',
    phone_number = '0000000000',
    nhs_number = NULL,
    date_of_birth = NULL,
    notes = 'Data erased under GDPR Article 17 request',
    next_of_kin_name = NULL,
    next_of_kin_phone = NULL,
    gp_name = NULL,
    care_home_name = NULL
  WHERE id = p_patient_id;
  
  -- Update the request status
  UPDATE data_subject_requests
  SET 
    status = 'completed',
    processed_at = now(),
    processed_by = p_processed_by
  WHERE id = p_request_id;
  
  -- Log the erasure
  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'gdpr_erasure',
    'patient',
    p_patient_id::text,
    p_processed_by,
    jsonb_build_object('request_id', p_request_id)
  );
  
  RETURN TRUE;
END;
$$;

-- Create retention cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_transcripts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE calls
    SET 
      transcript = NULL,
      transcript_deleted_at = now()
    WHERE 
      transcript IS NOT NULL
      AND transcript_deleted_at IS NULL
      AND created_at < now() - (COALESCE(retention_days, 90) || ' days')::interval
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM updated;
  
  -- Log the cleanup
  INSERT INTO audit_logs (action, entity_type, details)
  VALUES (
    'retention_cleanup',
    'calls',
    jsonb_build_object('transcripts_deleted', deleted_count, 'run_at', now())
  );
  
  RETURN deleted_count;
END;
$$;