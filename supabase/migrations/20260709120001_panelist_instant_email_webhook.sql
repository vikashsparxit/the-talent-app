-- ─────────────────────────────────────────────────────────────────────────────
-- Panelist instant email — invoke staff email webhook when panelist added
--
-- Extends notify_panelist_added() to fan out interview_scheduled email to
-- newly added panelists (in-app notification already existed).
-- No role filter — admins assigned as panelists receive emails too.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_panelist_added()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _scheduled_at timestamptz;
  _candidate_id uuid;
  _candidate_name TEXT;
  _scheduled_display TEXT;
BEGIN
  SELECT ci.scheduled_at, ci.candidate_id
  INTO _scheduled_at, _candidate_id
  FROM public.candidate_interviews ci
  WHERE ci.id = NEW.candidate_interview_id;

  IF _scheduled_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = _candidate_id;
  _scheduled_display := to_char(_scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' IST';

  DELETE FROM public.notifications
  WHERE type = 'interview_scheduled'
    AND user_id = NEW.interviewer_user_id
    AND is_read = false
    AND message LIKE '%interview_ref:' || NEW.candidate_interview_id || '%';

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.interviewer_user_id,
    'interview_scheduled',
    'Interview Scheduled',
    'You have been assigned to interview ' || COALESCE(_candidate_name, 'a candidate')
      || ' on ' || _scheduled_display
      || ' — interview_ref:' || NEW.candidate_interview_id,
    '/calendar'
  );

  PERFORM public.invoke_staff_email_webhook('interview_scheduled', NEW.candidate_interview_id);

  RETURN NEW;
END;
$function$;
