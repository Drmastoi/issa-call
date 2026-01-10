-- Create health_alerts table for AI-generated risk alerts
CREATE TABLE public.health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'high_bp', 'weight_change', 'high_alcohol', 'obesity', 'pattern'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metrics JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ai_summaries table for clinical call summaries
CREATE TABLE public.ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinical_summary TEXT NOT NULL,
  key_findings JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  qof_relevance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create emis_read_codes table for QOF/SNOMED mapping
CREATE TABLE public.emis_read_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL UNIQUE,
  read_code TEXT NOT NULL,
  snomed_code TEXT,
  description TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.health_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emis_read_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for health_alerts
CREATE POLICY "Users can view all health alerts" ON public.health_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create health alerts" ON public.health_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update health alerts" ON public.health_alerts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete health alerts" ON public.health_alerts FOR DELETE TO authenticated USING (true);

-- RLS policies for ai_summaries
CREATE POLICY "Users can view all AI summaries" ON public.ai_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create AI summaries" ON public.ai_summaries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can delete AI summaries" ON public.ai_summaries FOR DELETE TO authenticated USING (true);

-- RLS policies for emis_read_codes (read-only for users)
CREATE POLICY "Users can view read codes" ON public.emis_read_codes FOR SELECT TO authenticated USING (true);

-- Insert standard QOF/EMIS read codes
INSERT INTO public.emis_read_codes (metric_type, read_code, snomed_code, description) VALUES
  ('blood_pressure', '246.', '75367002', 'Blood pressure reading'),
  ('hypertension_monitoring', 'XaJ4k', '401311000000103', 'Hypertension monitoring'),
  ('smoking_status', '1375.', '365981007', 'Smoking status'),
  ('smoking_cessation', '8CAL.', '710081004', 'Smoking cessation advice'),
  ('bmi', '22K..', '60621009', 'Body mass index'),
  ('weight', '22A..', '27113001', 'Weight'),
  ('height', '229..', '50373000', 'Height'),
  ('alcohol_consumption', '136..', '228273003', 'Alcohol consumption'),
  ('alcohol_advice', '8CAM.', '413473000', 'Alcohol consumption advice');

-- Create indexes for performance
CREATE INDEX idx_health_alerts_patient ON public.health_alerts(patient_id);
CREATE INDEX idx_health_alerts_severity ON public.health_alerts(severity) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_health_alerts_created ON public.health_alerts(created_at DESC);
CREATE INDEX idx_ai_summaries_patient ON public.ai_summaries(patient_id);
CREATE INDEX idx_ai_summaries_call ON public.ai_summaries(call_id);