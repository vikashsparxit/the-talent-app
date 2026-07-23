-- ─────────────────────────────────────────────────────────────────────────────
-- Item 5: Soft-delete for candidate_interviews
-- Adds removed_from_pipeline_at + removed_by so candidates can be hidden
-- from a job's pipeline without losing their interview history.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS removed_from_pipeline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id);

-- Index for fast filtering of active (non-removed) rows
CREATE INDEX IF NOT EXISTS idx_candidate_interviews_not_removed
  ON public.candidate_interviews (job_interview_stage_id)
  WHERE removed_from_pipeline_at IS NULL;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE removed_from_pipeline_at IS NULL)  AS active_rows,
  COUNT(*) FILTER (WHERE removed_from_pipeline_at IS NOT NULL) AS removed_rows
FROM public.candidate_interviews;
