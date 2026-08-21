
-- Add suitability score columns to candidates table
ALTER TABLE public.candidates
ADD COLUMN suitability_score integer DEFAULT NULL,
ADD COLUMN suitability_analysis jsonb DEFAULT NULL,
ADD COLUMN last_analyzed_at timestamp with time zone DEFAULT NULL;
