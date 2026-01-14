-- Add clinical data fields to patients table for QOF tracking
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS conditions text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS medications text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS hba1c_mmol_mol numeric,
ADD COLUMN IF NOT EXISTS hba1c_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS cholesterol_ldl numeric,
ADD COLUMN IF NOT EXISTS cholesterol_hdl numeric,
ADD COLUMN IF NOT EXISTS cholesterol_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS frailty_status text,
ADD COLUMN IF NOT EXISTS last_review_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS cha2ds2_vasc_score integer;

-- Add comments for documentation
COMMENT ON COLUMN public.patients.conditions IS 'Array of clinical conditions e.g. CHD, Diabetes, Hypertension, COPD, Asthma, AF, Stroke, CKD, SMI, Dementia';
COMMENT ON COLUMN public.patients.medications IS 'Array of current medications e.g. Statin, ACE-I, ARB, Beta-blocker, DOAC, Anticoagulant';
COMMENT ON COLUMN public.patients.hba1c_mmol_mol IS 'Latest HbA1c result in mmol/mol';
COMMENT ON COLUMN public.patients.frailty_status IS 'Frailty status: none, mild, moderate, severe';
COMMENT ON COLUMN public.patients.cha2ds2_vasc_score IS 'CHA2DS2-VASc score for AF patients (0-9)';

-- Create index for condition searches
CREATE INDEX IF NOT EXISTS idx_patients_conditions ON public.patients USING GIN(conditions);
CREATE INDEX IF NOT EXISTS idx_patients_medications ON public.patients USING GIN(medications);