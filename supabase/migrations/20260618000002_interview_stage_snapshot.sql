-- Snapshot interview stage at schedule/feedback time so history does not change
-- when the candidate moves pipeline stages later (drag-drop or advance).

ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS stage_name_snapshot TEXT;

-- Backfill from current FK (best effort — rows already mutated by drag-drop may be wrong).
UPDATE public.candidate_interviews ci
SET stage_name_snapshot = jis.stage_name
FROM public.job_interview_stages jis
WHERE jis.id = ci.job_interview_stage_id
  AND ci.stage_name_snapshot IS NULL;

-- On insert: capture stage name when not supplied by the app.
CREATE OR REPLACE FUNCTION public.candidate_interviews_snapshot_stage_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_name_snapshot IS NULL AND NEW.job_interview_stage_id IS NOT NULL THEN
    SELECT jis.stage_name
    INTO NEW.stage_name_snapshot
    FROM public.job_interview_stages jis
    WHERE jis.id = NEW.job_interview_stage_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_interviews_snapshot_stage_on_insert
  ON public.candidate_interviews;

CREATE TRIGGER candidate_interviews_snapshot_stage_on_insert
  BEFORE INSERT ON public.candidate_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.candidate_interviews_snapshot_stage_on_insert();

-- After feedback: freeze snapshot and stage_id so pipeline moves cannot rewrite history.
CREATE OR REPLACE FUNCTION public.candidate_interviews_freeze_completed_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.verdict IS NULL AND NEW.verdict IS NOT NULL AND NEW.stage_name_snapshot IS NULL THEN
    SELECT jis.stage_name
    INTO NEW.stage_name_snapshot
    FROM public.job_interview_stages jis
    WHERE jis.id = NEW.job_interview_stage_id;
  END IF;

  IF OLD.stage_name_snapshot IS NOT NULL THEN
    NEW.stage_name_snapshot := OLD.stage_name_snapshot;
  END IF;

  IF OLD.verdict IS NOT NULL
     AND NEW.job_interview_stage_id IS DISTINCT FROM OLD.job_interview_stage_id THEN
    NEW.job_interview_stage_id := OLD.job_interview_stage_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_interviews_freeze_completed_stage
  ON public.candidate_interviews;

CREATE TRIGGER candidate_interviews_freeze_completed_stage
  BEFORE UPDATE ON public.candidate_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.candidate_interviews_freeze_completed_stage();
