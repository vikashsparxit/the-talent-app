-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: notify_verdict_submitted trigger causes 22P02 enum cast error
--
-- Root cause: CASE NEW.verdict WHEN ... THEN 'Proceed ✓' ELSE NEW.verdict END
-- The ELSE branch returns interview_verdict (enum), which forces PostgreSQL to
-- unify all THEN branch TEXT literals to interview_verdict at runtime.
-- 'Proceed ✓', 'Reject ✗' etc. are not valid enum values → 22P02 error fires
-- every time an interviewer submits feedback.
--
-- Fix: cast ELSE branch to TEXT so the CASE expression resolves to TEXT, not enum.
-- Safe to run multiple times (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_verdict_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _candidate_name TEXT;
  _verdict_label  TEXT;
BEGIN
  -- Only on first-time verdict set (NULL → value)
  IF NEW.verdict IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.verdict IS NOT NULL THEN RETURN NEW; END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;

  -- Cast ELSE to TEXT so the CASE result type is TEXT, not interview_verdict enum.
  -- Without ::TEXT, PostgreSQL tries to unify TEXT literals ('Proceed ✓' etc.)
  -- to interview_verdict and fails with 22P02.
  _verdict_label := CASE NEW.verdict
    WHEN 'proceeded' THEN 'Proceed ✓'
    WHEN 'rejected'  THEN 'Reject ✗'
    WHEN 'hold'      THEN 'On Hold'
    WHEN 'no_show'   THEN 'No Show'
    ELSE NEW.verdict::TEXT
  END;

  -- Notify every recruiter on the job, except the person who submitted the feedback
  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT
    jr.recruiter_user_id,
    'verdict_submitted',
    'Interview Feedback Submitted',
    COALESCE(_candidate_name, 'A candidate') || ': ' || _verdict_label,
    '/pipeline'
  FROM public.job_interview_stages jis
  JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
  WHERE jis.id = NEW.job_interview_stage_id
    AND jr.recruiter_user_id IS DISTINCT FROM NEW.interviewer_user_id;

  RETURN NEW;
END;
$function$;
