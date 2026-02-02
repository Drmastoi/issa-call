-- Drop the restrictive policies and create a permissive one that allows anon inserts
DROP POLICY IF EXISTS "Allow insert login activity" ON public.login_activity;
DROP POLICY IF EXISTS "Authenticated users can insert login activity" ON public.login_activity;

-- Create a PERMISSIVE policy that allows anyone to insert (needed for logging failed logins before auth)
CREATE POLICY "Anyone can insert login activity"
ON public.login_activity FOR INSERT
TO anon, authenticated
WITH CHECK (true);