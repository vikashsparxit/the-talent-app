-- ─────────────────────────────────────────────────────────────────────────────
-- Chitragupta edge function cron schedules
--
-- Self-hosted Supabase uses pg_cron + pg_net for scheduled edge functions.
-- Run in Supabase Dashboard → SQL Editor.
-- Safe to re-run — cron.schedule() replaces an existing job with the same name.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Helper: replace <SERVICE_ROLE_KEY> with your actual key ───────────────────
-- (same key as SUPABASE_SERVICE_ROLE_KEY / SPARX_SUPABASE_SERVICE_ROLE_KEY)

-- KRA 1 — Overdue Interview Feedback: every hour
SELECT cron.schedule(
  'chitra-engine-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-engine',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- KRA 2 / 3 / 4 — Stagnation, Deadline Risk, Rewards: every hour
SELECT cron.schedule(
  'chitra-kra234-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-kra234',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- KRA 8–15 — Phase 3 lifecycle checks: every hour
SELECT cron.schedule(
  'chitra-kra-phase3-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-kra-phase3',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- KRA 7 — Daily Executive Brief: every day at 9 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'chitra-daily-brief',
  '30 3 * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-daily-brief',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- KRA 12 — Weekly Pipeline Report: every Sunday at 8 AM IST (2:30 AM UTC)
SELECT cron.schedule(
  'chitra-weekly-report',
  '30 2 * * 0',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-weekly-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

-- Verify all Chitragupta jobs are registered
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'chitra-%'
ORDER BY jobname;
