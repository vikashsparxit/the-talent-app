-- Fix for 20260424000002: the backfill failed with duplicate key because some
-- candidates have a first-stage row with removed_from_pipeline_at set.
-- The NOT EXISTS check filtered those out (looking only at active rows), but the
-- unique constraint on candidate_interviews still blocks the duplicate insert.
--
-- Fix: use ON CONFLICT DO NOTHING everywhere, and update the trigger function
-- to do the same.

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

  IF TG_OP = 'UPDATE' AND OLD.job_id IS NOT DISTINCT FROM NEW.job_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_first_stage_id
  FROM public.job_interview_stages
  WHERE job_id = NEW.job_id
  ORDER BY order_index ASC
  LIMIT 1;

  IF v_first_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Use ON CONFLICT DO NOTHING to handle cases where a row already exists
  -- (active, removed, or advanced) for this candidate+stage combo.
  INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
  VALUES (NEW.id, v_first_stage_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-run backfill with ON CONFLICT DO NOTHING so it skips already-existing rows
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
  )
ON CONFLICT DO NOTHING;
