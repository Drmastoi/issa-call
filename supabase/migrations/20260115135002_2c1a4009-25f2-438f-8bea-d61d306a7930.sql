-- Add elevenlabs_signed_url column to calls for consent flow
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS elevenlabs_signed_url TEXT,
  ADD COLUMN IF NOT EXISTS purpose_context TEXT;