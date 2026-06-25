-- ─────────────────────────────────────────────────────────────────────────────
-- Item 8: Round system for re-adding rejected candidates
--
-- Drops the UNIQUE(candidate_id, job_interview_stage_id) constraint that
-- prevents a candidate from being re-added to the same stage after rejection.
-- Adds a `round` column so Round 1 feedback is preserved as history when
-- a candidate is re-opened for Round 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add round column (backfill existing rows as Round 1)
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 1;

-- Step 2: Drop the old unique constraint (allows multiple rounds per stage)
ALTER TABLE public.candidate_interviews
  DROP CONSTRAINT IF EXISTS candidate_interviews_candidate_id_job_interview_stage_id_key;

-- Step 3: New constraint — unique per candidate + stage + round
--         (prevents duplicate submissions within the same round)
ALTER TABLE public.candidate_interviews
  ADD CONSTRAINT candidate_interviews_candidate_stage_round_key
  UNIQUE (candidate_id, job_interview_stage_id, round);

-- Index for fetching only the latest round per candidate+stage efficiently
CREATE INDEX IF NOT EXISTS idx_candidate_interviews_round
  ON public.candidate_interviews (candidate_id, job_interview_stage_id, round DESC);

-- Verify
SELECT
  COUNT(*)                        AS total_rows,
  COUNT(DISTINCT (candidate_id, job_interview_stage_id)) AS unique_candidate_stage_pairs,
  MAX(round)                      AS max_round
FROM public.candidate_interviews;
