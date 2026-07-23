-- Harden advance_candidate_stage: pin search_path on SECURITY DEFINER function.
-- Body matches 20260407000001_advance_candidate_transaction.sql exactly.

CREATE OR REPLACE FUNCTION public.advance_candidate_stage(
  p_candidate_id UUID,
  p_from_stage_id UUID,
  p_to_stage_id UUID,
  p_advanced_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark current stage as advanced
  UPDATE public.candidate_interviews
  SET
    advanced_by = p_advanced_by,
    advanced_at = NOW()
  WHERE
    candidate_id = p_candidate_id
    AND job_interview_stage_id = p_from_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate interview record not found for stage %', p_from_stage_id;
  END IF;

  -- Insert into next stage
  INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
  VALUES (p_candidate_id, p_to_stage_id);
END;
$$;
