-- Add unique constraint on call_id in call_references table
-- This is needed for the ON CONFLICT clause in generate_call_reference function
ALTER TABLE public.call_references 
ADD CONSTRAINT call_references_call_id_key UNIQUE (call_id);