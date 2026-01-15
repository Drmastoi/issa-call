-- Create role enum
CREATE TYPE public.app_role AS ENUM ('staff', 'admin', 'caldicott_guardian');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is Caldicott Guardian
CREATE OR REPLACE FUNCTION public.is_caldicott_guardian(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'caldicott_guardian')
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Caldicott Guardians can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'caldicott_guardian'));

CREATE POLICY "Caldicott Guardians can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'caldicott_guardian'))
WITH CHECK (public.has_role(auth.uid(), 'caldicott_guardian'));

-- Create data_sharing_requests table for Caldicott Guardian approval
CREATE TABLE public.data_sharing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID REFERENCES auth.users(id) NOT NULL,
    patient_id UUID REFERENCES public.patients(id) NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('external_share', 'research', 'third_party', 'clinical_handover')),
    recipient_organization TEXT NOT NULL,
    purpose TEXT NOT NULL,
    data_categories TEXT[] NOT NULL,
    legal_basis TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on data_sharing_requests
ALTER TABLE public.data_sharing_requests ENABLE ROW LEVEL SECURITY;

-- Staff can view their own requests
CREATE POLICY "Staff can view their own data sharing requests"
ON public.data_sharing_requests
FOR SELECT
USING (auth.uid() = requested_by);

-- Staff can create requests
CREATE POLICY "Staff can create data sharing requests"
ON public.data_sharing_requests
FOR INSERT
WITH CHECK (auth.uid() = requested_by);

-- Caldicott Guardians can view all requests
CREATE POLICY "Caldicott Guardians can view all data sharing requests"
ON public.data_sharing_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'caldicott_guardian'));

-- Caldicott Guardians can update requests (approve/reject)
CREATE POLICY "Caldicott Guardians can review data sharing requests"
ON public.data_sharing_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'caldicott_guardian'));

-- Enhanced audit visibility for Caldicott Guardians
CREATE POLICY "Caldicott Guardians can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'caldicott_guardian'));

CREATE POLICY "Caldicott Guardians can view all patient access logs"
ON public.patient_access_log
FOR SELECT
USING (public.has_role(auth.uid(), 'caldicott_guardian'));

-- Function to approve/reject data sharing request
CREATE OR REPLACE FUNCTION public.review_data_sharing_request(
    p_request_id UUID,
    p_decision TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reviewer_id UUID;
BEGIN
    v_reviewer_id := auth.uid();
    
    -- Check if user is Caldicott Guardian
    IF NOT public.has_role(v_reviewer_id, 'caldicott_guardian') THEN
        RAISE EXCEPTION 'Only Caldicott Guardians can review data sharing requests';
    END IF;
    
    -- Update the request
    UPDATE public.data_sharing_requests
    SET 
        status = p_decision,
        reviewed_by = v_reviewer_id,
        reviewed_at = now(),
        review_notes = p_notes,
        expires_at = CASE WHEN p_decision = 'approved' THEN now() + INTERVAL '30 days' ELSE NULL END
    WHERE id = p_request_id
      AND status = 'pending';
    
    -- Log the review action
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
    VALUES (
        'data_sharing_' || p_decision,
        'data_sharing_request',
        p_request_id,
        v_reviewer_id,
        jsonb_build_object('notes', p_notes)
    );
    
    RETURN FOUND;
END;
$$;

-- Migrate existing is_caldicott_guardian from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'caldicott_guardian'::app_role
FROM public.profiles
WHERE is_caldicott_guardian = true
ON CONFLICT (user_id, role) DO NOTHING;