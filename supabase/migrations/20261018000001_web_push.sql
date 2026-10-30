-- ─────────────────────────────────────────────────────────────────────────────
-- Web Push for staff notifications
--
-- * push_subscriptions: one row per browser/device push subscription.
-- * notification_prefs: per-user push switch, per-type overrides, quiet hours.
-- * notifications.pushed_at / push_attempts: delivery bookkeeping.
-- * AFTER INSERT trigger on notifications calls the send-push edge function
--   through pg_net; a pg_cron sweep retries undelivered rows every 5 minutes.
--
-- Push stays off until the 'push' row exists in internal_webhook_config and
-- the functions runtime has VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
-- (see docs/WEB_PUSH.md):
--
--   INSERT INTO public.internal_webhook_config (key, value) VALUES (
--     'push',
--     '{"enabled": true, "url": "https://<your-supabase-host>/functions/v1/send-push", "bearer_token": "<SERVICE_ROLE_KEY>"}'::jsonb
--   )
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── push_subscriptions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  user_agent    text,
  platform      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  failure_count integer     NOT NULL DEFAULT 0,
  CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint LIKE 'https://%'),
  CONSTRAINT push_subscriptions_field_lengths CHECK (
    length(endpoint) <= 2048 AND length(p256dh) <= 256 AND length(auth) <= 64
    AND (user_agent IS NULL OR length(user_agent) <= 512)
    AND (platform IS NULL OR length(platform) <= 32)
  )
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users add own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users add own push subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Re-subscribing on app start upserts on endpoint, which needs UPDATE.
DROP POLICY IF EXISTS "Users update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- A browser keeps one endpoint per app; when another user signs in on the same
-- device, the endpoint moves to them. RLS cannot see the other user's row, so
-- this SECURITY DEFINER function does the hand-over for the caller only.
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_staff_user(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, platform, last_seen_at, failure_count)
  VALUES (_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 512), left(p_platform, 32), now(), 0)
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id       = EXCLUDED.user_id,
    p256dh        = EXCLUDED.p256dh,
    auth          = EXCLUDED.auth,
    user_agent    = EXCLUDED.user_agent,
    platform      = EXCLUDED.platform,
    last_seen_at  = now(),
    failure_count = 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text) TO authenticated;

-- ── notification_prefs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled      boolean     NOT NULL DEFAULT true,
  -- { "<notification type>": true|false }; a missing type uses the app default.
  types             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Local time in profiles.timezone; both null means no quiet hours.
  quiet_hours_start time,
  quiet_hours_end   time,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_prefs_types_object CHECK (jsonb_typeof(types) = 'object'),
  CONSTRAINT notification_prefs_quiet_hours_pair CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL))
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification prefs" ON public.notification_prefs;
CREATE POLICY "Users read own notification prefs"
  ON public.notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users add own notification prefs" ON public.notification_prefs;
CREATE POLICY "Users add own notification prefs"
  ON public.notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notification prefs" ON public.notification_prefs;
CREATE POLICY "Users update own notification prefs"
  ON public.notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.notification_prefs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;

-- ── Delivery bookkeeping on notifications ────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0;

-- Rows created before push existed are not retried.
UPDATE public.notifications SET pushed_at = created_at WHERE pushed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON public.notifications (created_at)
  WHERE pushed_at IS NULL;

-- ── send-push invocation ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_send_push(p_body jsonb)
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
  WHERE key = 'push';

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
      body := p_body
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.invoke_send_push(jsonb) FROM PUBLIC, anon, authenticated;

-- pg_net queues the request inside the inserting transaction and sends it
-- after commit, so inserts are not slowed down and rolled-back rows never push.
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  PERFORM public.invoke_send_push(jsonb_build_object('notification_id', NEW.id));
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_notification_push ON public.notifications;
CREATE TRIGGER on_notification_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_insert();

-- ── Retry sweep ──────────────────────────────────────────────────────────────
-- Resends rows that are still undelivered after 2 minutes (the trigger call
-- normally settles them in seconds), for up to 3 attempts within an hour.

CREATE OR REPLACE FUNCTION public.retry_pending_pushes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids jsonb;
BEGIN
  SELECT jsonb_agg(n.id) INTO _ids
  FROM (
    SELECT n.id
    FROM public.notifications n
    WHERE n.pushed_at IS NULL
      AND n.push_attempts < 3
      AND n.created_at < now() - interval '2 minutes'
      AND n.created_at > now() - interval '1 hour'
      AND EXISTS (
        SELECT 1 FROM public.push_subscriptions s
        WHERE s.user_id = n.user_id AND s.created_at <= n.created_at
      )
    ORDER BY n.created_at
    LIMIT 100
  ) n;

  IF _ids IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.invoke_send_push(jsonb_build_object('notification_ids', _ids));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.retry_pending_pushes() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('push-retry', '*/5 * * * *',
  $$SELECT public.retry_pending_pushes()$$);
