# OSS self-host quickstart

For teams deploying **The Talent App** on their own infrastructure.

## Prerequisites

See full details in [`docs/LOCAL_SETUP_GUIDE.md`](../LOCAL_SETUP_GUIDE.md):

- Node.js 22 LTS, npm, Git
- Supabase CLI (+ Docker for local stack)
- Supabase project (hosted or self-hosted)

## Initial checklist

| # | Task | Reference |
|---|------|-----------|
| 1 | Clone `the-talent-app` | LOCAL_SETUP_GUIDE §2 |
| 2 | `npm install` | §3 |
| 3 | Copy `.env.example` → `.env.dev` | §4 |
| 4 | Apply migrations | §8 — `supabase db push` (new installs apply the single baseline). 0.x installs: fresh install only, see [docs/UPGRADING.md](../UPGRADING.md) |
| 5 | Verify storage buckets are private | §10 |
| 6 | Deploy edge functions | `supabase functions deploy` (hosted) or copy `supabase/functions` into your stack's functions volume (self-hosted) |
| 7 | Enable scheduled jobs | Below |
| 8 | Seed roles & smoke test | Below |

## Environment variables

Frontend (`.env.dev` / production env):

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=   # your anon key — never the service-role key
```

Edge function secrets (Supabase dashboard or CLI):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function DB access |
| `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY` | Gemini — resume parse, kits, Chitra, health scorer |
| `GEMINI_MODEL` | Optional override (default `gemini-2.5-flash`) |
| `SES_SMTP_HOST` | SES SMTP endpoint (see `supabase/functions/.env.example`) |
| `SES_SMTP_USER` | SES SMTP username |
| `SES_SMTP_PASSWORD` | SES SMTP password |

Never commit secrets.

## Scheduled jobs

Chitragupta and the interviewer digest run on `pg_cron` + `pg_net`. The jobs are created by the migrations but do nothing until you tell them where your edge functions live:

```sql
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'edge_functions',
  '{"enabled": true, "base_url": "https://<your-supabase-host>/functions/v1", "bearer_token": "<SERVICE_ROLE_KEY>"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Set `PUBLIC_APP_URL` on the functions container so email links and logos resolve to your app.

## Timezone for notifications

Interview notifications, emails and calendar invites show times in each user's own timezone (set in their profile). For users who have not picked one, the app uses a deployment default, which is UTC unless you set it:

```sql
INSERT INTO public.system_config (config_key, config_value, description)
VALUES ('default_timezone', '"Europe/Berlin"'::jsonb, 'Default timezone for notification times')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
```

Edge functions also accept a `DEFAULT_TIMEZONE` secret, which takes precedence over the database value. The interviewer digest uses the default timezone to decide what "today" is.

## Role seeding

1. Sign up first user via `/auth`.
2. In Supabase SQL editor or seed script, insert into `user_roles`:

```sql
-- Replace with your auth.users id
INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'admin');
UPDATE profiles SET is_super_admin = true WHERE user_id = '<uuid>';
```

3. Create HR/recruiter/interviewer test users for matrix testing.

## RLS posture

- RLS enabled on all tables.
- Service role: full access in edge functions only.
- Anon/authenticated: minimal policies per migration files.
- Apply every migration in `supabase/migrations/` — the security hardening migrations are required, not optional.

## Smoke path

After deploying, walk through this end-to-end path once:

1. Admin login → Settings loads.
2. Create job → assign recruiter.
3. Applicant applies on `/careers`.
4. Recruiter approves Pending Approval.
5. Assign assessment → applicant completes `/exam/:id`.
6. Schedule interview → interviewer submits feedback.

Repeat with HR, recruiter, and interviewer accounts to confirm each role sees what the [user guides](./README.md) describe.

## Guides & features in product

After deploy, internal users find:

- **`/features`** — capability catalogue
- **`/help`** — role playbooks (admin sees OSS guide too)

## Support resources

| Doc | Purpose |
|-----|---------|
| [LOCAL_SETUP_GUIDE.md](../LOCAL_SETUP_GUIDE.md) | Full setup |
| [EMAIL_NOTIFICATIONS.md](../EMAIL_NOTIFICATIONS.md) | AWS SES SMTP setup |
| [guides/README.md](./README.md) | Role playbooks index |

## Compliance

Set your privacy policy and terms URLs in Settings → Compliance so applicant consent flows link to them. See `docs/COMPLIANCE.md` for what the application enforces and what the deployer is responsible for.
