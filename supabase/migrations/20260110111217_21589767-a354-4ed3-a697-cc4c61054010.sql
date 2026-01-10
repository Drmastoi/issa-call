-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create patients table
CREATE TABLE public.patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  nhs_number TEXT,
  preferred_call_time TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on patients
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Patients policies (all authenticated users can access)
CREATE POLICY "Authenticated users can view patients" ON public.patients FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create patients" ON public.patients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update patients" ON public.patients FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete patients" ON public.patients FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create call_batches table
CREATE TABLE public.call_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time_start TIME NOT NULL DEFAULT '09:00',
  scheduled_time_end TIME NOT NULL DEFAULT '17:00',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  retry_attempts INTEGER NOT NULL DEFAULT 3,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on call_batches
ALTER TABLE public.call_batches ENABLE ROW LEVEL SECURITY;

-- Call batches policies
CREATE POLICY "Authenticated users can view batches" ON public.call_batches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create batches" ON public.call_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update batches" ON public.call_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete batches" ON public.call_batches FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create batch_patients junction table
CREATE TABLE public.batch_patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.call_batches(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(batch_id, patient_id)
);

-- Enable RLS on batch_patients
ALTER TABLE public.batch_patients ENABLE ROW LEVEL SECURITY;

-- Batch patients policies
CREATE POLICY "Authenticated users can view batch_patients" ON public.batch_patients FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create batch_patients" ON public.batch_patients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete batch_patients" ON public.batch_patients FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create calls table
CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.call_batches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'no_answer', 'callback_requested')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  twilio_call_sid TEXT,
  transcript TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on calls
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Calls policies
CREATE POLICY "Authenticated users can view calls" ON public.calls FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create calls" ON public.calls FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update calls" ON public.calls FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create call_responses table for health data
CREATE TABLE public.call_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,2),
  smoking_status TEXT CHECK (smoking_status IN ('never', 'former', 'current')),
  alcohol_units_per_week INTEGER,
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  pulse_rate INTEGER,
  is_carer BOOLEAN,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on call_responses
ALTER TABLE public.call_responses ENABLE ROW LEVEL SECURITY;

-- Call responses policies
CREATE POLICY "Authenticated users can view call_responses" ON public.call_responses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create call_responses" ON public.call_responses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs policies (only admins can view, system can insert)
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_call_batches_updated_at BEFORE UPDATE ON public.call_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for auto-creating profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();