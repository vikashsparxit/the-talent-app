# End-to-end hiring sequence

Standard path from application to hire in The Talent App (TTA), with **who owns each step** and **where to work** in the product.

## Flow diagram

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Apply     │───▶│ Digital form     │───▶│  Assessment     │
│  /careers   │    │ (if required)    │    │  (if required)  │
└─────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
┌─────────────┐    ┌──────────────────┐              ▼
│    Hire     │◀───│ Interview rounds │◀─── ┌─────────────────┐
│  /hiring    │    │ hiring/calendar  │    │ Pending Approval│
└─────────────┘    └──────────────────┘    │  + pre-screen   │
                                           └─────────────────┘
```

**Optional branches:** Digital form and assessment steps are skipped when the job is not configured to require them.

## Handoff table

| Step | Primary actor | Others involved | Key surfaces |
|------|---------------|-----------------|--------------|
| **Apply** | Applicant | — | `/careers`, `/careers/:id`; creates candidate with source tracking |
| **Pending Approval** | Recruiter / HR | — | `/hiring?view=board` — first column; approve → Screening, or decline with reason |
| **Digital application form** | Applicant (recruiter fallback) | HR configures question bank | Applicant portal form; pipeline badges; Pre-Screen drawer section; `form_sent_at` visible to all recruiters |
| **Assessment** | Applicant | Recruiter assigns; HR/admin override on fail | `/evaluations`, exam portal `/exam/:id`; job pass gating on `/hiring?view=board` |
| **Pre-screen** | Recruiter / HR | Applicant may have submitted form already | Pre-Screen dialog; screening notes in candidate drawer |
| **Interview rounds** | Interviewer | Recruiter schedules; HR oversight | `/hiring` PIPELINE stages + **Do** strip (Schedule / Feedback overdue / No-shows) + **Radar** FAB (weekly volume), `/calendar`, `/my-interviews`, feedback gate; digest + instant schedule emails |
| **Hire** | HR / Admin | Recruiter often initiates | **Mark as Hired** on pipeline card (also via **Decide** on the Do strip); or assign/change hired on `/jobs` Completed for closed jobs |

## Role ownership summary

| Role | Owns |
|------|------|
| **Recruiter** | Day-to-day candidate movement on assigned jobs; assign assessments; schedule interviews; pre-screen; digital form on behalf |
| **HR** | Full pipeline visibility; eval overrides; assessment advance override; org settings (limited tabs) |
| **Interviewer** | Feedback only — no pipeline advance, no eval override |
| **Admin** | Tenant config — users, email, assessments builder, system rules |
| **Applicant** | Apply, complete form/assessment when assigned, maintain profile |

## Failure and rework paths

| Situation | Default behaviour | Escalation |
|-----------|-------------------|------------|
| **Assessment not passed** | Recruiter blocked from advancing stage (if job has pass gating) | Admin or HR can override via advance dialog on `/hiring?view=board` |
| **Assessment expired / not started** | Recruiter assigns or re-invites from Evaluations or pipeline card | HR reviews in `/evaluations` |
| **Digital form incomplete** | Pipeline badge shows pending; scheduling may warn | Recruiter completes on behalf from candidate drawer, or applicant completes in portal |
| **Declined at Pending Approval** | Card moves to declined area; reason stored | Sourcing visibility only — no automatic re-entry |
| **Overdue interview feedback** | Mandatory feedback gate blocks interviewer app; **Do** strip shows Feedback overdue | Chitragupta nudges internal users (`source = chitra`) |
| **Thin funnel / approaching deadline** | **Do** strip may show Align N interviews / Add N candidates; **Radar** panel surfaces weekly add-N and People in play | Health drawer recommendation; Chitra deadline KRA |
| **Interview no-show** | Interviewer submits No-Show verdict | Recruiter reschedules or rejects from pipeline |

## Related guides

- [Recruiter playbook](./recruiter.md) — pipeline card actions
- [HR playbook](./hr.md) — overrides and Settings limits
- [Interviewer playbook](./interviewer.md) — feedback gate and My Interviews
- [Applicant playbook](./applicant.md) — portal and exam consent

## Feature catalogue

See `/features` for the full list of capabilities referenced above (role tabs match these guides).
