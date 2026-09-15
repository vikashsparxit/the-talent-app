-- Add token expiry to candidate assessments.
-- Existing tokens get a 30-day grace period from now.
ALTER TABLE public.candidate_assessments
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE;

-- Back-fill existing rows: expire 30 days from now
UPDATE public.candidate_assessments
SET token_expires_at = NOW() + INTERVAL '30 days'
WHERE token_expires_at IS NULL;
