# Recruiter playbook

Guide for **Recruiter** role — assigned jobs and candidates, pipeline operations, assessments, pre-screen, and interviews.

> **Scope:** You see jobs where you are assigned (primary or secondary recruiter). You do **not** access admin-only Settings tabs (Users, Email, Chitra, system-wide assessment defaults).

## Navigation

| Page | Route | Use for |
|------|-------|---------|
| Dashboard | `/` | KPIs, action items, upcoming interviews |
| Hiring | `/hiring` | **Primary workspace** — PIPELINE or CANDIDATES toggle with shared job picker |
| Hiring → Candidates | `/hiring?view=list` | Search, profile drawer, bulk actions |
| Hiring → Pipeline | `/hiring?view=board` | Kanban by interview stage |
| Database | `/database` | Full talent pool (header icon or nav) |
| Jobs | `/jobs` | Active / Completed tabs; assigned jobs (create/edit if permitted) |
| Evaluations | `/evaluations` | Assign and track assessments |
| Calendar | `/calendar` | Interview schedule |
| My Interviews | `/my-interviews` | If you also conduct interviews |
| Features | `/features` | Capability reference |

## Daily workflow

### 0. Do strip (Action Queue)

On **Hiring → Pipeline**, the always-on **Do** strip lists concrete next actions to close the role — counts only, not AI essays. Hidden when the selected job is **paused**.

| Chip | Meaning | What tap does |
|------|---------|---------------|
| **Decide** | Proceeded candidates waiting for Advance / Mark Hired | Focuses those cards |
| **Approve pending** | Pending Approval still open | Focuses the Pending column |
| **Schedule / Align…** | Unscheduled interviews; with a deadline: “Align N interviews before {date}” | Filters to schedule work |
| **Add N candidates…** | Funnel too thin vs openings / deadline | Opens Candidates list with Add |
| **Feedback overdue** | Interviews past the feedback window | Focuses overdue cards |
| **No-shows** | Unresolved no-shows to reschedule or clear | Filters to no-show cards |

### 0b. Radar (weekly strategy)

On **Hiring → Pipeline** board only (not Candidates / list), a teal **Radar** FAB sits above Chitra. Open it for a job-scoped panel: plain-English summary, **Do this week**, **Status** (People in play / openings / deadline), and **Funnel notes**. Ops math only — no Gemini. Hidden when the job is paused.

**Four layers on the board:** **Health** = grade · **Do** = click-now · **Radar** = weekly volume/strategy · **Chitra** = watch. Start with Do for today's taps; open Radar for the week.

### 1. Pending Approval

Every candidate mapped to your job lands in **Pending Approval** first.

- Review profile, job fit score, and red flags in the drawer.
- **Approve** → moves to Screening (first interview stage).
- **Decline** → optional reason stored; candidate stays visible for sourcing history.

### 2. Digital application form

When the job requires a digital form:

- Applicant completes via `/applicant/applications/:id/form`.
- Pipeline badge shows **pending** / **submitted**.
- **Fallback:** open candidate drawer → Pre-Screen section → complete form **on behalf** of applicant (modal stays open over drawer).

### 3. Assign assessments

From pipeline card or `/evaluations`:

- Assign job-linked or ad-hoc assessments.
- Track status: invited → in-progress → submitted → expired.
- If job has **pass gating**, you cannot advance stage until pass — contact HR for override.

### 4. Pre-screen

Open **Pre-Screen** dialog from pipeline card:

- Review applicant digital form responses (if submitted).
- Enter screening notes: CTC, notice period, experience, relocation, work mode, communication rating.
- CTC/notice fields are hidden from interviewers.

### 5. Pipeline card actions

| Action | When |
|--------|------|
| Advance stage | After feedback / gates satisfied |
| Schedule interview | Pick interviewer, date/time, mode; **video mode requires meeting link** |
| Panel interview | Add multiple panelists in one step (instant email to each) |
| Assign interviewers | Ongoing assignment across stages |
| Hold / Reject | Pause or remove from active flow |
| Mark as Hired | Sets canonical `hired_at` for reports |
| Send job details | Drawer Pre-Screen → email JD summary to candidate |
| Copy profile link | Drawer → share deep link with teammates who have access |
| Assign assessment | From card menu or Evaluations |

### 6. Interviews

- Schedule from pipeline; interviewers get instant email + morning digest (9 AM IST) if they have interviews that day.
- **Conflict check** — overlapping panelist slots prompt confirm before save; interviewer sees conflict badges on My Interviews.
- Video interviews need a valid http(s) meeting link or save is blocked.
- You may use **My Interviews** and **Calendar** if you also interview.
- You **cannot** override assessment gating — escalate to HR.

### 7. Jobs Completed tab

- Closed jobs appear under **Completed**. Hired candidates are listed on the job.
- Assign/change hired on closed jobs is **admin/HR** (including multi-hire when headcount allows).

## AI tools (recruiter)

- **Job fit score** on pipeline cards and Pending Approval.
- **Analyze candidate** in drawer — suitability, gaps, summary.
- **Pipeline Health** — compact grade chip in the header; open the drawer for insights and regenerate. Uses hire-based conversion and quieter language when N is still low. Recommendation points you at the **Do** strip.
- **Bulk resume upload** and **CSV import** on Candidates / Talent Database (skills + current/preferred location columns map automatically).

## What recruiters cannot do

- Access `/analytics` or `/assessments` builder (admin/HR only).
- Override failed assessment gating (HR/admin only).
- Manage users, email, or Chitra thresholds in Settings.
- Advance pipeline on behalf of interviewers (feedback is their gate).

## Handoffs

| To | When |
|----|------|
| **HR** | Assessment failed but business wants advance; org-wide config |
| **Interviewer** | Interview scheduled — they own feedback |
| **Applicant** | Form or assessment pending in portal |

See [Hiring sequence](./hiring-sequence.md) for the full flow.
