# Deployment — Dual Repository Model

SparxTalent uses **two Git repositories**. This document is the **authoritative reference** for developers and AI coding agents. When in doubt, follow this file — not memory, not chat history.

| Repository | Remote | Visibility | Purpose |
|------------|--------|------------|---------|
| **sparxtalent** | `origin` | Private ([SparxIT](https://www.sparxitsolutions.com) only) | Source of truth — all development, production deploy |
| **the-talent-app** | `oss` | Public (OSS) | Sanitized export for self-hosters and external contributors |

The public repo is **not** the source of truth. All development happens in the private repo; the public repo is updated only via the export script when [SparxIT](https://www.sparxitsolutions.com) chooses to release.

**Also read:** [AGENTS.md](../AGENTS.md) (AI agents) · [CONTRIBUTING.md](../CONTRIBUTING.md) (humans)

---

## MANDATORY Rules

These rules are **non-negotiable**. Violating them risks leaking secrets or deploying from the wrong repository.

| # | Rule |
|---|------|
| 1 | **Never push to `oss` manually.** Only `npm run export:oss:push` or `./scripts/export-oss.sh --push` may update the public repo. |
| 2 | **Never push [SparxIT](https://www.sparxitsolutions.com) production from the public repo.** Production deploys only from private `origin` → `prod`. |
| 3 | **[SparxIT](https://www.sparxitsolutions.com) production deploy** uses `npm run push:prod` or `git push origin main && git push origin main:prod` — nothing else. |
| 4 | **Never add private-only paths to the OSS export.** If a file must stay internal, add it to [oss-export.exclude](../oss-export.exclude) before any OSS release. |
| 5 | **Commits belong on `origin` (private).** OSS sync is a separate, explicit step — never mix the two in one push command. |

---

## For AI Coding Agents

Before giving **any** git push or deploy guidance, complete this checklist:

- [ ] Confirm the working clone is the **private** `sparxtalent` repo (`git remote -v` shows `origin` → `vikashsparxit/sparxtalent`).
- [ ] **Never** suggest `git push oss`, `git push oss main`, or pushing directly to `the-talent-app`.
- [ ] **Never** suggest `export:oss:push` unless the user **explicitly** asks to publish to the public repo.
- [ ] For [SparxIT](https://www.sparxitsolutions.com) production: suggest only `npm run push:prod` or `git push origin main && git push origin main:prod`.
- [ ] Before any push: verify `npx tsc --noEmit` and `npm run build` pass (or run them).
- [ ] **Never** force-push. **Never** use `--no-verify`.
- [ ] Do not commit secrets, `.env` files, or paths listed in `oss-export.exclude`.
- [ ] Read [AGENTS.md](../AGENTS.md) for the condensed agent rules.

When the user asks to "push" without specifying a target, assume **private `origin` only** — not OSS, not prod unless they say deploy/production.

---

## For Human Developers

### Daily workflow ([SparxIT](https://www.sparxitsolutions.com))

```
feature branch
    │
    ▼
merge → origin/main          (private sparxtalent)
    │
    ├── QA: tsc → lint → build → test
    │
    ▼
npm run push:prod            (or: git push origin main && git push origin main:prod)
    │
    ▼
origin/prod → sparxtalent.thesparxitsolutions.com

    ═══════════════════════════════════════
    OSS release (separate, intentional):
    ═══════════════════════════════════════

npm run export:oss           (preview — dry run)
    │
    ▼
npm run export:oss:push      (export + push to oss/main)
    │
    ▼
public the-talent-app on GitHub
```

**Normal development:** work on `origin` only. **Do not** touch `oss` during day-to-day feature work.

### One-time setup

#### Private repo (already done)

[SparxIT](https://www.sparxitsolutions.com) engineers clone and work in the private `sparxtalent` repository.

#### Public GitHub repo

1. Create a **public** repository named `the-talent-app` (no README).
2. Add the `oss` remote in your **private** clone:

```bash
git remote add oss git@github.com:vikashsparxit/the-talent-app.git
```

Verify:

```bash
git remote -v
# origin  → private sparxtalent
# oss     → public the-talent-app
```

#### Branch protection (recommended)

**Private repo:**

- Protect `prod` — only [SparxIT](https://www.sparxitsolutions.com) CI/deploy should merge or push here.
- `main` is the integration branch; `prod` triggers production deploy.

**Public repo:**

- Protect `main` — require PR reviews for external contributions.
- [SparxIT](https://www.sparxitsolutions.com) syncs via `export-oss.sh --push` (force-with-lease on export commits).

---

## What Goes Where

Summary of [oss-export.exclude](../oss-export.exclude). Anything matching these patterns **never** appears in the public export.

| Category | Private only (excluded) |
|----------|-------------------------|
| **Secrets & env** | `.env`, `.env.dev`, `.env.local`, `.env.prod`, `.env.deploy*`, `scripts/.env.runner*`, `scripts/.env.deploy.*` |
| **[SparxIT](https://www.sparxitsolutions.com) automation** | `scripts/sparx-runner.mjs`, `scripts/com.sparxit.sparx-runner.plist`, `scripts/download-storage.sh`, `scripts/export-data.sql`, `scripts/local-migrations/`, `scripts/MIGRATION_README.md` |
| **AI / agent config** | `CLAUDE.md`, `CHITRA_KRA.md`, `.claude/`, `.cursor/` |
| **Private infra docs** | `docs/GIT_REMOTE.md`, `docs/EDGE_FUNCTIONS_SECRETS_SELF_HOSTED.md`, `scripts/deploy-edge-functions.example.env`, `Dockerfile`, `Dockerfile-prod` |
| **Diagnostics** | `supabase/issues/` |
| **Build artifacts** | `.git/`, `node_modules/`, `dist/`, `dist-ssr/` |

**Included in public export:** core app code, `supabase/migrations/`, edge functions, `LICENSE`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/DEPLOYMENT.md`, `docs/LOCAL_SETUP_GUIDE.md`, `.env.example`, and other setup docs.

When adding new internal-only files, update `oss-export.exclude` **before** the next `export:oss:push`.

---

## Commands Reference

| Command | What it does | When to use |
|---------|--------------|-------------|
| `npx tsc --noEmit` | TypeScript check | Before every commit/push |
| `npm run lint` | ESLint | Before PR / push |
| `npm run build` | Production build | Before push (required) |
| `npm test` | Vitest suite | Before PR / push |
| `npm run push:prod` | Push `origin/main` + `origin/prod` | [SparxIT](https://www.sparxitsolutions.com) production deploy |
| `git push origin main && git push origin main:prod` | Same as `push:prod` (manual) | [SparxIT](https://www.sparxitsolutions.com) production deploy |
| `npm run export:oss` | Dry-run OSS export (no push) | Preview public snapshot |
| `./scripts/export-oss.sh --dry-run` | Same as `export:oss` | Preview public snapshot |
| `npm run export:oss:push` | Export, commit, push to `oss/main` | Intentional OSS release only |
| `./scripts/export-oss.sh --push` | Same as `export:oss:push` | Intentional OSS release only |

### What the export script does

- Copies the repo to a temp directory using `oss-export.exclude`
- Removes any `.env` files except `.env.example`
- Scans for JWT-like patterns before pushing
- Requires the `oss` git remote; fails gracefully if missing
- Pushes a fresh commit to `oss` → `main`

---

## CI / Production Deploy

- **Production URL:** `sparxtalent.thesparxitsolutions.com`
- **Deploy branch:** `prod` on the **private** repo only
- CI deploys **only** from `prod` — never from `main` or the public repo

### Auth Send Email Hook (SparxIT prod)

After deploying the `send-auth-email` edge function:

1. **Edge secrets** (Dashboard → Project Settings → Edge Functions → Secrets):
   - `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD` — required for transactional + auth email (optional `SES_SMTP_PORT`, `EMAIL_FROM`)
   - `SEND_AUTH_EMAIL_HOOK_SECRET` — same value as configured on the Auth hook (format `v1,whsec_<base64>`)

2. **Deploy function:** `supabase functions deploy send-auth-email --no-verify-jwt`

3. **Enable hook** (Dashboard → Authentication → Hooks → Send Email):
   - Type: HTTP endpoint
   - URL: `https://<project-ref>.supabase.co/functions/v1/send-auth-email`
   - Secret: generate in Dashboard; copy to edge secrets as `SEND_AUTH_EMAIL_HOOK_SECRET`

4. **Disable GoTrue SMTP** — when the Send Email Hook is enabled, Supabase Auth does not use GoTrue SMTP for auth emails. Auth emails are sent via SES SMTP in the `send-auth-email` edge function.

5. **From address:** Settings → Email → verified sender in AWS SES (default `system@thetalentapp.io`).

6. **Redirect URLs** (Dashboard → Authentication → URL Configuration → Redirect URLs):
   - `https://sparxtalent.thesparxitsolutions.com/applicant/login?verified=1` (applicant signup email verify)
   - `https://sparxtalent.thesparxitsolutions.com/applicant/login`
   - `https://sparxtalent.thesparxitsolutions.com/applicant/dashboard`
   - `https://sparxtalent.thesparxitsolutions.com/reset-password`

   If the verify link's `redirect_to` is not allowlisted, Supabase falls back to **Site URL** (`/`) and applicants briefly hit the staff portal.

Public repo CI (if any) should run tests and build only; it must not deploy [SparxIT](https://www.sparxitsolutions.com) infrastructure.

---

## External Contributors

External contributors fork and PR against **the-talent-app** on GitHub. See [CONTRIBUTING.md](../CONTRIBUTING.md).

[SparxIT](https://www.sparxitsolutions.com) engineers cherry-pick or re-implement accepted changes in the private repo, then re-export to public on the next OSS release.

---

## Related Docs

- [AGENTS.md](../AGENTS.md) — mandatory rules for AI coding agents
- [LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md) — self-hosting prerequisites
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution process per repo
- [SECURITY.md](../SECURITY.md) — vulnerability reporting
