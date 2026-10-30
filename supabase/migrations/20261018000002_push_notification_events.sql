-- ─────────────────────────────────────────────────────────────────────────────
-- In-app notifications for events that had none, so they also reach Web Push:
--
-- * interview_reminder  — 60 and 15 minutes before an interview, to the
--                         interviewer and every panelist (pg_cron, every minute)
-- * new_application     — to the recruiters on the job; repeat applications
--                         within an hour fold into the unread row
-- * candidate_assigned  — to an interviewer assigned to a candidate
-- * assessment_graded   — to the recruiters on the job once grading finishes
--
-- Assessment submission already notifies recruiters (candidate-portal,
-- type assessment_completed). Requires 20261018000001_web_push.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Interview reminders ──────────────────────────────────────────────────────

-- One row per reminder sent. scheduled_at is part of the key, so a rescheduled
-- interview gets fresh reminders.
CREATE TABLE IF NOT EXISTS public.interview_reminder_log (
  candidate_interview_id uuid        NOT NULL REFERENCES public.candidate_interviews(id) ON DELETE CASCADE,
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at           timestamptz NOT NULL,
  minutes_before         integer     NOT NULL CHECK (minutes_before IN (15, 60)),
  created_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_interview_id, user_id, scheduled_at, minutes_before)
);

ALTER TABLE public.interview_reminder_log ENABLE ROW LEVEL SECURITY;
-- No policies: written by queue_interview_reminders() only.
REVOKE ALL ON public.interview_reminder_log FROM anon, authenticated;
GRANT ALL ON public.interview_reminder_log TO service_role;

CREATE OR REPLACE FUNCTION public.queue_interview_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _n integer;
  _sent integer := 0;
BEGIN
  -- 60-minute reminder from T-60 until T-15, then the 15-minute one until the
  -- start. An interview booked less than 15 minutes ahead gets only the latter.
  FOR _r IN
    WITH due AS (
      SELECT
        ci.id,
        ci.scheduled_at,
        ci.candidate_id,
        ci.interviewer_user_id,
        CASE WHEN ci.scheduled_at <= now() + interval '15 minutes' THEN 15 ELSE 60 END AS minutes_before
      FROM public.candidate_interviews ci
      WHERE ci.scheduled_at > now()
        AND ci.scheduled_at <= now() + interval '60 minutes'
        AND ci.removed_from_pipeline_at IS NULL
        AND ci.verdict IS NULL
    ),
    recipients AS (
      SELECT d.id, d.scheduled_at, d.candidate_id, d.minutes_before, d.interviewer_user_id AS user_id
      FROM due d
      WHERE d.interviewer_user_id IS NOT NULL
      UNION
      SELECT d.id, d.scheduled_at, d.candidate_id, d.minutes_before, p.interviewer_user_id
      FROM due d
      JOIN public.candidate_interview_panelists p ON p.candidate_interview_id = d.id
    )
    SELECT r.*, c.name AS candidate_name
    FROM recipients r
    LEFT JOIN public.candidates c ON c.id = r.candidate_id
  LOOP
    INSERT INTO public.interview_reminder_log (candidate_interview_id, user_id, scheduled_at, minutes_before)
    VALUES (_r.id, _r.user_id, _r.scheduled_at, _r.minutes_before)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
    CONTINUE WHEN _n = 0;

    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      _r.user_id,
      'interview_reminder',
      CASE _r.minutes_before WHEN 15 THEN 'Interview in 15 minutes' ELSE 'Interview in 1 hour' END,
      'Interview with ' || COALESCE(_r.candidate_name, 'a candidate')
        || ' at ' || public.format_notification_time(_r.scheduled_at, _r.user_id)
        || ' — interview_ref:' || _r.id,
      '/calendar'
    );
    _sent := _sent + 1;
  END LOOP;

  DELETE FROM public.interview_reminder_log WHERE scheduled_at < now() - interval '2 days';

  RETURN _sent;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.queue_interview_reminders() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('interview-reminders', '* * * * *',
  $$SELECT public.queue_interview_reminders()$$);

