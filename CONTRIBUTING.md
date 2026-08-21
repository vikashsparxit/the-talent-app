# Contributing to The Talent App

## Dual Repository Model

SparxTalent maintains **two repositories**. Choose the correct one before contributing:

| Audience | Repository | What to do |
|----------|------------|------------|
| **External contributors** | Public [the-talent-app](https://github.com/vikashsparxit/the-talent-app) | Fork, branch, open PRs **here only** |
| **[SparxIT](https://www.sparxitsolutions.com) team** | Private `sparxtalent` | Day-to-day development and production deploy **here only** |

The public repo is a sanitized export — not the source of truth. Accepted changes from the public repo are brought into the private repo by [SparxIT](https://www.sparxitsolutions.com) maintainers, then re-exported on the next OSS release.

**Deploy, push, and OSS sync rules:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (mandatory for all contributors and AI agents).

For complex features beyond what community PRs typically cover — or if your team isn't technical — [SparxIT](https://www.sparxitsolutions.com) offers professional services. Reach out via the [contact form](https://www.sparxitsolutions.com/contact-global.shtml).

---

Thank you for your interest in contributing. This project is open source under the [MIT License](LICENSE).

## Getting Started (external contributors)

1. **Fork** [the-talent-app](https://github.com/vikashsparxit/the-talent-app) and clone your fork locally.
2. **Create a branch** from `main` for your change (`feat/...`, `fix/...`, `chore/...`).
3. **Install dependencies:** `npm install`
4. **Configure environment:** copy `.env.example` to `.env.dev` and fill in your Supabase values (see [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md)).

> **[SparxIT](https://www.sparxitsolutions.com) engineers:** clone the private `sparxtalent` repo instead. Do not develop in the public fork.

## Before You Open a PR

Run these checks locally — all must pass:

```bash
npx tsc --noEmit
npm run lint
npm run build
npm test
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — tooling, deps, housekeeping
- `docs:` — documentation only

Example: `feat: add bulk candidate export`

## Pull Requests

1. Keep PRs focused — one logical change per PR when possible.
2. Describe **what** changed and **why** in the PR body.
3. Link any related issue if applicable.
4. Ensure CI checks pass before requesting review.

## Database Migrations

Schema changes go in `supabase/migrations/` as `YYYYMMDDNNNNNN_description.sql`. **Do not apply migrations to shared environments without review.** RLS must be enabled on every new table.

## Security

Do not commit secrets, API keys, or `.env` files. Report vulnerabilities per [SECURITY.md](SECURITY.md).

## Questions

- Setup and self-hosting: [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md)
- Deploy and dual-repo workflow: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Planned work: [ROADMAP.md](ROADMAP.md)
