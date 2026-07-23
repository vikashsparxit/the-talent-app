
-- Auto-enroll candidate into first pipeline stage when job_id is set/changed
CREATE OR REPLACE FUNCTION public.auto_enroll_candidate_in_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _first_stage_id uuid;
BEGIN
  -- Only act when job_id is newly set or changed
  IF NEW.job_id IS NOT NULL AND (OLD.job_id IS NULL OR OLD.job_id != NEW.job_id) THEN
    -- Find the first stage (lowest order_index) for this job
    SELECT id INTO _first_stage_id
    FROM public.job_interview_stages
    WHERE job_id = NEW.job_id
    ORDER BY order_index ASC
    LIMIT 1;

    -- If the job has stages configured and candidate doesn't already have an interview for this job
    IF _first_stage_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE ci.candidate_id = NEW.id AND jis.job_id = NEW.job_id
    ) THEN
      INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id, sort_order)
      VALUES (NEW.id, _first_stage_id, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to candidates table
CREATE TRIGGER trg_auto_enroll_pipeline
AFTER UPDATE OF job_id ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.auto_enroll_candidate_in_pipeline();

-- Also fire on INSERT (new candidates with a job_id)
CREATE TRIGGER trg_auto_enroll_pipeline_insert
AFTER INSERT ON public.candidates
FOR EACH ROW
WHEN (NEW.job_id IS NOT NULL)
EXECUTE FUNCTION public.auto_enroll_candidate_in_pipeline();
