-- Re-assigning an assessment creates a new attempt instead of failing.
--
-- Run manually after review. Not applied automatically. Until it is applied,
-- re-assigning a completed or expired assessment keeps failing with "already
-- assigned" (the app change alone cannot get past the old constraint).
--
-- The original table had UNIQUE (candidate_id, assessment_id), so a candidate
-- could only ever have one row per assessment and HR's "Re-assign / Resend"
-- after a completed or expired attempt hit a duplicate key. This replaces it
-- with a partial unique index over open attempts only ('invited' or
-- 'in_progress'): finished attempts ('completed', 'evaluated', 'expired') stay
-- as history with their answers, recordings, scores and integrity log, and a
-- new invited row can sit next to them. There can still never be two open
-- attempts of the same assessment for one candidate.
--
-- An invite whose deadline or link has passed is still 'invited' in the table
-- (nothing marks it expired). Before inserting the new attempt the app sets
-- such a row to 'expired' (status only; it was never started, so it has no
-- answers). Existing data cannot violate the new index: the old constraint
-- already allowed only one row per pair.
--
-- Rollback (fails if a candidate already has more than one attempt of an
-- assessment; those rows would need resolving first):
--   DROP INDEX IF EXISTS public.candidate_assessments_one_open_attempt;
--   ALTER TABLE public.candidate_assessments
--     ADD CONSTRAINT candidate_assessments_candidate_id_assessment_id_key
--     UNIQUE (candidate_id, assessment_id);

BEGIN;

ALTER TABLE public.candidate_assessments
  DROP CONSTRAINT IF EXISTS candidate_assessments_candidate_id_assessment_id_key;

-- Stop here if the pair is still unique under some other constraint name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.candidate_assessments'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      ) = ARRAY['assessment_id', 'candidate_id']
  ) THEN
    RAISE EXCEPTION 'candidate_assessments still has a unique constraint on (candidate_id, assessment_id); drop it by name';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_assessments_one_open_attempt
  ON public.candidate_assessments (candidate_id, assessment_id)
  WHERE status IN ('invited', 'in_progress');

-- Lookups by pair (latest attempt first) no longer have the constraint's index.
CREATE INDEX IF NOT EXISTS candidate_assessments_candidate_assessment_invited_idx
  ON public.candidate_assessments (candidate_id, assessment_id, invited_at DESC);

COMMENT ON INDEX public.candidate_assessments_one_open_attempt IS
  'At most one open (invited or in_progress) attempt per candidate and assessment; finished attempts are kept as history.';

COMMIT;
