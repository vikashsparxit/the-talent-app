-- Pending approval tab badges: count unenrolled candidates per open job

CREATE OR REPLACE FUNCTION public.get_pending_approval_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, pending_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.job_id,
    COUNT(*)::bigint AS pending_count
  FROM public.candidates c
  WHERE c.job_id = ANY(p_job_ids)
    AND c.candidate_status NOT IN ('backout', 'shortlisted')
    AND NOT EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      INNER JOIN public.job_interview_stages jis
        ON jis.id = ci.job_interview_stage_id
        AND jis.job_id = c.job_id
      WHERE ci.candidate_id = c.id
        AND ci.removed_from_pipeline_at IS NULL
    )
  GROUP BY c.job_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approval_counts(uuid[]) TO authenticated;
