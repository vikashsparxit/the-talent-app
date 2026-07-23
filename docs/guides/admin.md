# Admin playbook

Guide for **Admin** role — Settings, users, email, assessments builder, and system configuration.

> **Super admin** (Vikash): additionally manages Chitra thresholds and receives Chitragupta reports. See `CHITRA_KRA.md` — not duplicated here.

## Navigation

| Area | Route |
|------|-------|
| Settings | `/settings` |
| Assessment builder | `/assessments`, `/assessments/:id` |
| All staff pages | Pipeline, Candidates, Reports, etc. |
| Features catalogue | `/features` |
| Help & guides | `/help` |

## Settings tabs (admin)

### User Roles

- Assign roles: Admin, HR, Recruiter, Interviewer.
- Enable **can conduct interviews** on any user.
- **Offboarding wizard** — archive user, transfer candidates, disable login.
- Super admin row is protected from role changes.
- Pending users: confirm via `admin-confirm-user` edge function flow.

### Business

- Company logo and name — header and applicant-facing branding.

### Email

- Configure **AWS SES SMTP**: from address, reply-to, company name.
- Toggle scoped notification types (hire, rejection, interview scheduled, **interviewer daily digest**, assessment, Chitra reports, etc.).
- Delivery logged in `email_delivery_log`.
- See `docs/EMAIL_NOTIFICATIONS.md`.

### Assessments

- Org-wide defaults for evaluation builder.
- Link to `/assessments` for full builder.

### Scorecards

- Per-stage criteria, rating scales, default kit questions.
- Auto-load when interviewers submit feedback.

### Application Questions

- Question bank (36 questions, 8 categories).
- Active questions rotate into digital forms (10 random per applicant).

### System config tabs

| Tab | Purpose |
|-----|---------|
| Certifications | Credential scoring tiers |
| Tier 1 Colleges | Institution tier lists |
| Job Domains | Domain taxonomy |
| Teams | Org structure |
| Vendors | Agency tracking |
| Announcements | Time-limited banners |
| Red Flag Rules | Gap/switch/mismatch thresholds |

### Chitra (super admin only)

- Escalation thresholds for overdue feedback and pipeline stalls.
- Chitragupta only inserts notifications and `chitra_escalations` — never modifies candidates.

## Assessment builder (`/assessments`)

- Multi-section evaluations: MCQ, coding, open-ended.
- Time limits, passing score, proctoring settings.
- **AI generate draft** from linked job (experience-tiered).
- Assign via `/evaluations`; candidates take exams at `/exam/:assessmentId`.

## Job-level configuration (`/jobs`)

- Assign recruiters (primary + secondary).
- Link assessment + enable **pass gating** for pipeline.
- Stage templates per job.

## Operational tasks

| Task | Where |
|------|-------|
| Provision user | Settings → Users |
| Fix email delivery | Settings → Email + `email_delivery_log` |
| Re-score all candidates | Settings → Re-score button |
| OSS / self-host docs | [OSS self-host guide](./oss-self-host.md) |

## Admin vs HR

HR shares many Settings tabs but **cannot** access Users, Email, Assessments builder tab, Scorecards (admin-only in Settings UI), or Business branding. Admins own tenant infrastructure; HR owns hiring operations.

## Handoffs

See [Hiring sequence](./hiring-sequence.md) for process flow. Point new staff to `/help` and `/features`.
