-- ──────────────────────────────────────────────────────────────
-- Notifications table + RLS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,   -- 'interview_scheduled' | 'verdict_submitted'
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  link        TEXT,                   -- optional route to navigate to on click
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger functions run as SECURITY DEFINER and bypass RLS, so no INSERT
-- policy is needed for internal DB inserts. Add service-role INSERT just in case.
CREATE POLICY "Service role inserts notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- Trigger 1: interview_scheduled
-- Fires when scheduled_at or interviewer_user_id is set / changed.
-- Notifies the assigned interviewer.
-- Deletes any existing unread interview_scheduled notification for the
-- same interview first (handles reschedules cleanly).
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_interview_scheduled()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _candidate_name TEXT;
  _scheduled_display TEXT;
BEGIN
  -- Only act when scheduled_at + interviewer are both set and one of them changed
  IF NEW.scheduled_at IS NULL OR NEW.interviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
       AND NEW.interviewer_user_id IS NOT DISTINCT FROM OLD.interviewer_user_id THEN
      RETURN NEW;
    END IF;
    -- Delete stale scheduled notification for this interview (reschedule case)
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = OLD.interviewer_user_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || OLD.id || '%';
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  _scheduled_display := to_char(NEW.scheduled_at, 'DD Mon, HH12:MI AM') || ' UTC';

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.interviewer_user_id,
    'interview_scheduled',
    'Interview Scheduled',
    'You have been assigned to interview ' || COALESCE(_candidate_name, 'a candidate')
      || ' on ' || _scheduled_display
      || ' — interview_ref:' || NEW.id,
    '/calendar'
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER on_interview_scheduled
  AFTER INSERT OR UPDATE ON public.candidate_interviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_interview_scheduled();


-- ──────────────────────────────────────────────────────────────
-- Trigger 2: verdict_submitted
-- Fires when verdict goes from NULL → a value.
-- Notifies all recruiters on the job (excluding the submitting interviewer).
-- ──────────────────────────────────────────────────────────────

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

  _verdict_label := CASE NEW.verdict
    WHEN 'proceeded' THEN 'Proceed ✓'
    WHEN 'rejected'  THEN 'Reject ✗'
    WHEN 'hold'      THEN 'On Hold'
    WHEN 'no_show'   THEN 'No Show'
    ELSE NEW.verdict
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

CREATE OR REPLACE TRIGGER on_verdict_submitted
  AFTER INSERT OR UPDATE ON public.candidate_interviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_verdict_submitted();
