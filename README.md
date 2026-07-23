# The Talent App — AI-Powered Applicant Tracking System

> A full-cycle recruitment platform with an embedded AI HR Manager, intelligent candidate scoring, and an autonomous pipeline monitoring engine.

> **Repository model**
>
> | | Private `sparxtalent` | Public `the-talent-app` |
> |---|---|---|
> | **Who** | [SparxIT](https://www.sparxitsolutions.com) team only | Self-hosters & external contributors |
> | **GitHub** | `vikashsparxit/sparxtalent` | `vikashsparxit/the-talent-app` |
> | **Remote** | `origin` | `oss` (export only) |
> | **Purpose** | Source of truth, production deploy | Sanitized OSS snapshot |
>
> All deploy, push, and OSS sync questions → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

**Self-hosting:** see [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md) for prerequisites, Supabase setup, migrations, and edge-function secrets.

---

## What is The Talent App?

The Talent App is an ATS that goes beyond tracking — it actively manages the hiring process. Recruiters manage candidates and pipelines; an AI agent named **Chitragupta** watches every activity, enforces deadlines, escalates violations, and celebrates wins — autonomously.

### Core Features

| Area | What it does |
|------|-------------|
| **Unified Hiring** | Single `/hiring` workspace — Board (kanban) and List views with a shared job picker; replaces separate Candidates + Pipeline nav |
| **Global Search** | ⌘K command palette — role-scoped search for candidates, jobs, and interviews from any page |
| **Talent Database** | Full candidate pool with AI-parsed resumes, skill tagging, red flag detection, and credential scoring |
| **Interview Pipeline** | Kanban at `/hiring` with **Do** strip (Decide, Approve, Schedule, Source, Feedback, No-shows), **Radar** FAB (weekly volume/strategy), Health grade chip, drag-and-drop, pinned job tabs, smart stage sorting, stage templates, interview scheduling, structured feedback, work sample uploads, and **Mark as Hired** (`hired_at`) |
| **AI Scoring** | Job fit score (0–100), resume score, red flag analysis — all powered by Gemini; applicant portal ranks open roles with improved deterministic job-match scoring |
| **Pre-Screen & Digital Application** | Question bank (36 questions, 8 categories, 10 random per form), applicant digital application with BGV references, recruiter complete-on-behalf, unified drawer with screening notes |
| **Assessments** | Job-linked assessments with pipeline badges, pass gating, exam consent, tiered AI generation from the Assessments page (6 experience/role profiles), live integrity monitoring (tab-switch counter + warnings), and dynamic portal branding |
| **Evaluations** | Code assessments and custom evaluation forms assigned to candidates; evaluation timeline with integrity events |
| **Email** | Branded transactional email via AWS SES (SMTP) — auth, applicant, and staff flows; nine admin-toggle notification types in Settings → Email; delivery logging. See [docs/EMAIL_NOTIFICATIONS.md](docs/EMAIL_NOTIFICATIONS.md) |
| **Mobile & PWA** | Mobile-first UI with bottom navigation; installable progressive web app — recruiters and interviewers can review pipelines, submit feedback, and prep for interviews on the go |
| **Calendar** | Unified interview calendar across all jobs with colour-coded event pills |
| **Reports** | Pipeline funnel, recruiter leaderboard, sourcing trends, time-to-hire metrics, AI pipeline health (hire-based conversion; regenerate from health drawer) |
| **Chitragupta** | Autonomous AI HR Manager — monitors every activity, escalates issues, rewards good work, and reports daily to the super admin |
| **Applicant Portal** | Apply from careers page, email-verify redirect, application list, digital forms, job match scores, status tracking, and assessments |
| **Role-based Access** | Admin · HR · Recruiter · Interviewer — HR can access Settings for day-to-day config; each role has scoped access |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript (strict) |
| UI Components | Tailwind CSS + shadcn/ui |
| State / Data | TanStack Query v5 |
| Routing | React Router v7 |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| Edge Functions | Deno runtime (Supabase Functions) |
| AI | Google Gemini (`gemini-2.5-flash`) via `GOOGLE_AI_API_KEY` |
| Scheduled Jobs | `pg_cron` (Postgres extension) |

---

## Local Development

### Prerequisites
- Node.js ≥ 18 (use [nvm](https://github.com/nvm-sh/nvm))
- A Supabase project (self-hosted or cloud)
- A Google AI API key ([get one here](https://aistudio.google.com/))

### Quick Start

```bash
git clone <YOUR_GIT_URL>
cd the-talent-app
npm install
cp .env.example .env.dev
# Edit .env.dev — see docs/LOCAL_SETUP_GUIDE.md
npm run dev
```

### Environment Variables

Frontend variables (see [.env.example](.env.example)):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
# Optional, local dev only:
# VITE_GEMINI_API_KEY=your-google-ai-api-key
```

Edge functions additionally require (set in Supabase Dashboard → Edge Functions, or via `supabase secrets set`):

```
GOOGLE_AI_API_KEY=your-gemini-key
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Full setup: [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md)

---

## Database Migrations

All schema changes live in `supabase/migrations/` with the naming convention:

```
YYYYMMDDNNNNNN_description.sql
```

**Never run migrations automatically on shared environments.** Always review SQL before applying:

```bash
supabase db push   # applies pending migrations to your linked project
```

See also [docs/ALL_MIGRATIONS.md](docs/ALL_MIGRATIONS.md).

---

## Key Architecture Decisions

- **Gemini-only AI** — all AI features use Google Gemini. No OpenAI, no Anthropic SDK on the server.
- **Edge Functions are Deno** — import from `https://esm.sh/` or `https://deno.land/std`.
- **RLS on every table** — Row Level Security enforced everywhere. Service role used only inside edge functions.
- **Chitragupta's rules** — the AI HR manager only writes to `notifications` and `chitra_escalations`. It never modifies candidate data or pipeline positions.
- **One super admin** — a single user has `is_super_admin = true` on their profile. This is the principal Chitragupta reports to.

---

## Project Structure

```
src/
├── components/          # Shared UI components
│   ├── candidates/      # Candidate drawer, bulk import, assign dialogs
│   ├── calendar/        # Calendar event pills
│   ├── dashboard/       # Dashboard widgets
│   ├── pipeline/        # Feedback dialog, schedule dialog, stage templates
│   └── ui/              # shadcn/ui base components
├── hooks/               # TanStack Query hooks (data fetching layer)
├── lib/                 # Utilities (cn, formatTz, devGemini, etc.)
├── pages/               # Route-level page components
└── integrations/        # Supabase client + generated types

supabase/
├── functions/           # Edge functions (Deno)
│   ├── chitra-engine/   # Autonomous HR monitor (hourly cron)
│   ├── chitra-chat/     # Super admin natural language interface
│   ├── analyze-candidate/  # Gemini job-fit + red flag analysis
│   ├── score-pipeline/  # Gemini pipeline health scorer
│   └── ...
└── migrations/          # All DB migrations (numbered, reviewed before apply)
```

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full access to everything |
| `hr` | Manage candidates, all jobs, HR escalations |
| `recruiter` | Assigned jobs and candidates only |
| `interviewer` | Assigned candidates, submit feedback |

There is one **Super Admin** (`is_super_admin = true`) who sits above all roles and is Chitragupta's principal.

---

## Deployment

Build the static frontend and deploy `dist/` to your host (CDN, object storage, or reverse proxy). Edge functions deploy to your Supabase project.

```bash
npx tsc --noEmit   # must be clean
npm run build      # must succeed
```

Your CI/CD pipeline and hosting are environment-specific — see [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md) for self-hosted Supabase and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for [SparxIT](https://www.sparxitsolutions.com)'s dual-repo deploy model.

---

## Need help?

The Talent App is fully self-hostable — see [docs/LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md) and [docs/SUPPORT.md](docs/SUPPORT.md) for setup and community support.

If your team isn't technical, or you need deeper customization (integrations, hosted setup, custom workflows), the [SparxIT](https://www.sparxitsolutions.com) team can help — [get in touch](https://www.sparxitsolutions.com/contact-global.shtml).

---

## Contributing & License

- [docs/SUPPORT.md](docs/SUPPORT.md) — self-host, community, and professional services
- [CONTRIBUTING.md](CONTRIBUTING.md) — fork, branch, PR process, quality checks
- [SECURITY.md](SECURITY.md) — responsible disclosure
- [LICENSE](LICENSE) — MIT
- [ROADMAP.md](ROADMAP.md) — planned features
- [AI_FEATURES.md](AI_FEATURES.md) — AI capability reference
- [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md) — engineer prompt inventory (edge functions)
- [docs/EMAIL_NOTIFICATIONS.md](docs/EMAIL_NOTIFICATIONS.md) — scoped email types and admin toggles
- [docs/DEVOPS_HANDOFF.md](docs/DEVOPS_HANDOFF.md) — self-hosted production checklist

---

*Built with love by [SparxIT](https://www.sparxitsolutions.com)*
