-- Explicit hire signal: set when a candidate is marked hired (pipeline or talent database).
-- candidate_status = 'shortlisted' remains the terminal status; hired_at records when.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS hired_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidates_hired_at
  ON public.candidates (hired_at)
  WHERE hired_at IS NOT NULL;

COMMENT ON COLUMN public.candidates.hired_at IS
  'Timestamp when the candidate was officially marked hired. NULL = not yet hired.';
