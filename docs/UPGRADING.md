# Upgrading The Talent App

Always read the [CHANGELOG](../CHANGELOG.md) entry for your target version
before you upgrade.

## 0.x to 1.0.0: fresh install only

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
