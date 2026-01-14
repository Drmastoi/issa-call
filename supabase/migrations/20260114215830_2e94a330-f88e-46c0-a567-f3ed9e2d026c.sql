-- Add batch purpose columns to call_batches
ALTER TABLE call_batches
ADD COLUMN purpose text DEFAULT 'qof_review',
ADD COLUMN custom_questions text[],
ADD COLUMN target_qof_indicators text[];