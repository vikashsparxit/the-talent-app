-- Pipeline job tab counts + leaner interview RPC + bounded calendar RPC

CREATE OR REPLACE FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, candidate_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jis.job_id,
    COUNT(DISTINCT ci.candidate_id)::bigint
  FROM public.candidate_interviews ci
  INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  INNER JOIN public.candidates c ON c.id = ci.candidate_id
  WHERE jis.job_id = ANY(p_job_ids)
    AND ci.removed_from_pipeline_at IS NULL
    AND c.candidate_status NOT IN ('rejected', 'selected')
  GROUP BY jis.job_id;
$$;

CREATE OR REPLACE FUNCTION public.get_job_pipeline_interviews(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->'job_interview_stage'->>'order_index')::int ASC NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id,
      'candidate_id', ci.candidate_id,
      'job_interview_stage_id', ci.job_interview_stage_id,
      'interviewer_user_id', ci.interviewer_user_id,
      'verdict', ci.verdict,
      'overall_score', ci.overall_score,
      'rating_categories', ci.rating_categories,
      'feedback', ci.feedback,
      'artifacts', ci.artifacts,
      'interview_mode', ci.interview_mode,
      'meeting_link', ci.meeting_link,
      'scheduled_at', ci.scheduled_at,
      'completed_at', ci.completed_at,
      'advanced_by', ci.advanced_by,
      'advanced_at', ci.advanced_at,
      'interview_notes', ci.interview_notes,
      'enrolled_at', ci.enrolled_at,
      'created_at', ci.created_at,
      'updated_at', ci.updated_at,
      'sort_order', ci.sort_order,
      'round', ci.round,
      'candidate', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email,
        'role_applied', c.role_applied,
        'resume_url', c.resume_url,
        'candidate_status', c.candidate_status,
        'phone', c.phone,
        'uploaded_by', c.uploaded_by,
        'suitability_score', c.suitability_score,
        'linkedin_url', c.linkedin_url,
        'experience_years', c.experience_years,
        'candidate_current_role', c.candidate_current_role,
        'candidate_current_company', c.candidate_current_company,
        'owner', CASE
          WHEN op.user_id IS NOT NULL THEN jsonb_build_object('full_name', op.full_name)
          ELSE NULL
        END
      ),
      'job_interview_stage', jsonb_build_object(
        'id', jis.id,
        'job_id', jis.job_id,
        'stage_name', jis.stage_name,
        'order_index', jis.order_index,
        'is_eliminatory', jis.is_eliminatory
      ),
      'interviewer', CASE
        WHEN ip.user_id IS NOT NULL THEN jsonb_build_object(
          'full_name', ip.full_name,
          'email', ip.email
        )
        ELSE NULL
      END
    ) AS row_data
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis
      ON jis.id = ci.job_interview_stage_id
      AND jis.job_id = p_job_id
    INNER JOIN public.candidates c ON c.id = ci.candidate_id
    LEFT JOIN public.profiles ip ON ip.user_id = ci.interviewer_user_id
    LEFT JOIN public.profiles op ON op.user_id = c.uploaded_by
    WHERE ci.removed_from_pipeline_at IS NULL
    ORDER BY jis.order_index ASC, ci.sort_order ASC NULLS LAST, ci.created_at ASC
  ) rows;
$$;

DROP FUNCTION IF EXISTS public.get_scheduled_interviews(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_scheduled_interviews(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 800
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->>'scheduled_at') ASC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id,
      'candidate_id', ci.candidate_id,
      'job_interview_stage_id', ci.job_interview_stage_id,
      'interviewer_user_id', ci.interviewer_user_id,
      'scheduled_at', ci.scheduled_at,
      'interview_mode', ci.interview_mode,
      'meeting_link', ci.meeting_link,
      'verdict', ci.verdict,
      'candidate', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email
      ),
      'stage', jsonb_build_object(
        'id', jis.id,
        'stage_name', jis.stage_name,
        'job_id', jis.job_id,
        'job', jsonb_build_object('id', j.id, 'title', j.title)
      ),
      'interviewer', CASE
        WHEN p.user_id IS NOT NULL THEN jsonb_build_object(
          'full_name', p.full_name,
          'email', p.email
        )
        ELSE NULL
      END
    ) AS row_data,
    ci.scheduled_at
    FROM public.candidate_interviews ci
    INNER JOIN public.candidates c ON c.id = ci.candidate_id
    INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    INNER JOIN public.jobs j ON j.id = jis.job_id
    LEFT JOIN public.profiles p ON p.user_id = ci.interviewer_user_id
    WHERE ci.scheduled_at IS NOT NULL
      AND ci.removed_from_pipeline_at IS NULL
      AND (p_from IS NULL OR ci.scheduled_at >= p_from)
      AND (p_to IS NULL OR ci.scheduled_at <= p_to)
    ORDER BY ci.scheduled_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 800), 1500), 1)
  ) rows;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_job_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_interviews(timestamptz, timestamptz, int) TO authenticated;
