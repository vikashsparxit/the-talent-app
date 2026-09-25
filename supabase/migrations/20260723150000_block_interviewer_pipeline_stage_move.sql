-- Block interviewers from moving candidates between pipeline stages.
--
-- Stage membership lives on candidate_interviews.job_interview_stage_id
-- (candidates has no stage column). Interviewers already lack UPDATE on
-- candidates, but they have broad UPDATE on candidate_interviews for feedback.
-- That policy allows changing job_interview_stage_id (drag-drop / move).
--
-- Trigger (not RLS column restriction): reject stage_id changes unless the
-- actor is admin, HR, or recruiter. Service role (auth.uid() IS NULL) is allowed
-- so SECURITY DEFINER RPCs and backend jobs keep working.
--
-- PRESENT FOR SUPER ADMIN REVIEW — do not apply automatically.

CREATE OR REPLACE FUNCTION public.prevent_interviewer_pipeline_stage_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_interview_stage_id IS NOT DISTINCT FROM OLD.job_interview_stage_id THEN
    RETURN NEW;
  END IF;

  -- Service role / system paths (no JWT user)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_or_hr(auth.uid())
     OR public.has_role(auth.uid(), 'recruiter'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Interviewers cannot move candidates between pipeline stages'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_interviewer_pipeline_stage_move
  ON public.candidate_interviews;

CREATE TRIGGER trg_prevent_interviewer_pipeline_stage_move
  BEFORE UPDATE OF job_interview_stage_id ON public.candidate_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_interviewer_pipeline_stage_move();
