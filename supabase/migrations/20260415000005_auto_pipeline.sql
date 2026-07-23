-- ──────────────────────────────────────────────────────────────
-- Auto-pipeline: default stage on job creation + auto-placement
-- ──────────────────────────────────────────────────────────────

-- ── Trigger A: Create a default "Screening" stage when a job is created ──

CREATE OR REPLACE FUNCTION public.auto_create_default_pipeline()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.job_interview_stages (job_id, stage_name, order_index, is_eliminatory)
  VALUES (NEW.id, 'Screening', 1, false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_created
  AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_default_pipeline();

-- Backfill: give existing jobs a Screening stage if they have none
INSERT INTO public.job_interview_stages (job_id, stage_name, order_index, is_eliminatory)
SELECT j.id, 'Screening', 1, false
FROM public.jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_interview_stages WHERE job_id = j.id
);


-- ── Trigger B: Place candidate in stage 1 when job_id is assigned ──

CREATE OR REPLACE FUNCTION public.auto_add_candidate_to_pipeline()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _first_stage_id UUID;
BEGIN
  -- Only act when job_id is set (new value, or changed from NULL / different job)
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id THEN RETURN NEW; END IF;

  -- Find the first stage of that job
  SELECT id INTO _first_stage_id
  FROM public.job_interview_stages
  WHERE job_id = NEW.job_id
  ORDER BY order_index ASC
  LIMIT 1;

  IF _first_stage_id IS NULL THEN RETURN NEW; END IF;

  -- Insert only if the candidate isn't already in that stage
  -- (WHERE NOT EXISTS avoids the NULL-in-unique-index edge case)
  INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
  SELECT NEW.id, _first_stage_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.candidate_interviews
    WHERE candidate_id = NEW.id
      AND job_interview_stage_id = _first_stage_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_candidate_job_assigned
  AFTER INSERT OR UPDATE OF job_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_candidate_to_pipeline();

-- Backfill: place existing candidates (with a job_id) into their job's first stage
-- if they don't already have any pipeline entry for that job
INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
SELECT c.id, jis.id
FROM public.candidates c
JOIN public.job_interview_stages jis
  ON jis.job_id = c.job_id
  AND jis.order_index = (
    SELECT MIN(order_index)
    FROM public.job_interview_stages
    WHERE job_id = c.job_id
  )
WHERE c.job_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages s ON s.id = ci.job_interview_stage_id
    WHERE ci.candidate_id = c.id
      AND s.job_id = c.job_id
  );
