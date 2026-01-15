-- Create patient access log table for ICO/CQC Regulation 17 compliance
CREATE TABLE public.patient_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  user_id UUID,
  access_type TEXT NOT NULL CHECK (access_type IN ('view', 'edit', 'export', 'delete')),
  accessed_fields TEXT[],
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_access_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view access logs
CREATE POLICY "Authenticated users can view patient access logs"
  ON public.patient_access_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Add Caldicott Guardian role to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_caldicott_guardian BOOLEAN DEFAULT false;

-- Function to log patient access
CREATE OR REPLACE FUNCTION public.log_patient_access(
  p_patient_id UUID,
  p_user_id UUID,
  p_access_type TEXT,
  p_accessed_fields TEXT[] DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO patient_access_log (patient_id, user_id, access_type, accessed_fields, ip_address, user_agent)
  VALUES (p_patient_id, p_user_id, p_access_type, p_accessed_fields, p_ip_address, p_user_agent)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to clear sensitive temporary data after call completion
CREATE OR REPLACE FUNCTION public.clear_call_sensitive_data(p_call_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Clear the ElevenLabs signed URL (temporary, should not persist)
  UPDATE calls
  SET elevenlabs_signed_url = NULL
  WHERE id = p_call_id
    AND status IN ('completed', 'failed', 'no_answer', 'declined');
  
  RETURN FOUND;
END;
$$;

-- Create trigger to auto-clear sensitive data when call completes
CREATE OR REPLACE FUNCTION public.trigger_clear_call_sensitive_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'no_answer', 'declined') 
     AND OLD.status NOT IN ('completed', 'failed', 'no_answer', 'declined') THEN
    NEW.elevenlabs_signed_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_call_sensitive_data_trigger ON public.calls;
CREATE TRIGGER clear_call_sensitive_data_trigger
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_clear_call_sensitive_data();