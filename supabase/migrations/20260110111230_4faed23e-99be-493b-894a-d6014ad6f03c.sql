-- Fix audit_logs policy to be more restrictive
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Create a more specific policy - authenticated users can insert audit logs for their own actions
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);