-- Cached AI pipeline analysis per job (Reports → Analyse Pipeline).
-- Written by score-pipeline edge function; read by staff on Reports page.
-- Idempotent: safe to re-run in SQL editor if objects already exist.

CREATE TABLE IF NOT EXISTS public.pipeline_analysis_cache (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_analysis_cache_generated_at
  ON public.pipeline_analysis_cache(generated_at DESC);

ALTER TABLE public.pipeline_analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view pipeline analysis cache" ON public.pipeline_analysis_cache;
CREATE POLICY "Staff can view pipeline analysis cache"
  ON public.pipeline_analysis_cache FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Writes via service role in score-pipeline edge function only

GRANT SELECT ON public.pipeline_analysis_cache TO authenticated;
