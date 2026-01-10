-- Add DELETE policy for calls table
CREATE POLICY "Authenticated users can delete calls"
ON public.calls
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Add UPDATE policy for batch_patients table
CREATE POLICY "Authenticated users can update batch_patients"
ON public.batch_patients
FOR UPDATE
USING (auth.uid() IS NOT NULL);