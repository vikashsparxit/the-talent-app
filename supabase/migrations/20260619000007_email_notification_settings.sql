-- Per-type email notification toggles + server-side hire email trigger

-- ── Notification type toggles (admin Settings UI) ─────────────────────────────

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'email_notification_settings',
  '{
    "candidate_hired_staff": true,
    "candidate_hired_applicant": true,
    "candidate_rejected": true,
    "chitra_warning": true,
    "chitra_praise": true,
    "chitra_daily_report": true,
    "chitra_weekly_report": true,
    "interview_scheduled": true,
    "assignment_completed": true
  }'::jsonb,
  'Per-type email notification toggles (admin can enable/disable each category)'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Admin read email notification settings" ON public.system_config;
CREATE POLICY "Admin read email notification settings"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key = 'email_notification_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin update email notification settings" ON public.system_config;
CREATE POLICY "Admin update email notification settings"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key = 'email_notification_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    config_key = 'email_notification_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin insert email notification settings" ON public.system_config;
CREATE POLICY "Admin insert email notification settings"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key = 'email_notification_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── pg_net hook for hire emails (optional — configure in prod) ────────────────

CREATE OR REPLACE FUNCTION public.invoke_hire_email_webhook(p_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _hook jsonb;
  _url text;
  _bearer text;
BEGIN
  SELECT value INTO _hook
  FROM public.internal_webhook_config
  WHERE key = 'hire_email';

  IF _hook IS NULL OR COALESCE((_hook->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  _url := nullif(trim(_hook->>'url'), '');
  _bearer := nullif(trim(_hook->>'bearer_token'), '');
  IF _url IS NULL OR _bearer IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _bearer
      ),
      body := jsonb_build_object('candidate_id', p_candidate_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- ── Trigger: candidates.hired_at set → hire email webhook ───────────────────

CREATE OR REPLACE FUNCTION public.notify_candidate_hired()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.hired_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.hired_at IS NOT DISTINCT FROM NEW.hired_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.invoke_hire_email_webhook(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_candidate_hired ON public.candidates;
CREATE TRIGGER trg_notify_candidate_hired
  AFTER INSERT OR UPDATE OF hired_at ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_candidate_hired();

-- Prod setup (run once after migration, replace placeholders):
-- INSERT INTO public.internal_webhook_config (key, value) VALUES (
--   'hire_email',
--   '{"enabled": true, "url": "https://YOUR-PROJECT/functions/v1/send-hire-email", "bearer_token": "YOUR_SERVICE_ROLE_KEY"}'::jsonb
-- ) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
