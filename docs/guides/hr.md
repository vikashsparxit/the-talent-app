# HR playbook

Guide for **HR** role — full pipeline oversight, evaluation overrides, assessment gating, and **limited Settings** access.

> **Scope:** HR sees all jobs and candidates (not limited to assignment). Admin-only Settings tabs remain restricted.

## Navigation

| Page | Route | Use for |
|------|-------|---------|
| Dashboard | `/` | Org-wide KPIs, funnel, leaderboard |
| Hiring | `/hiring` | All jobs — PIPELINE (kanban) or CANDIDATES (list) |
| Database | `/database` | Full talent pool |
| Jobs | `/jobs` | Active / Completed; assign/change hired on closed jobs |
| Evaluations / Analytics | `/evaluations`, `/analytics` | Assessments + org analytics |
| Assessments builder | `/assessments` | **Admin only** — HR uses Evaluations to assign |
| Reports | `/reports` | Funnel, time & velocity |
| Settings | `/settings` | Branding, scorecards, questions, vendors — not Users/Email/Chitra |
| Help | `/help` | Process guides |

## HR vs Admin Settings

| Tab | HR | Admin |
|-----|:--:|:-----:|
| User Roles | — | ✓ |
| Business branding | — | ✓ |
| Email (AWS SES) | — | ✓ |
| Assessments (org defaults) | — | ✓ |
| Scorecards | — | ✓ |
| Certifications, Colleges, Domains, Teams | ✓ | ✓ |
| Vendors | ✓ | ✓ |
| Application Questions | ✓ | ✓ |
| Announcements | ✓ | ✓ |
| Red Flag Rules | ✓ | ✓ |
| Chitra thresholds | — | Super admin only |

## Pipeline responsibilities

### Pending Approval

Same gate as recruiters — HR can approve/decline any candidate on any job.

### Pre-screen & digital form

- Configure question bank in **Settings → Application Questions** (with admin).
- Review submitted forms in candidate drawer **Pre-Screen** section.
- Recruiters handle day-to-day entry; HR handles escalations and quality.

### Assessment gating

Jobs can require assessment pass before stage advance (`/jobs` → assessment link + pass gating).

| Scenario | HR action |
|----------|-----------|
| Candidate failed but should proceed | Use **Advance without passing assessment** override on `/hiring?view=board` |
| Eval result disputed | Review in `/evaluations/:id`; adjust outcome per policy |
| Re-assign / extend | From Evaluations or pipeline card |

### Mark as Hired

Use **Mark as Hired** on pipeline card — feeds dashboard hires, leaderboard, and time-to-hire reports.

### Jobs Completed — assign / change hired

1. Open `/jobs` → **Completed** tab (closed jobs).
2. Open a closed job — hired candidates are listed.
3. **Assign hired** or **Change** — pick one or more pipeline candidates (multi-hire when headcount allows).
4. Sets `hired_at` the same way as Mark as Hired on the board.

### Interviewer emails (ops)

- Scheduling / adding panelists → instant interview-scheduled email.
- Panelists with interviews today → digest at **9 AM IST** (admin toggle in Settings → Email).
- When scheduling: video mode needs a meeting link; overlapping panelist slots show a conflict confirm.

## Evaluations

- Assign assessments to any candidate.
- Review proctoring signals (tab switches, timeline).
- Export results to CSV.
- **Analytics** tab (`/analytics`) for org-wide assessment metrics.

## Reports & health

- **Reports** — per-job funnel, conversion, sourcing.
- **Time & Velocity** — time to first interview, offer, fill.
- **AI Pipeline Health** — grade (A–F) on the job’s Hiring board header; hire-based conversion; regenerate from the health drawer. Recommendation links to the **Do** strip (Decide / Approve / Schedule / Source / Chase feedback / No-shows).
- **Do strip** — always-on deterministic action queue above the kanban (hidden when paused). Use it for click-now targets: Decide, Approve, Schedule, Source, Feedback, No-shows.
- **Radar** — teal FAB on the Pipeline board (above Chitra; not on Candidates). Weekly volume and funnel strategy with summary, Do this week, Status, and Funnel notes. Deterministic — not AI. Hidden when paused.

## What HR cannot do

- Change user roles or offboard users (admin).
- Configure AWS SES / transactional email toggles (admin).
- Edit Chitra escalation thresholds (super admin).
- Build assessment templates in `/assessments` (admin) — coordinate with admin for new templates.

## Handoffs

| To | When |
|----|------|
| **Admin** | New assessment template, email config, user provisioning |
| **Recruiter** | Day-to-day movement on assigned jobs |
| **Interviewer** | Scheduled interviews and feedback |

See [Hiring sequence](./hiring-sequence.md).
