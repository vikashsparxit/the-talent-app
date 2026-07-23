-- Allow interview-pool members (role=interviewer + can_conduct_interviews) to
-- Approve / Decline Pending Approval candidates — same outcome as admin/HR/recruiter.
-- There is no job_interviewers table; pool membership is the assignment equivalent.
-- Mutations go through SECURITY DEFINER RPCs so we do not grant broad UPDATE on candidates.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_interview_pool_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'interviewer'::public.app_role
      AND COALESCE(p.can_conduct_interviews, false) = true
  );
$$;

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
    OR public.is_interview_pool_member(_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_interview_pool_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_decide_pending_approval(uuid, uuid) TO authenticated;

-- ─── Visibility: pool interviewers can see job-assigned candidates (Pending Approval) ───

DROP POLICY IF EXISTS "Interview pool can view job candidates" ON public.candidates;
CREATE POLICY "Interview pool can view job candidates"
  ON public.candidates FOR SELECT
  USING (
    public.is_interview_pool_member(auth.uid())
    AND candidates.job_id IS NOT NULL
  );

-- ─── Approve RPC (enroll into first stage / re-open soft-removed row) ─────────

CREATE OR REPLACE FUNCTION public.approve_pending_candidate(p_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_status text;
  v_hired_at timestamptz;
  v_first_stage_id uuid;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.job_id, c.candidate_status, c.hired_at
  INTO v_job_id, v_status, v_hired_at
  FROM public.candidates c
  WHERE c.id = p_candidate_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or not assigned to a job';
  END IF;

  IF NOT public.can_decide_pending_approval(auth.uid(), v_job_id) THEN
    RAISE EXCEPTION 'Not authorized to approve pending candidates for this job';
  END IF;

  IF v_hired_at IS NOT NULL OR v_status IN ('backout', 'shortlisted', 'rejected') THEN
    RAISE EXCEPTION 'Candidate is not eligible for pending approval';
  END IF;

  SELECT jis.id
  INTO v_first_stage_id
  FROM public.job_interview_stages jis
  WHERE jis.job_id = v_job_id
  ORDER BY jis.order_index ASC
  LIMIT 1;

  IF v_first_stage_id IS NULL THEN
    RAISE EXCEPTION 'No interview stages configured for this job';
  END IF;

  SELECT ci.id
  INTO v_existing_id
  FROM public.candidate_interviews ci
  WHERE ci.candidate_id = p_candidate_id
    AND ci.job_interview_stage_id = v_first_stage_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.candidate_interviews
    SET
      removed_from_pipeline_at = NULL,
      removed_by = NULL,
      verdict = NULL,
      advanced_at = NULL,
      advanced_by = NULL,
      enrolled_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id, enrolled_at)
    VALUES (p_candidate_id, v_first_stage_id, now());
  END IF;
END;
$$;

-- ─── Decline RPC ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_pending_candidate(
  p_candidate_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_hired_at timestamptz;
  v_enrolled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.job_id, c.hired_at
  INTO v_job_id, v_hired_at
  FROM public.candidates c
  WHERE c.id = p_candidate_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or not assigned to a job';
  END IF;

  IF NOT public.can_decide_pending_approval(auth.uid(), v_job_id) THEN
    RAISE EXCEPTION 'Not authorized to decline pending candidates for this job';
  END IF;

  IF v_hired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hired candidates cannot be declined from pending approval';
  END IF;

  -- Only decline if not actively enrolled in this job's pipeline
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis
      ON jis.id = ci.job_interview_stage_id
     AND jis.job_id = v_job_id
    WHERE ci.candidate_id = p_candidate_id
      AND ci.removed_from_pipeline_at IS NULL
  ) INTO v_enrolled;

  IF v_enrolled THEN
    RAISE EXCEPTION 'Candidate is already in the interview pipeline';
  END IF;

  UPDATE public.candidates
  SET
    candidate_status = 'rejected',
    pending_approval_decline_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_candidate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_pending_candidate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_pending_candidate(uuid, text) TO authenticated;
