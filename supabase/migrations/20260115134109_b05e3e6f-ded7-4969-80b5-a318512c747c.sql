-- Create call references table for anonymous call identification
CREATE TABLE public.call_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  reference_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_references ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view call references
CREATE POLICY "Authenticated users can view call references"
  ON public.call_references FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create call audit log for compliance tracking
CREATE TABLE public.call_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_audit_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view audit logs
CREATE POLICY "Authenticated users can view call audit logs"
  ON public.call_audit_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Add retention policy fields to calls table
ALTER TABLE public.calls 
  ADD COLUMN IF NOT EXISTS transcript_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_days INTEGER DEFAULT 90,
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_disclosure_played BOOLEAN DEFAULT false;

-- Function to generate unique call reference code
CREATE OR REPLACE FUNCTION public.generate_call_reference(p_call_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reference TEXT;
BEGIN
  -- Generate a short reference code
  v_reference := 'CALL-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 4));
  
  -- Insert the mapping
  INSERT INTO call_references (call_id, reference_code)
  VALUES (p_call_id, v_reference)
  ON CONFLICT (call_id) DO UPDATE SET reference_code = EXCLUDED.reference_code
  RETURNING reference_code INTO v_reference;
  
  RETURN v_reference;
END;
$$;

-- Function to log call audit events
CREATE OR REPLACE FUNCTION public.log_call_audit(
  p_call_id UUID,
  p_action TEXT,
  p_actor TEXT,
  p_details JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO call_audit_log (call_id, action, actor, details, ip_address)
  VALUES (p_call_id, p_action, p_actor, p_details, p_ip_address)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;