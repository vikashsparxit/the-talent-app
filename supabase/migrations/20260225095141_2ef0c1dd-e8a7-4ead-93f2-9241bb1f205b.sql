
-- Add work_experience and education JSONB columns to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS work_experience jsonb DEFAULT NULL;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS education jsonb DEFAULT NULL;
