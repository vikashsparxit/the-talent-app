# DevOps Handoff — SparxTalent Self-Hosted Production

> **Audience:** DevOps / platform engineers configuring remaining infrastructure.  
> **Stack:** Self-hosted Supabase (not Supabase Cloud) · AWS SES (SMTP) transactional email · React frontend on `prod` branch.

| Component | URL / host |
|-----------|------------|
| Supabase API + Edge Functions | `https://spxtalent-db.clientwork.xyz` |
| Production app (staff + applicant portal) | `https://sparxtalent.thesparxitsolutions.com` |
| Edge Functions base path | `https://spxtalent-db.clientwork.xyz/functions/v1/` |

**Important:** Self-hosted Supabase has **no Dashboard Secrets UI** and **no Auth Hooks UI**. Secrets go in container environment variables; auth hooks go in GoTrue (auth) container env; DB webhooks go in Postgres via SQL.

---

## 1. Overview

SparxTalent is a recruitment platform backed by:

- **PostgreSQL + Auth (GoTrue) + Storage + Edge Runtime** on `spxtalent-db.clientwork.xyz` (self-hosted Supabase Docker stack)
- **Edge Functions** in `supabase/functions/` — deployed by rsync to the functions volume (see §9)
- **Transactional email** via [AWS SES](https://aws.amazon.com/ses/) (SMTP) — all sends go through edge functions (`send-auth-email`, `send-hire-email`, `send-staff-email`, etc.)
- **DB-triggered email** via `pg_net` → edge functions, configured in `internal_webhook_config`
- **Chitragupta cron jobs** via `pg_cron` + `pg_net` → edge functions (hourly + daily + weekly)
- **Frontend** deployed from private repo `origin/prod` → `sparxtalent.thesparxitsolutions.com`

Reference docs (private repo):

- `docs/DEPLOYMENT.md` — dual-repo deploy model
- `docs/EDGE_FUNCTIONS_SECRETS_SELF_HOSTED.md` — edge function env vars
- `docs/EMAIL_NOTIFICATIONS.md` — all 9 scoped notification types
- `scripts/deploy-edge-functions.example.env` — deploy script config template

---

## 2. Already Done

- [x] Edge function **code** synced/deployed to `spxtalent-db.clientwork.xyz` (includes `send-auth-email`, `send-hire-email`, `send-staff-email`, Chitragupta functions, etc.)
- [x] Migration **`20260619000007_email_notification_settings.sql`** applied (per-type toggles + `invoke_hire_email_webhook` + `trg_notify_candidate_hired`)

---

## 3. Environment Variables — Edge Functions Container

Set these on the **functions** service (Docker `environment:` / `env_file:`, or equivalent). Edge Functions read via `Deno.env.get()` — **not** from Vault/Postgres.

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `SES_SMTP_HOST` | **Yes** | AWS SES SMTP endpoint for your region | `email-smtp.us-east-1.amazonaws.com` |
| `SES_SMTP_PORT` | No | SMTP port (`587` STARTTLS or `465` TLS) | `587` |
| `SES_SMTP_USER` | **Yes** | SES SMTP IAM user access key ID | `AKIA...` |
| `SES_SMTP_PASSWORD` | **Yes** | SES SMTP password (derived from IAM secret) | `<smtp password>` |
| `EMAIL_FROM` | No | Default from when Settings → Email `from_address` is empty | `system@thetalentapp.io` |

**GoTrue alias fallback (functions container only):** If `SES_SMTP_*` are unset, edge functions also accept `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` / `SMTP_PASSWORD`, and `SMTP_ADMIN_EMAIL` for `EMAIL_FROM`. These do **not** cross containers — vars on the auth service are invisible to edge functions.
| `SEND_AUTH_EMAIL_HOOK_SECRET` | **Yes** | Verifies GoTrue Send Email Hook webhook signature. Must match GoTrue `GOTRUE_HOOK_SEND_EMAIL_SECRETS`. Format: `v1,whsec_<base64>` (32–88 chars) | `v1,whsec_<YOUR_BASE64_SECRET>` |
| `PUBLIC_APP_URL` | **Yes** | Base URL for email logos, CTAs, and image links | `https://sparxtalent.thesparxitsolutions.com` |
| `PUBLIC_MARKETING_URL` | No | Footer/marketing link in email templates (defaults to `PUBLIC_APP_URL` or GitHub) | `https://github.com/vikashsparxit/the-talent-app` |
| `GOOGLE_AI_API_KEY` | **Yes** | Gemini API for AI edge functions (`parse-resume`, `enrich-profile`, `analyze-candidate`, etc.) | `AIza...` |
| `GEMINI_API_KEY` | No | Alias for `GOOGLE_AI_API_KEY` | — |
| `SUPABASE_URL` | **Yes** | Public Supabase API URL (usually set by stack) | `https://spxtalent-db.clientwork.xyz` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Service role JWT for admin DB access in functions | `<JWT from stack>` |
| `SUPABASE_INTERNAL_URL` | No | Internal Kong/API URL if functions cannot resolve public hostname (DNS errors fetching storage) | `http://kong:8000` |
| `HIRE_EMAIL_HOOK_SECRET` | No | Optional alternate auth for `send-hire-email` (service role bearer is primary) | `<random secret>` |
| `STAFF_EMAIL_HOOK_SECRET` | No | Optional alternate auth for `send-staff-email` (service role bearer is primary) | `<random secret>` |

After changing env vars:

- [ ] Restart the **functions** container/service
- [ ] Confirm `GOOGLE_AI_API_KEY` works (Enrich profile / Analyze Fit in app)
- [ ] Confirm SES SMTP vars are set (auth + transactional emails will fail without them)

Template: `supabase/functions/.env.example`

---

## 4. Environment Variables — Auth (GoTrue) Container

Configure on the **auth** service. There is no Dashboard Hooks UI on self-hosted — use env vars (maps to `[auth.hook.send_email]` in local `config.toml`).

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `GOTRUE_HOOK_SEND_EMAIL_ENABLED` | **Yes** | Enable Send Email Hook (disables GoTrue SMTP for auth emails) | `true` |
| `GOTRUE_HOOK_SEND_EMAIL_URI` | **Yes** | URL GoTrue POSTs to on signup/recovery/etc. Use internal URL if auth container cannot reach public hostname | `https://spxtalent-db.clientwork.xyz/functions/v1/send-auth-email` or `http://kong:8000/functions/v1/send-auth-email` |
| `GOTRUE_HOOK_SEND_EMAIL_SECRETS` | **Yes** | Webhook signing secret — **same value** as `SEND_AUTH_EMAIL_HOOK_SECRET` on functions container | `v1,whsec_<YOUR_BASE64_SECRET>` |
| `GOTRUE_SITE_URL` | **Yes** | Default redirect after auth actions (often set via stack `SITE_URL`) | `https://sparxtalent.thesparxitsolutions.com` |
| `GOTRUE_URI_ALLOW_LIST` | **Yes** | Comma-separated allowlist for `redirect_to` in auth emails. Without these, verify links fall back to Site URL (`/`) | See list below |

**Applicant redirect URLs** (from `docs/DEPLOYMENT.md` — add to `GOTRUE_URI_ALLOW_LIST` / stack `ADDITIONAL_REDIRECT_URLS`):

- [ ] `https://sparxtalent.thesparxitsolutions.com/applicant/login?verified=1`
- [ ] `https://sparxtalent.thesparxitsolutions.com/applicant/login`
- [ ] `https://sparxtalent.thesparxitsolutions.com/applicant/dashboard`
- [ ] `https://sparxtalent.thesparxitsolutions.com/reset-password`

After changing auth env:

- [ ] Restart the **auth** container/service
- [ ] Do **not** configure GoTrue SMTP if the hook is enabled — SES handles auth email via `send-auth-email`

---

## 5. Database Webhooks (`internal_webhook_config`)

DB triggers call edge functions via `pg_net`. Config lives in Postgres table `internal_webhook_config` (RLS enabled, no client access — service role / SECURITY DEFINER only).

**Prerequisites:**

- [ ] Extensions enabled: `pg_net` (and `pg_cron` for §8)
- [ ] Replace `<SERVICE_ROLE_KEY>` with the stack's service role JWT

### Verify existing rows

Run in SQL editor / `psql`:

```sql
SELECT key, value->>'enabled' AS enabled, value->>'url' AS url, updated_at
FROM public.internal_webhook_config
WHERE key IN ('staff_email', 'hire_email')
ORDER BY key;
```

### Configure `staff_email` → interview scheduled emails

Invoked by `notify_interview_scheduled` trigger → `send-staff-email` (`verify_jwt = false`; auth via service role bearer in `Authorization` header).

```sql
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'staff_email',
  '{"enabled": true, "url": "https://spxtalent-db.clientwork.xyz/functions/v1/send-staff-email", "bearer_token": "<SERVICE_ROLE_KEY>"}'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

- [ ] Row exists with `enabled: true`
- [ ] URL points to `send-staff-email` on prod host
- [ ] `bearer_token` is valid service role key

### Configure `hire_email` → hire notification emails

Invoked by `trg_notify_candidate_hired` on `candidates.hired_at` → `send-hire-email` (migration `20260619000007`).

```sql
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'hire_email',
  '{"enabled": true, "url": "https://spxtalent-db.clientwork.xyz/functions/v1/send-hire-email", "bearer_token": "<SERVICE_ROLE_KEY>"}'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

- [ ] Row exists with `enabled: true`
- [ ] URL points to `send-hire-email` on prod host
- [ ] `bearer_token` is valid service role key

**Note:** `verdict_submitted` events also call `staff_email` webhook but are **out of scoped email toggles** — no separate config row needed.

---

## 6. Auth Send Email Hook — Self-Hosted Setup

Step-by-step (no Supabase Dashboard):

1. [ ] **Generate webhook secret** — 32–88 character base64 string, prefixed with `v1,whsec_`:
   ```bash
   # Example: generate 32 random bytes, base64-encode, prefix
   echo "v1,whsec_$(openssl rand -base64 32)"
   ```

2. [ ] **Set secret on Edge Functions container** as `SEND_AUTH_EMAIL_HOOK_SECRET`

3. [ ] **Set same secret on Auth container** as `GOTRUE_HOOK_SEND_EMAIL_SECRETS`

4. [ ] **Enable hook on Auth container:**
   - `GOTRUE_HOOK_SEND_EMAIL_ENABLED=true`
   - `GOTRUE_HOOK_SEND_EMAIL_URI=https://spxtalent-db.clientwork.xyz/functions/v1/send-auth-email`  
     (or internal Kong URL if auth cannot reach public host)

5. [ ] **Ensure `send-auth-email` is deployed** with `verify_jwt = false` (already in `supabase/config.toml`)

6. [ ] **Set SES SMTP env vars** on functions container (hook function sends via SES)

7. [ ] **Set `PUBLIC_APP_URL`** on functions container (branding/links in auth templates)

8. [ ] **Configure redirect allowlist** on GoTrue (§4)

9. [ ] **Restart auth + functions containers**

10. [ ] **Smoke test:** applicant signup → confirmation email via SES branded template (not plain GoTrue text)

Local reference (`supabase/config.toml`):

```toml
[auth.hook.send_email]
enabled = true
uri = "http://host.docker.internal:54321/functions/v1/send-auth-email"
secrets = "env(SEND_AUTH_EMAIL_HOOK_SECRET)"

[functions.send-auth-email]
verify_jwt = false
```

---

## 7. AWS SES (SMTP)

### Production SES SMTP (SparxIT — us-east-2)

Set on the **functions** Docker service (`environment:` or `env_file:`). Use placeholders in repo docs; real values only in gitignored env or server config.

```bash
EMAIL_FROM=system@thetalentapp.io
SES_SMTP_HOST=email-smtp.us-east-2.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=<SES SMTP IAM access key ID>
SES_SMTP_PASSWORD=<SES SMTP password from AWS console>
```

Port `587` uses STARTTLS (TLS). Do not commit `SES_SMTP_PASSWORD` or paste it into tracked files.

- [ ] Create / use AWS SES in your account and generate **SMTP credentials** (IAM user with `ses:SendRawEmail` or use SES console SMTP credentials)
- [ ] Set `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD` (and `SES_SMTP_PORT` if not `587`) on functions container
- [ ] **Verify sending domain** `thetalentapp.io` in SES (DNS records: SPF, DKIM, DMARC as recommended)
- [ ] Verify sender identity `system@thetalentapp.io` (or entire domain)
- [ ] Set **from address** in app: Settings → Email → configure `email_settings.from_address` (defaults to `system@thetalentapp.io` when empty)
- [ ] Optionally set `reply_to` in same Settings screen
- [ ] Confirm quotas: defaults in DB — daily `100`, monthly `3000` (`system_config.email_settings`); adjust SES account sending limits separately in AWS
- [ ] **Remove** legacy `RESEND_API_KEY` from functions container if still present

---

## 8. Cron / Scheduled Jobs (Chitragupta)

Chitragupta edge functions are invoked by **`pg_cron` + `pg_net`**, not external cron. Migration reference: `supabase/migrations/20260421000003_chitra_cron_schedules.sql`.

**Prerequisites:**

- [ ] `CREATE EXTENSION IF NOT EXISTS pg_cron;`
- [ ] `CREATE EXTENSION IF NOT EXISTS pg_net;`
- [ ] Replace `<SERVICE_ROLE_KEY>` in all jobs below

| Job name | Schedule (UTC) | Edge function | Email type (if any) |
|----------|----------------|---------------|---------------------|
| `chitra-engine-hourly` | `0 * * * *` | `chitra-engine` | In-app only |
| `chitra-kra234-hourly` | `0 * * * *` | `chitra-kra234` | `chitra_praise` fan-out after insert |
| `chitra-kra-phase3-hourly` | `0 * * * *` | `chitra-kra-phase3` | In-app only |
| `chitra-daily-brief` | `30 3 * * *` (9:00 AM IST) | `chitra-daily-brief` | `chitra_daily_report` to super admin |
| `chitra-weekly-report` | `30 2 * * 0` (8:00 AM IST Sunday) | `chitra-weekly-report` | `chitra_weekly_report` to super admin |

**Install / update schedules** (safe to re-run — replaces jobs by name):

```sql
SELECT cron.schedule(
  'chitra-engine-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-engine',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

SELECT cron.schedule(
  'chitra-kra234-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-kra234',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

SELECT cron.schedule(
  'chitra-kra-phase3-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-kra-phase3',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

SELECT cron.schedule(
  'chitra-daily-brief',
  '30 3 * * *',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-daily-brief',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);

SELECT cron.schedule(
  'chitra-weekly-report',
  '30 2 * * 0',
  $$SELECT net.http_post(
    url     := 'https://spxtalent-db.clientwork.xyz/functions/v1/chitra-weekly-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    body    := '{}'
  ) AS request_id$$
);
```

**Verify:**

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'chitra-%'
ORDER BY jobname;
```

- [ ] All 5 jobs present and `active = true`
- [ ] Manual trigger test (optional): `SELECT net.http_post(...)` for one function and check edge function logs

---

## 9. Deploy / Update Procedure

### Edge Functions (code updates)

From developer machine with SSH access to Supabase host:

1. [ ] Copy and configure deploy env (once):
   ```bash
   cp scripts/deploy-edge-functions.example.env .env.deploy
   # Edit: DEPLOY_HOST, DEPLOY_FUNCTIONS_PATH, DEPLOY_RESTART_CMD
   ```

2. [ ] Deploy:
   ```bash
   ./scripts/deploy-edge-functions.sh prod   # or `dev` for staging
   ```

   Script rsyncs `supabase/functions/` → server path (e.g. `/opt/supabase/volumes/functions`) and runs `DEPLOY_RESTART_CMD` (e.g. `docker compose restart functions --no-deps`).

3. [ ] If env vars changed, edit functions service env and restart **functions** container (deploy script does not sync secrets).

### Auth hook / GoTrue env changes

- [ ] Edit auth service environment (§4)
- [ ] `docker compose restart auth --no-deps` (or your stack equivalent)

### Database migrations

- [ ] Apply new SQL via your migration process (`supabase db push`, manual SQL, or CI)
- [ ] **Do not** re-run `20260619000007` if already applied

### Frontend app

- [ ] Deploy from private repo: `npm run push:prod` (pushes `origin/main` + `origin/prod`)
- [ ] Prod URL: `https://sparxtalent.thesparxitsolutions.com`

---

## 10. Verification Checklist

Confirm each path sends email and appears in `email_delivery_log` (Settings → Email in app, admin/HR view).

### Scoped notification types (9)

| # | Toggle key | How to trigger | Expected |
|---|------------|----------------|----------|
| 1 | `candidate_hired_staff` | Mark candidate hired (`hired_at` set) | HR + admin receive hire email |
| 2 | `candidate_hired_applicant` | Same hire action | Applicant receives hire email |
| 3 | `candidate_rejected` | Staff rejects candidate via UI | Applicant receives rejection email |
| 4 | `chitra_warning` | Chitragupta L4 formal warning (hourly cron) | Warned interviewer receives email |
| 5 | `chitra_praise` | Chitragupta praise (hourly `chitra-kra234`) | Praised user receives email |
| 6 | `chitra_daily_report` | Daily brief cron (`chitra-daily-brief`) | Super admin receives daily report email |
| 7 | `chitra_weekly_report` | Weekly cron (`chitra-weekly-report`, Sunday) | Super admin receives weekly report email |
| 8 | `interview_scheduled` | Schedule interview on candidate | Interviewer + panelists + recruiters emailed |
| 9 | `assignment_completed` | Applicant completes assessment in portal | Job recruiters emailed |

Checklist:

- [ ] 1–2 Hire emails (requires §5 `hire_email` webhook + SES SMTP vars)
- [ ] 3 Rejection email
- [ ] 4 Chitra warning email
- [ ] 5 Chitra praise email
- [ ] 6 Daily report email (or manual cron trigger)
- [ ] 7 Weekly report email (or manual cron trigger)
- [ ] 8 Interview scheduled email (requires §5 `staff_email` webhook)
- [ ] 9 Assignment completed email

### Auth email (10th)

- [ ] Applicant or staff **signup confirmation** email sent via SES branded template (not plain GoTrue text) — confirms §6 hook is active

### Admin settings sanity

- [ ] Settings → Email: master toggle **enabled**, from address on verified domain
- [ ] Settings → Email → Email Notifications: all 9 toggles ON (defaults from migration)
- [ ] `SELECT * FROM email_delivery_log ORDER BY created_at DESC LIMIT 20;` shows `status = 'sent'` for test sends

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Auth emails are **plain text** GoTrue templates | Send Email Hook not enabled or wrong URI | Set `GOTRUE_HOOK_SEND_EMAIL_*` (§4, §6); restart auth |
| Auth hook returns 401 / verification failed | Secret mismatch | Ensure `SEND_AUTH_EMAIL_HOOK_SECRET` (functions) = `GOTRUE_HOOK_SEND_EMAIL_SECRETS` (auth); format `v1,whsec_...` |
| Verify link redirects to staff `/` not applicant portal | Missing redirect allowlist | Add applicant URLs to `GOTRUE_URI_ALLOW_LIST` (§4) |
| Email **logo/images broken** | Wrong app URL in templates | Set `PUBLIC_APP_URL=https://sparxtalent.thesparxitsolutions.com` on functions container |
| **Hire emails not sending** | Missing `hire_email` webhook row | Run §5 SQL; confirm trigger fires: `hired_at` actually changes |
| **Interview emails not sending** | Missing `staff_email` webhook row | Run §5 SQL |
| Webhook configured but no email | Toggle off, quota, or SES error | Check `email_notification_settings`, `email_settings.enabled`, `email_delivery_log.error_message` |
| `parse-resume` DNS error on storage fetch | Functions cannot resolve public hostname | Set `SUPABASE_INTERNAL_URL=http://kong:8000` (or internal API URL) |
| AI features "API key not set" | Missing Gemini key on **functions** container | Set `GOOGLE_AI_API_KEY`; Vault secrets do **not** work for edge functions |
| Chitra emails never arrive | Cron not scheduled | Run §8 SQL; verify `cron.job` rows |
| All emails fail | SES credentials or domain | Verify `SES_SMTP_*` vars on **functions** container (not auth); verify domain/sender in SES; check from address in Settings |
| `email_delivery_log` shows **skipped** / **SES SMTP not configured** | SMTP vars on auth container only, or wrong names on functions | Copy SMTP creds to **functions** as `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD` (or use GoTrue-style `SMTP_*` fallbacks on functions); restart functions |

**Quick DB checks:**

```sql
-- Webhook config
SELECT key, value FROM internal_webhook_config WHERE key IN ('hire_email', 'staff_email');

-- Recent delivery attempts
SELECT created_at, template_type, status, error_message, recipient
FROM email_delivery_log
ORDER BY created_at DESC
LIMIT 20;

-- Notification toggles
SELECT config_value FROM system_config WHERE config_key = 'email_notification_settings';
```

---

## Handoff sign-off

| Area | Owner | Done |
|------|-------|------|
| Edge function env vars (§3) | DevOps | [ ] |
| GoTrue auth hook + redirects (§4, §6) | DevOps | [ ] |
| `internal_webhook_config` rows (§5) | DevOps | [ ] |
| SES domain + from address (§7) | DevOps + Admin | [ ] |
| Chitragupta pg_cron jobs (§8) | DevOps | [ ] |
| End-to-end email verification (§10) | DevOps + QA | [ ] |

*Last updated: 2026-06-19 — aligns with migration `20260619000007_email_notification_settings.sql`.*

---

## See also

- [EMAIL_NOTIFICATIONS.md](EMAIL_NOTIFICATIONS.md) — all 9 scoped notification types and toggles
- [AI_PROMPTS.md](AI_PROMPTS.md) — Gemini prompt inventory for edge functions
- [DEPLOYMENT.md](DEPLOYMENT.md) — dual-repo deploy model
- [LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md) — self-hosting from scratch
