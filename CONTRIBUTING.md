# Contributing to The Talent App

Thanks for taking the time to contribute. The Talent App is open source under the [MIT License](LICENSE) and is maintained by [SparxIT](https://www.sparxitsolutions.com). Bug reports, fixes, documentation improvements, and well-scoped features are all welcome.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). How decisions are made is described in [GOVERNANCE.md](GOVERNANCE.md).

## Ways to contribute

- **Report a bug** — use the bug report form under [Issues](https://github.com/vikashsparxit/the-talent-app/issues/new/choose) with steps to reproduce, what you expected, and what happened. Include your release version, your Supabase setup (hosted or self-hosted) and browser where relevant.
- **Suggest a feature** — start in Discussions → Ideas for open-ended ideas, or open a feature request for a concrete, scoped proposal. Search existing issues first.
- **Send a pull request** — small, focused changes are reviewed fastest. For anything large, open an issue first so we can agree on the approach before you invest time.

Security issues should not be reported in public issues — see [SECURITY.md](SECURITY.md).

## Getting started

1. Fork the repository and clone your fork.
2. Create a branch from `main` (`feat/...`, `fix/...`, `docs/...`, `chore/...`).
3. Install dependencies with `npm ci` (Node.js 22 LTS; CI runs on Node 22).
4. Copy `.env.example` to `.env.dev` and fill in your Supabase values — see [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md).
5. Start the app with `npm run dev`.

## Before you open a pull request

Run the same checks as CI:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. Lint warnings are allowed but please do not add new ones.

## Code conventions

- **Frontend:** React 18, TypeScript, Tailwind CSS, shadcn/ui components in `src/components/ui/`, icons from `lucide-react`.
- **Data fetching:** TanStack Query hooks in `src/hooks/` — no raw `fetch` in components. Invalidate queries after mutations.
- **Edge functions:** Deno, in `supabase/functions/`. Return CORS headers on every response and a JSON error body on failure. Do not return raw internal error messages to clients.
- **AI:** all model calls go through Google Gemini from edge functions. Prompt text lives in the function source — see [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md).
- Keep changes minimal and match the style of the surrounding code.

## Database migrations

New installs start from the single schema baseline in `supabase/migrations/`. Schema changes go in a **new** file under `supabase/migrations/`, named `YYYYMMDDNNNNNN_description.sql`, with a timestamp later than every existing file. Never edit or rename a migration that has shipped. Enable Row Level Security on every new table and explain the policies in the pull request description.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — tooling, dependencies, housekeeping

Example: `feat: add bulk candidate export`

## Pull requests

1. Keep each pull request to one logical change.
2. Describe what changed and why, and link the related issue.
3. Add screenshots for UI changes (with no personal data).
4. Note any new migration or environment variable so reviewers and self-hosters know what to apply.

## How accepted pull requests land

This repository is published from SparxIT's internal repository on each release, so pull requests are not merged here directly. When a maintainer accepts your pull request, it is applied internally with you kept as the commit author, labelled `accepted: ships in next release`, and closed with a link to the release that includes it. Contributors are credited in [CHANGELOG.md](CHANGELOG.md) and the release notes.

## Questions and support

- Setup and self-hosting: [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md) and [docs/guides/oss-self-host.md](docs/guides/oss-self-host.md)
- Upgrading between releases: [docs/UPGRADING.md](docs/UPGRADING.md)
- Community and professional support: [SUPPORT.md](SUPPORT.md)