-- ── New application ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_new_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _job_title text;
  _link text := '/pipeline?job=' || NEW.job_id;
BEGIN
  SELECT title INTO _job_title FROM public.jobs WHERE id = NEW.job_id;

  -- A busy job would otherwise send one push per applicant. While a recent
  -- unread row exists, update it instead of adding another.
  UPDATE public.notifications n
  SET title = 'New Applications',
      message = 'More new applications for ' || COALESCE(_job_title, 'your job')
  WHERE n.type = 'new_application'
    AND n.link = _link
    AND n.is_read = false
    AND n.created_at > now() - interval '1 hour'
    AND n.user_id IN (SELECT jr.recruiter_user_id FROM public.job_recruiters jr WHERE jr.job_id = NEW.job_id);

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT DISTINCT
    jr.recruiter_user_id,
    'new_application',
    'New Application',
    'New application for ' || COALESCE(_job_title, 'your job'),
    _link
  FROM public.job_recruiters jr
  WHERE jr.job_id = NEW.job_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = jr.recruiter_user_id
        AND n.type = 'new_application'
        AND n.link = _link
        AND n.is_read = false
        AND n.created_at > now() - interval '1 hour'
    );

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_new_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_job_application_notify ON public.job_applications;
CREATE TRIGGER on_job_application_notify
  AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_application();

-- ── Candidate assigned to an interviewer ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_candidate_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _candidate_name text;
BEGIN
  IF NEW.interviewer_user_id IS NOT DISTINCT FROM NEW.assigned_by THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.interviewer_user_id,
    'candidate_assigned',
    'Candidate Assigned',
    'You were assigned to ' || COALESCE(_candidate_name, 'a candidate'),
    '/candidates?profile=' || NEW.candidate_id
  );

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_candidate_assigned() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_candidate_interviewer_assigned ON public.candidate_interviewers;
CREATE TRIGGER on_candidate_interviewer_assigned
  AFTER INSERT ON public.candidate_interviewers
  FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_assigned();

-- ── Assessment graded ────────────────────────────────────────────────────────
-- Follows the job's notify_recruiter_on_complete setting, like the submission
-- notification sent by candidate-portal.

CREATE OR REPLACE FUNCTION public.notify_assessment_graded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _job_id uuid;
  _candidate_name text;
  _assessment_title text;
  _notify boolean;
  _result text;
BEGIN
  SELECT c.name, COALESCE(NEW.job_id, c.job_id)
  INTO _candidate_name, _job_id
  FROM public.candidates c
  WHERE c.id = NEW.candidate_id;

  IF _job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((j.assessment_config->>'notify_recruiter_on_complete')::boolean, true)
  INTO _notify
  FROM public.jobs j
  WHERE j.id = _job_id;

  IF _notify IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT title INTO _assessment_title FROM public.assessments WHERE id = NEW.assessment_id;

  _result := CASE WHEN NEW.passed THEN 'Passed' WHEN NEW.passed IS FALSE THEN 'Did not pass' ELSE 'Graded' END
    || CASE WHEN NEW.percentage IS NOT NULL THEN ' (' || round(NEW.percentage) || '%)' ELSE '' END;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT DISTINCT
    jr.recruiter_user_id,
    'assessment_graded',
    'Assessment Graded',
    left(COALESCE(_candidate_name, 'Candidate') || ', ' || COALESCE(_assessment_title, 'Assessment') || ': ' || _result, 120),
    '/evaluations?candidate=' || NEW.candidate_id
  FROM public.job_recruiters jr
  WHERE jr.job_id = _job_id;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_assessment_graded() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_assessment_graded_notify ON public.candidate_assessments;
CREATE TRIGGER on_assessment_graded_notify
  AFTER UPDATE OF grading_status ON public.candidate_assessments
  FOR EACH ROW
  WHEN (NEW.grading_status = 'graded' AND OLD.grading_status IS DISTINCT FROM 'graded')
  EXECUTE FUNCTION public.notify_assessment_graded();
