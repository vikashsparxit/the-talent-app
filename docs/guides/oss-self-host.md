# OSS self-host quickstart

For teams deploying **The Talent App** from the public repo without SparxIT tribal knowledge.

## Prerequisites

See full details in [`docs/LOCAL_SETUP_GUIDE.md`](../LOCAL_SETUP_GUIDE.md):

- Node.js 18+, npm/bun, Git
- Supabase CLI (+ Docker for local stack)
- Supabase project (hosted or self-hosted)

## Initial checklist

| # | Task | Reference |
|---|------|-----------|
| 1 | Clone `the-talent-app` | LOCAL_SETUP_GUIDE §2 |
| 2 | `npm install` | §3 |
| 3 | Copy `.env.example` → `.env.dev` | §4 |
| 4 | Apply migrations | §8 — `supabase db push` or migration SQL review |
| 5 | Create storage buckets | §10 |
| 6 | Deploy edge functions | `npm run deploy:dev` / `deploy:prod` |
| 7 | Seed roles & smoke test | Below + MANUAL_TEST_CASES §18.15 |

## Environment variables

Frontend (`.env.dev` / production env):

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
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

Never commit secrets. Private automation paths stay in `oss-export.exclude`.

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
- Review `supabase/migrations/` before production.

## Smoke path

Run manual smoke from **`docs/MANUAL_TEST_CASES.md` §18.15**:

1. Admin login → Settings loads.
2. Create job → assign recruiter.
3. Applicant applies on `/careers`.
4. Recruiter approves Pending Approval.
5. Assign assessment → applicant completes `/exam/:id`.
6. Schedule interview → interviewer submits feedback.

Full roles matrix: **§18.16** — should match [user guides](./README.md).

## Guides & features in product

After deploy, internal users find:

- **`/features`** — capability catalogue
- **`/help`** — role playbooks (admin sees OSS guide too)

## Support resources

| Doc | Purpose |
|-----|---------|
| [LOCAL_SETUP_GUIDE.md](../LOCAL_SETUP_GUIDE.md) | Full setup |
| [MANUAL_TEST_CASES.md](../MANUAL_TEST_CASES.md) | QA matrix |
| [EMAIL_NOTIFICATIONS.md](../EMAIL_NOTIFICATIONS.md) | AWS SES SMTP setup |
| [guides/README.md](./README.md) | Role playbooks index |

## Compliance

Applicant consent flows (apply, exam portal, notification prefs) — link to org privacy policy. Product compliance roadmap in `ROADMAP.md` (GDPR/DPDP section).
