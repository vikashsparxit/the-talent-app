# Recruiter playbook

Guide for **Recruiter** role — assigned jobs and candidates, pipeline operations, assessments, pre-screen, and interviews.

> **Scope:** You see jobs where you are assigned (primary or secondary recruiter). You do **not** access admin-only Settings tabs (Users, Email, Chitra, system-wide assessment defaults).

## Navigation

| Page | Route | Use for |
|------|-------|---------|
| Dashboard | `/` | KPIs, action items, upcoming interviews |
| Hiring | `/hiring` | **Primary workspace** — Board (kanban) or List view with shared job picker |
| Hiring → List | `/hiring?view=list` | Search, profile drawer, bulk actions |
| Hiring → Board | `/hiring?view=board` | Kanban by interview stage |
| Database | `/database` | Full talent pool (header icon or nav) |
| Jobs | `/jobs` | View assigned jobs (create/edit if permitted on job) |
| Evaluations | `/evaluations` | Assign and track assessments |
| Calendar | `/calendar` | Interview schedule |
| My Interviews | `/my-interviews` | If you also conduct interviews |
| Features | `/features` | Capability reference |

## Daily workflow

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
| Schedule interview | Pick interviewer, date/time, mode, meeting link |
| Panel interview | Add multiple panelists in one step |
| Assign interviewers | Ongoing assignment across stages |
| Hold / Reject | Pause or remove from active flow |
| Mark as Hired | Sets canonical `hired_at` for reports |
| Assign assessment | From card menu or Evaluations |

### 6. Interviews

- Schedule from pipeline; interviewers notified in their timezone.
- You may use **My Interviews** and **Calendar** if you also interview.
- You **cannot** override assessment gating — escalate to HR.

## AI tools (recruiter)

- **Job fit score** on pipeline cards and Pending Approval.
- **Analyze candidate** in drawer — suitability, gaps, summary.
- **Bulk resume upload** and **CSV import** on Candidates / Talent Database.

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
