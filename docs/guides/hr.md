# HR playbook

Guide for **HR** role — full pipeline oversight, evaluation overrides, assessment gating, and **limited Settings** access.

> **Scope:** HR sees all jobs and candidates (not limited to assignment). Admin-only Settings tabs remain restricted.

## Navigation

| Page | Route | Use for |
|------|-------|---------|
| Dashboard | `/` | Org-wide KPIs, funnel, leaderboard |
| Hiring | `/hiring` | All jobs — Board (kanban) or List view |
| Database | `/database` | Full talent pool |
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

## Evaluations

- Assign assessments to any candidate.
- Review proctoring signals (tab switches, timeline).
- Export results to CSV.
- **Analytics** tab (`/analytics`) for org-wide assessment metrics.

## Reports & health

- **Reports** — per-job funnel, conversion, sourcing.
- **Time & Velocity** — time to first interview, offer, fill.
- **AI Pipeline Health Scorer** — grade and recommendations per job.

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
