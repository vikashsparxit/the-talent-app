-- Change overall_score from smallint (1-10 slider) to numeric(3,1) (1-5 category average).
-- The old check constraint allowed 1-10; the new one allows 1-5 with one decimal place.

ALTER TABLE public.candidate_interviews
  DROP CONSTRAINT IF EXISTS candidate_interviews_overall_score_check;

ALTER TABLE public.candidate_interviews
  ALTER COLUMN overall_score TYPE numeric(3,1) USING overall_score::numeric(3,1);

ALTER TABLE public.candidate_interviews
  ADD CONSTRAINT candidate_interviews_overall_score_check
  CHECK (overall_score IS NULL OR (overall_score >= 1 AND overall_score <= 5));
