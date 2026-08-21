-- Reports job listing: aggregate pipeline stats server-side (avoids fetching all interview rows)

CREATE OR REPLACE FUNCTION public.get_reports_job_pipeline_stats()
RETURNS TABLE (
  job_id UUID,
  in_pipeline BIGINT,
  proceeded BIGINT,
  pending BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    jis.job_id,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ci.verdict = 'proceeded')::BIGINT,
    COUNT(*) FILTER (WHERE ci.scheduled_at IS NOT NULL AND ci.verdict IS NULL)::BIGINT
  FROM public.candidate_interviews ci
  JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  JOIN public.jobs j ON j.id = jis.job_id
  WHERE ci.removed_from_pipeline_at IS NULL
    AND j.status <> 'closed'
  GROUP BY jis.job_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_job_pipeline_stats() TO authenticated;
