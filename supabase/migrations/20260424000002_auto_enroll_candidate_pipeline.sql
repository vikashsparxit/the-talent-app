-- Auto-enroll candidates into the first pipeline stage when they are linked to a job.
-- Previously this only happened when a template was applied; now it fires for every
-- candidate INSERT or UPDATE that sets job_id.

CREATE OR REPLACE FUNCTION public.auto_enroll_candidate_in_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_stage_id UUID;
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: skip if job_id did not change
  IF TG_OP = 'UPDATE' AND OLD.job_id IS NOT DISTINCT FROM NEW.job_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_first_stage_id
  FROM public.job_interview_stages
  WHERE job_id = NEW.job_id
  ORDER BY order_index ASC
  LIMIT 1;

  -- No pipeline stages configured for this job yet — skip silently
  IF v_first_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enroll if the candidate has no active (non-removed) pipeline entry for this job
  IF NOT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.candidate_id = NEW.id
      AND jis.job_id = NEW.job_id
      AND ci.removed_from_pipeline_at IS NULL
  ) THEN
    INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
    VALUES (NEW.id, v_first_stage_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_enroll_candidate_pipeline
AFTER INSERT OR UPDATE OF job_id ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.auto_enroll_candidate_in_pipeline();

-- Backfill: enroll existing candidates who have a job_id but no active pipeline entry
INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
SELECT c.id, first_stage.id
FROM public.candidates c
JOIN LATERAL (
  SELECT id
  FROM public.job_interview_stages
  WHERE job_id = c.job_id
  ORDER BY order_index ASC
  LIMIT 1
) first_stage ON true
WHERE c.job_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.candidate_id = c.id
      AND jis.job_id = c.job_id
      AND ci.removed_from_pipeline_at IS NULL
  );
