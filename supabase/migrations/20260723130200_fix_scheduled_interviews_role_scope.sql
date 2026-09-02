-- Fix: get_scheduled_interviews (SECURITY DEFINER) returned every scheduled
-- interview to any authenticated caller. Interview Calendar used this RPC, so
-- interviewers (e.g. Rahul Sharma) saw all company slots, not only theirs.
--
-- Scope matches candidate_interviews SELECT RLS + recruiter job assignment:
--   Admin/HR  → all
--   Recruiter → interviews on jobs in job_recruiters
--   Interviewer / panelist / candidate_interviewers → related interviews only

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
      END,
      'panelists', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', pp.user_id,
            'full_name', pp.full_name,
            'email', pp.email
          )
          ORDER BY cip.created_at ASC
        )
        FROM public.candidate_interview_panelists cip
        JOIN public.profiles pp ON pp.user_id = cip.interviewer_user_id
        WHERE cip.candidate_interview_id = ci.id
      ), '[]'::jsonb)
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
      AND (
        public.is_admin_or_hr(auth.uid())
        OR public.is_recruiter_for_job(auth.uid(), jis.job_id)
        OR ci.interviewer_user_id = auth.uid()
        OR public.is_panelist_for_interview(auth.uid(), ci.id)
        OR public.is_assigned_interviewer_for_interview(auth.uid(), ci.id)
      )
    ORDER BY ci.scheduled_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 800), 1500), 1)
  ) rows;
$$;

GRANT EXECUTE ON FUNCTION public.get_scheduled_interviews(timestamptz, timestamptz, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
