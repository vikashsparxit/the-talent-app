-- Speed up ILIKE '%term%' candidate name/email search (Candidates page server-side filter)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_candidates_name_trgm
  ON public.candidates USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_email_trgm
  ON public.candidates USING gin (email gin_trgm_ops);
