# AI Agent Instructions — SparxTalent

> Mandatory rules for any AI coding agent (Cursor, Claude Code, Copilot, etc.) working in this repository.

**Full details:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Repository Model

| Remote | Repository | Use for |
|--------|------------|---------|
| `origin` | `vikashsparxit/sparxtalent` (private) | All development, commits, [SparxIT](https://www.sparxitsolutions.com) production |
| `oss` | `vikashsparxit/the-talent-app` (public) | OSS export only — never push here directly |

The **private** repo is the source of truth. The public repo is a sanitized snapshot.

---

## Non-Negotiable Rules

1. **Commit to `origin` (private).** Never treat the public repo as the working repository.
2. **Never `git push oss`** or push directly to `the-talent-app`. OSS updates only via `npm run export:oss:push` when the user explicitly requests it.
3. **Never expose private-only files** in OSS. Paths in `oss-export.exclude` must stay out of the public export. Add new internal files there before any OSS release.
4. **[SparxIT](https://www.sparxitsolutions.com) production deploy** only via `npm run push:prod` or `git push origin main && git push origin main:prod`. Never deploy prod from the public repo.
5. **Before any push:** `npx tsc --noEmit` and `npm run build` must pass. Never force-push. Never `--no-verify`.

---

## Push Guidance Defaults

| User says | Do |
|-----------|-----|
| "commit" | Commit to private repo only. Do not push unless asked. |
| "push" | Push to `origin` only (private `main`). Do not push OSS or prod unless specified. |
| "deploy" / "push prod" | `npm run push:prod` or `git push origin main && git push origin main:prod` |
| "release OSS" / "push public" | `npm run export:oss:push` only if explicitly requested |

---

## Private-Only Paths (never in OSS)

See `oss-export.exclude`. Key categories: secrets (`.env*`), [SparxIT](https://www.sparxitsolutions.com) automation (`scripts/sparx-runner.mjs`), agent config (`CLAUDE.md`, `.claude/`, `.cursor/`), private infra docs, Supabase diagnostic dumps.

---

## Further Reading

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — authoritative dual-repo workflow
- [CLAUDE.md](CLAUDE.md) — Claude Code project brain (private repo only)
- [CONTRIBUTING.md](CONTRIBUTING.md) — human contributor guide
