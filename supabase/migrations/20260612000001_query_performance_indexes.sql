-- Query performance indexes (Supabase Query Performance advisor, Jun 2026)
-- Review before applying on production.

-- Chitragupta dedup: reference_id + violation_type WHERE open (~600k lookups)
CREATE INDEX IF NOT EXISTS idx_chitra_escalations_reference_open
  ON public.chitra_escalations (reference_id, violation_type)
  WHERE resolved_at IS NULL;

-- Candidates list / pagination ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_candidates_created_at_desc
  ON public.candidates (created_at DESC);

-- Jobs page ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_jobs_created_at_desc
  ON public.jobs (created_at DESC);

-- Pipeline interviews filtered by stage + active rows
CREATE INDEX IF NOT EXISTS idx_candidate_interviews_active_stage
  ON public.candidate_interviews (job_interview_stage_id)
  WHERE removed_from_pipeline_at IS NULL;
