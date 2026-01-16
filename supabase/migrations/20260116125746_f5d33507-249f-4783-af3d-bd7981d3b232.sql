-- Add new roles to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'care_home_doctor';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gp';

-- Add RLS policies for admins to manage roles
CREATE POLICY "Admins can view all roles"
ON user_roles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles"
ON user_roles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles"
ON user_roles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles"
ON user_roles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));