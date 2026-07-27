-- Email delivery log, settings, quota RPC, and staff notification webhook hook

-- ── Delivery log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient     TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  template_type TEXT        NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'quota_blocked')),
  provider      TEXT        NOT NULL DEFAULT 'resend',
  error_message TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_log_created_at
  ON public.email_delivery_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_log_quota
  ON public.email_delivery_log (created_at, status)
  WHERE status = 'sent';

ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin HR read email delivery log"
  ON public.email_delivery_log FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  );

CREATE POLICY "Service role insert email delivery log"
  ON public.email_delivery_log FOR INSERT
  WITH CHECK (true);

-- ── Email settings (tenant config — no API keys) ─────────────────────────────

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'email_settings',
  '{"enabled": true, "from_address": "", "reply_to": "", "daily_quota": 100, "monthly_quota": 3000}'::jsonb,
  'Transactional email settings: enabled toggle, from/reply addresses, Resend free-tier quotas'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Admin read email settings" ON public.system_config;
CREATE POLICY "Admin read email settings"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key = 'email_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin update email settings" ON public.system_config;
CREATE POLICY "Admin update email settings"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key = 'email_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    config_key = 'email_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin insert email settings" ON public.system_config;
CREATE POLICY "Admin insert email settings"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key = 'email_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ── Internal webhook config (pg_net → edge functions; not exposed to clients) ─

CREATE TABLE IF NOT EXISTS public.internal_webhook_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_webhook_config ENABLE ROW LEVEL SECURITY;
-- No authenticated policies — only SECURITY DEFINER functions and service role.

COMMENT ON TABLE public.internal_webhook_config IS
  'Server-only webhook config for DB triggers (pg_net). Populate staff_email row via SQL in prod.';

-- ── Quota counts RPC ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_email_send_counts()
RETURNS TABLE (sent_today bigint, sent_this_month bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*) FILTER (
      WHERE status = 'sent'
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    )::bigint AS sent_today,
    count(*) FILTER (
      WHERE status = 'sent'
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
    )::bigint AS sent_this_month
  FROM public.email_delivery_log;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_send_counts() TO authenticated;

-- ── pg_net hook for staff emails (optional — configure in prod) ──────────────

CREATE OR REPLACE FUNCTION public.invoke_staff_email_webhook(
  p_event text,
  p_interview_id uuid
)
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
  WHERE key = 'staff_email';

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
      body := jsonb_build_object(
        'event', p_event,
        'interview_id', p_interview_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- ── Extend in-app notification triggers with email fan-out hook ──────────────

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

  PERFORM public.invoke_staff_email_webhook('interview_scheduled', NEW.id);

  RETURN NEW;
END;
$function$;

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
  IF NEW.verdict IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.verdict IS NOT NULL THEN RETURN NEW; END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;

  _verdict_label := CASE NEW.verdict
    WHEN 'proceeded' THEN 'Proceed ✓'
    WHEN 'rejected'  THEN 'Reject ✗'
    WHEN 'hold'      THEN 'On Hold'
    WHEN 'no_show'   THEN 'No Show'
    ELSE NEW.verdict::TEXT
  END;

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

  PERFORM public.invoke_staff_email_webhook('verdict_submitted', NEW.id);

  RETURN NEW;
END;
$function$;

-- Prod setup (run once after migration, replace placeholders):
-- INSERT INTO public.internal_webhook_config (key, value) VALUES (
--   'staff_email',
--   '{"enabled": true, "url": "https://YOUR-PROJECT/functions/v1/send-staff-email", "bearer_token": "YOUR_SERVICE_ROLE_KEY"}'::jsonb
-- ) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
