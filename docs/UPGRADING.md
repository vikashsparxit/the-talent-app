# Upgrading The Talent App

Always read the [CHANGELOG](../CHANGELOG.md) entry for your target version
before you upgrade.

## 0.x to 1.0.0: fresh install only

Already on 1.0.0? Skip to [1.0.0 to 1.0.1](#100-to-101).

1.0.0 consolidates the database schema into a single baseline migration,
`supabase/migrations/20261011000000_baseline.sql`. The individual 0.x migration
files are no longer shipped.

**There is no in-place upgrade from 0.x.** Do not run the 1.0.0 baseline or
1.0.0 code against an existing 0.x database.

If you self-host a 0.x snapshot:

1. **Back up your data.** Take a full database dump (for example
   `pg_dump --format=custom`), download your storage buckets (resumes,
   avatars, interview and assessment artifacts, company assets), and save
   your edge function environment, `docker-compose.yml` and gateway
   configuration.
2. **Do a fresh install of 1.0.0** on a new Supabase project or an empty
   database, following [LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md) and the
   [self-hosting quickstart](guides/oss-self-host.md). New databases apply only
   the baseline (`supabase db reset` locally, `supabase db push` for a linked
   project).
3. **Configure the new install.** 1.0.0 adds settings a fresh install needs:
   `ALLOWED_ORIGINS` (browser origins allowed to call edge functions; falls
   back to `PUBLIC_APP_URL`), `SUPABASE_PUBLIC_URL` on self-hosted stacks
   behind an API gateway, an optional `default_timezone`, and an explicit CORS
   origin list in the self-hosted gateway. See
   [`supabase/functions/.env.example`](../supabase/functions/.env.example).
4. **Keep your 0.x backup** until you are satisfied with the new install.
   Moving data from a 0.x database into 1.0.0 is not covered by this release.

Also note: use Node.js 22 LTS, install with `npm ci`, and remove the unused
`VITE_GEMINI_API_KEY` frontend variable.

## Later releases

From 1.0.0 on, migrations are append-only on top of the baseline, and shipped
migrations are never edited. Each release lists the migration files it adds and
any operator steps here.

### 1.0.0 to 1.0.1

1.0.1 adds database migrations and new edge functions. Back up your database
before you start.

**1. Get the code.** The public `main` branch was rebuilt after the v1.0.0
tag, so the v1.0.0 tag and current `main` do not share history. A clone
checked out at v1.0.0 cannot fast-forward with `git pull`. Check out the
v1.0.1 tag instead:

```bash
git fetch origin --tags
git switch --detach v1.0.1
```

Or, if you want a local `main` branch that tracks the new history (this
discards local commits on `main`):

```bash
git fetch origin
git switch main
git reset --hard origin/main
```

Then use Node.js 22 LTS, run `npm ci` and rebuild the frontend.

**2. Check browser support and build network access.**

- Tailwind CSS 4 needs Safari 16.4+, Chrome 111+ or Firefox 128+.
- `npm ci` downloads SheetJS from `cdn.sheetjs.com`. Build machines and CI
  need access to that host as well as the npm registry.

**3. Apply the migrations,** in this order (filename order):

1. `20261011000003_assessment_portal_hardening.sql`
2. `20261018000001_web_push.sql`
3. `20261018000002_push_notification_events.sql`
4. `20261027000000_advance_candidate_stage_backup_definition.sql`
5. `20261027000001_advance_candidate_stage_authz_fix.sql`
6. `20261027000010_advance_candidate_stage_verify.sql`
7. `20261030000001_jobs_anon_public_columns.sql`

Notes:

- **`advance_candidate_stage` backup (4).** This file is read-only. Save its
  output: `current_definition` is your rollback copy, and `owner` shows the
  role that owns the function.
- **`advance_candidate_stage` fix (5).** Run it as the function owner
  (usually `supabase_admin` or `postgres`); otherwise it fails with
  "must be owner".
- **Verify (6).** Read-only. Check its output after the fix. You can also run
  `supabase/scripts/smoke/20261027_advance_candidate_stage_authz_smoke.sql`.
- **Anonymous `jobs` columns (7).** Breaking for anonymous API clients:
  `select=*` on `jobs` without signing in now fails. Anonymous clients must
  name the public columns, or use the Public Jobs API. The bundled careers
  page already does this. Signed-in roles are unchanged.
- **Web Push (2, 3).** The migrations are safe to apply when you do not use
  push. Push stays off until you add the `push` row in
  `internal_webhook_config` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` for edge functions. See [WEB_PUSH.md](WEB_PUSH.md).

**4. Deploy edge functions.**

- `candidate-portal` and `grade-assessment`: deploy together with the
  assessment portal hardening migration.
- `public-jobs`: deploy if you expose the Public Jobs API. See
  [PUBLIC_JOBS_API.md](PUBLIC_JOBS_API.md).
- `send-push` and `push-config`: deploy when you enable Web Push.

**New installs** of 1.0.1 apply the baseline and every later file in
`supabase/migrations/` automatically, including the 1.0.1 migrations. Nothing
is skipped.
