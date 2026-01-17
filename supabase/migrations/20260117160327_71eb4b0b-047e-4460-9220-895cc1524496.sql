-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own consent log" ON public.user_consent_log;
DROP POLICY IF EXISTS "Users can insert own consent" ON public.user_consent_log;
DROP POLICY IF EXISTS "Users can view own login activity" ON public.login_activity;
DROP POLICY IF EXISTS "Admins can view all login activity" ON public.login_activity;
DROP POLICY IF EXISTS "System can insert login activity" ON public.login_activity;
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.active_sessions;

-- Create open policies for all authenticated users
CREATE POLICY "Authenticated users can view consent logs"
ON public.user_consent_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert consent"
ON public.user_consent_log FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view login activity"
ON public.login_activity FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert login activity"
ON public.login_activity FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can manage sessions"
ON public.active_sessions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also open profiles table for all authenticated users
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (true);