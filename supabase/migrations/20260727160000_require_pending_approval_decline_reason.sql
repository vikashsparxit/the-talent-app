-- Require a non-empty decline reason for Pending Approval declines.
-- Present for super-admin review — do not apply automatically.

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
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A decline reason is required';
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
    pending_approval_decline_reason = v_reason
  WHERE id = p_candidate_id;
END;
$$;
