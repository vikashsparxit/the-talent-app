-- Add AI-generated summary field to candidates.
-- Populated by the enrich-profile edge function (recruiter/admin facing only).
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;
