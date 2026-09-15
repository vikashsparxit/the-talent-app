
-- Add work_experience and education JSONB columns to applicant_profiles
ALTER TABLE public.applicant_profiles
ADD COLUMN work_experience jsonb DEFAULT '[]'::jsonb,
ADD COLUMN education jsonb DEFAULT '[]'::jsonb;
