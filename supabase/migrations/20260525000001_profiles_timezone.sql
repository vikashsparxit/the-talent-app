-- Add per-user timezone preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;

-- Fix interview-scheduled notification to show IST instead of UTC.
-- SparxTalent is operated from India; IST is the canonical company timezone.
-- Future improvement: look up the interviewer's own timezone from profiles.
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
  IF NEW.scheduled_at IS NULL OR NEW.interviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
       AND NEW.interviewer_user_id IS NOT DISTINCT FROM OLD.interviewer_user_id THEN
      RETURN NEW;
    END IF;
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = OLD.interviewer_user_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || OLD.id || '%';
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  _scheduled_display := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' IST';

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
