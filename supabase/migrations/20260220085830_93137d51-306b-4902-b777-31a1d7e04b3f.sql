
-- Phase 1: Add parsed profile fields to candidates table
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS parse_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_years numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidate_current_role text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidate_current_company text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enrichment_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skills_tags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamp with time zone DEFAULT NULL;

-- Add constraint for parse_score range
ALTER TABLE public.candidates
  ADD CONSTRAINT parse_score_range CHECK (parse_score >= 0 AND parse_score <= 100);

-- Add constraint for enrichment_score range  
ALTER TABLE public.candidates
  ADD CONSTRAINT enrichment_score_range CHECK (enrichment_score IS NULL OR (enrichment_score >= 0 AND enrichment_score <= 100));

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_candidates_source ON public.candidates(source);
CREATE INDEX IF NOT EXISTS idx_candidates_parse_score ON public.candidates(parse_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_enrichment_score ON public.candidates(enrichment_score DESC NULLS LAST);
