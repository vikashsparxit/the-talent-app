-- Scope interviewer/panel access to assigned jobs (not company-wide).
-- Replaces 20260722120000's broad "Interview pool can view job candidates" policy.
-- Assignment sources: candidate_interviewers, candidate_interviews.interviewer_user_id,
-- and candidate_interview_panelists.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviewers ci
    JOIN public.candidates c ON c.id = ci.candidate_id
    WHERE ci.interviewer_user_id = _user_id
      AND c.job_id = _job_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interviews civ
    JOIN public.job_interview_stages jis ON jis.id = civ.job_interview_stage_id
    WHERE civ.interviewer_user_id = _user_id
      AND jis.job_id = _job_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    JOIN public.candidate_interviews civ ON civ.id = cip.candidate_interview_id
    JOIN public.job_interview_stages jis ON jis.id = civ.job_interview_stage_id
    WHERE cip.interviewer_user_id = _user_id
      AND jis.job_id = _job_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_or_hr(_user_id)
    OR public.is_recruiter_for_job(_user_id, _job_id)
    OR public.is_interviewer_for_job(_user_id, _job_id);
$$;

-- Include panelists in candidate-level assignment checks
CREATE OR REPLACE FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidate_interviewers
    WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
  )
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviews
    WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    JOIN public.candidate_interviews civ ON civ.id = cip.candidate_interview_id
    WHERE cip.interviewer_user_id = _user_id
      AND civ.candidate_id = _candidate_id
  );
$$;

-- Pending Approval: admin/HR, job recruiters, or interviewers assigned to that job
CREATE OR REPLACE FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_or_hr(_user_id)
    OR public.is_recruiter_for_job(_user_id, _job_id)
    OR public.is_interviewer_for_job(_user_id, _job_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_interviewer_for_job(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_job_hiring(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_interviewer_for_candidate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_decide_pending_approval(uuid, uuid) TO authenticated;

-- ─── Candidates: drop company-wide pool SELECT; scope to assigned jobs ────────

DROP POLICY IF EXISTS "Interview pool can view job candidates" ON public.candidates;

DROP POLICY IF EXISTS "Interviewers can view candidates for assigned jobs" ON public.candidates;
CREATE POLICY "Interviewers can view candidates for assigned jobs"
  ON public.candidates FOR SELECT
  USING (
    candidates.job_id IS NOT NULL
    AND public.is_interviewer_for_job(auth.uid(), candidates.job_id)
  );

-- Keep per-candidate assignment policy (covers candidates with no job_id edge cases)
-- "Interviewers can view assigned candidates" already uses is_interviewer_for_candidate

-- ─── Jobs: interviewers see only assigned jobs; open-jobs policy excludes staff ─

DROP POLICY IF EXISTS "Interviewers can view assigned jobs" ON public.jobs;
CREATE POLICY "Interviewers can view assigned jobs"
  ON public.jobs FOR SELECT
  USING (public.is_interviewer_for_job(auth.uid(), jobs.id));

-- Admin/HR only — do NOT include `OR status = 'open'` (that leaked all open jobs
-- to every authenticated user, including interviewers).
DROP POLICY IF EXISTS "Admin/HR can view all jobs" ON public.jobs;
CREATE POLICY "Admin/HR can view all jobs"
  ON public.jobs FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

-- Staff must use role-specific policies (admin/HR all, recruiter assigned, interviewer assigned).
-- Anon + applicants (no staff role) still see open listings for careers.
DROP POLICY IF EXISTS "Public can view limited open job info" ON public.jobs;
DROP POLICY IF EXISTS "Public and applicants can view open jobs" ON public.jobs;
CREATE POLICY "Public and applicants can view open jobs"
  ON public.jobs FOR SELECT
  USING (
    status = 'open'::public.job_status
    AND NOT public.is_staff(auth.uid())
  );

-- ─── Assessments: stop is_staff blanket read for interviewers ────────────────

DROP POLICY IF EXISTS "Recruiters can view active assessments" ON public.assessments;

CREATE POLICY "Admin HR recruiter can view assessments"
  ON public.assessments FOR SELECT
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'::public.app_role
    )
  );

CREATE POLICY "Interviewers can view assessments for assigned work"
  ON public.assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidate_assessments ca
      WHERE ca.assessment_id = assessments.id
        AND (
          public.is_interviewer_for_candidate(auth.uid(), ca.candidate_id)
          OR EXISTS (
            SELECT 1 FROM public.candidates c
            WHERE c.id = ca.candidate_id
              AND c.job_id IS NOT NULL
              AND public.is_interviewer_for_job(auth.uid(), c.job_id)
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.default_assessment_id = assessments.id
        AND public.is_interviewer_for_job(auth.uid(), j.id)
    )
  );

DROP POLICY IF EXISTS "Recruiters can view assessment sections" ON public.assessment_sections;
CREATE POLICY "Admin HR recruiter can view assessment sections"
  ON public.assessment_sections FOR SELECT
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'::public.app_role
    )
  );

-- Interviewers already have "Interviewers can view sections for assigned candidates"

DROP POLICY IF EXISTS "Interviewers can view assigned candidate_assessments" ON public.candidate_assessments;
CREATE POLICY "Interviewers can view assigned candidate_assessments"
  ON public.candidate_assessments FOR SELECT
  USING (
    public.is_interviewer_for_candidate(auth.uid(), candidate_assessments.candidate_id)
    OR EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_assessments.candidate_id
        AND c.job_id IS NOT NULL
        AND public.is_interviewer_for_job(auth.uid(), c.job_id)
    )
  );

-- ─── Pipeline RPCs: enforce job access (SECURITY DEFINER previously leaked) ──

CREATE OR REPLACE FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_job_hiring(auth.uid(), p_job_id) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  RETURN coalesce(
    (
      SELECT array_agg(DISTINCT ci.candidate_id)
      FROM public.candidate_interviews ci
      INNER JOIN public.job_interview_stages jis
        ON jis.id = ci.job_interview_stage_id
        AND jis.job_id = p_job_id
      WHERE ci.removed_from_pipeline_at IS NULL
    ),
    ARRAY[]::uuid[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_job_pipeline_interviews(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_job_hiring(auth.uid(), p_job_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->'job_interview_stage'->>'order_index')::int ASC NULLS LAST),
    '[]'::jsonb
  )
  INTO result
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
        'hired_at', c.hired_at,
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

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_job_enrolled_candidate_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_pipeline_interviews(uuid) TO authenticated;
