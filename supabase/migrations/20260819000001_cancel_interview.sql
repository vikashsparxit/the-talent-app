-- Cancel interview: void a scheduled slot without changing pipeline stage or verdict.
-- Present for super-admin review — do not apply automatically.

ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_meta jsonb;

COMMENT ON COLUMN public.candidate_interviews.cancelled_at IS
  'When the scheduled slot was cancelled. Null scheduled_at + this set means unscheduled (not no-show/reject).';

-- Merge kill-switch (default ON). Staff interviewer + panelist emails only.
UPDATE public.system_config
SET config_value = config_value || '{"interview_cancelled": true}'::jsonb,
    updated_at = now()
WHERE config_key = 'email_notification_settings'
  AND NOT (config_value ? 'interview_cancelled');

CREATE OR REPLACE FUNCTION public.cancel_interview(
  p_id uuid,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text;
  v_note text;
  v_row public.candidate_interviews%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  IF v_reason NOT IN (
    'panel_unavailable',
    'candidate_emergency',
    'candidate_withdrew_slot',
    'other'
  ) THEN
    RAISE EXCEPTION 'Invalid cancellation reason';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_row
  FROM public.candidate_interviews
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;

  v_allowed :=
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'hr'::public.app_role)
    OR public.has_role(v_uid, 'recruiter'::public.app_role)
    OR v_row.interviewer_user_id = v_uid
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interview_panelists cip
      WHERE cip.candidate_interview_id = p_id
        AND cip.interviewer_user_id = v_uid
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to cancel this interview';
  END IF;

  IF v_row.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Interview is not scheduled';
  END IF;

  IF v_row.verdict IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cancel a completed interview';
  END IF;

  UPDATE public.candidate_interviews
  SET
    scheduled_at = NULL,
    cancelled_at = now(),
    cancelled_by = v_uid,
    cancellation_reason = v_reason,
    cancellation_meta = jsonb_build_object(
      'note', v_note,
      'previous_scheduled_at', v_row.scheduled_at
    )
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_interview(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_interview(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_interview(uuid, text, text) IS
  'Voids a scheduled interview slot (same stage, no verdict). Admin/HR/recruiter, or assigned interviewer/panelist.';

CREATE OR REPLACE FUNCTION public.notify_interview_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_name text;
  v_panelist_id uuid;
  v_when text;
BEGIN
  IF NEW.cancelled_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.cancelled_at IS NOT DISTINCT FROM NEW.cancelled_at THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  v_when := to_char(
    COALESCE((NEW.cancellation_meta->>'previous_scheduled_at')::timestamptz, NEW.cancelled_at)
      AT TIME ZONE 'Asia/Kolkata',
    'DD Mon, HH12:MI AM'
  ) || ' IST';

  FOR v_panelist_id IN
    SELECT cip.interviewer_user_id
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = NEW.id
    UNION
    SELECT NEW.interviewer_user_id
    WHERE NEW.interviewer_user_id IS NOT NULL
  LOOP
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = v_panelist_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || NEW.id || '%';

    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      v_panelist_id,
      'interview_cancelled',
      'Interview Cancelled',
      'Interview with ' || COALESCE(v_candidate_name, 'a candidate')
        || ' (' || v_when || ') was cancelled'
        || ' — interview_ref:' || NEW.id,
      '/calendar'
    );
  END LOOP;

  PERFORM public.invoke_staff_email_webhook('interview_cancelled', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_interview_cancelled ON public.candidate_interviews;
CREATE TRIGGER trg_notify_interview_cancelled
  AFTER UPDATE OF cancelled_at ON public.candidate_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_interview_cancelled();
