-- Add new fields for AI-extracted patient data from uploaded summaries
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS dnacpr_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dnacpr_date timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_of_kin_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_of_kin_phone text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_of_kin_relationship text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gp_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gp_practice text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS care_home_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mobility_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dietary_requirements text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS communication_needs text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_extracted_summary text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_extracted_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.patients.dnacpr_status IS 'Do Not Attempt CPR status (e.g., "In Place", "Not in Place", "Unknown")';
COMMENT ON COLUMN public.patients.allergies IS 'Array of known allergies extracted from patient documents';
COMMENT ON COLUMN public.patients.ai_extracted_summary IS 'AI-generated summary from uploaded patient documents';