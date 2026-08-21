-- ─────────────────────────────────────────────────────────────────────────────
-- Interviewer daily digest — cron schedule + notification toggle default
--
-- Sends a morning email (9 AM IST) to each interviewer/panelist listing
-- all interviews scheduled for that day.
-- Safe to re-run — cron.schedule() replaces an existing job with the same name.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Merge new toggle into existing email_notification_settings (default ON)
UPDATE public.system_config
SET config_value = config_value || '{"interviewer_daily_digest": true}'::jsonb,
    updated_at = now()
WHERE config_key = 'email_notification_settings'
  AND NOT (config_value ? 'interviewer_daily_digest');

-- Daily at 9 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'interviewer-daily-digest',
  '30 3 * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/interviewer-daily-digest',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- Verify job registered
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'interviewer-daily-digest';
