
-- Add certifications, awards, and credential_score columns to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS awards jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS credential_score integer DEFAULT NULL;
