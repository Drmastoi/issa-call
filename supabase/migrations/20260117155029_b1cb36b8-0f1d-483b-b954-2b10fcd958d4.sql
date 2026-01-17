-- Create user_consent_log table for GDPR compliance
CREATE TABLE public.user_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL, -- 'privacy_policy', 'terms_of_service', 'data_processing'
  policy_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

-- Create login_activity table for security auditing
CREATE TABLE public.login_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'login_success', 'login_failed', 'logout', 'password_reset', 'signup'
  ip_address TEXT,
  user_agent TEXT,
  location_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create active_sessions table for session management
CREATE TABLE public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token_hash TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add consent tracking columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS consent_version_accepted TEXT,
ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

-- Enable RLS on all new tables
ALTER TABLE public.user_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- RLS for user_consent_log: Users can view and insert their own consent records
CREATE POLICY "Users can view own consent log"
ON public.user_consent_log FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consent log"
ON public.user_consent_log FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- RLS for login_activity: Users can view their own login history
CREATE POLICY "Users can view own login activity"
ON public.login_activity FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins and Caldicott Guardians can view all login activity
CREATE POLICY "Admins can view all login activity"
ON public.login_activity FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'caldicott_guardian'::app_role));

-- Allow insert for login activity (used by edge function with service role)
CREATE POLICY "Allow insert login activity"
ON public.login_activity FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS for active_sessions: Users can manage their own sessions
CREATE POLICY "Users can view own sessions"
ON public.active_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions"
ON public.active_sessions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
ON public.active_sessions FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions"
ON public.active_sessions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create index for performance
CREATE INDEX idx_login_activity_user_id ON public.login_activity(user_id);
CREATE INDEX idx_login_activity_created_at ON public.login_activity(created_at DESC);
CREATE INDEX idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX idx_user_consent_log_user_id ON public.user_consent_log(user_id);