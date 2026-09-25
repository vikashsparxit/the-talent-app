# Interviewer playbook

Guide for **Interviewer** role — My Interviews, mandatory feedback gate, calendar, and read-only assessment visibility.

> **Scope:** You see **assigned** candidates only. You submit feedback; you do **not** advance pipeline stages or override evaluations.

## Navigation

| Page | Route | Use for |
|------|-------|---------|
| My Interviews | `/my-interviews` | Primary hub — upcoming/past by day |
| Hiring → Candidates | `/hiring?view=list` | Assigned candidates only |
| Calendar | `/calendar` | All your scheduled interviews |
| Evaluations | `/evaluations` | **Read-only** assessment status in context |

Mobile: bottom nav surfaces Interviews, Candidates, Calendar, Evaluations.

## Morning digest & schedule emails

- **Daily digest** — if you have interviews that day, you get an email at **9 AM IST** (candidate, stage, time, mode, join link when present).
- **Instant email** — when HR/recruiter schedules you or adds you as a panelist, you get an interview-scheduled email immediately.
- Admin can toggle the digest under Settings → Email → Interviewer daily digest.

## My Interviews — Join meeting & conflicts

- **Upcoming cards** — countdown to start; **Join meeting** when mode is video and a meeting link exists.
- **Conflict badge** — overlapping slots (not back-to-back) show a warning. Ask HR/recruiter to reschedule one of them.
- **Past cards** — denser layout; open kit, profile, notes, or submit feedback from the card.

## Mandatory feedback gate

If you have **overdue interview feedback**, a non-dismissable overlay blocks the app until you submit.

1. Open pending item from the gate or **My Interviews**.
2. Complete structured feedback form.
3. App unlocks immediately on submit.

Chitragupta may nudge internal users about overdue feedback — you will see in-app notifications.

## Submitting feedback

From My Interviews or candidate drawer:

| Field | Notes |
|-------|-------|
| Verdict | Proceed / Reject / Hold / No-Show |
| Overall score | 1–5 |
| Category ratings | Technical, Communication, Problem Solving, Culture Fit |
| Written feedback | Required for audit trail |
| Work samples | Attach files or links (artifacts) |
| Scorecard | Auto-loads from Settings template for stage |

### Live notes → AI draft

During an active interview:

1. Open **live notes** side panel in candidate drawer.
2. Notes auto-save.
3. **Draft with AI** → preview opens from your notes.
4. **Edit** → opens the pre-filled feedback form; **Submit** → saves the draft as feedback.

### Interview kit

When scheduled, open **AI Interview Kit** — questions from JD + resume (fallback from stage template if AI unavailable).

## Assessment visibility

- See assessment status badges on candidate profile (invited / in-progress / submitted / passed / failed).
- You **cannot** assign assessments or override pass/fail.
- Escalate to recruiter or HR if gating blocks scheduling.

## Pre-screen & sensitive fields

- Pre-Screen drawer section is visible but **CTC and notice period are hidden** from interviewers.
- Focus on skills, interview history, and kit.

## Calendar & timezone

Set timezone in **My Profile** (auto-detected). All times display in your local timezone.

## What interviewers cannot do

- Access `/hiring?view=board` PIPELINE kanban (recruiter/HR/admin).
- Access `/jobs`, `/reports`, `/analytics`, `/assessments` builder.
- Access Settings (except profile via header).
- Advance candidates or mark hired.

## Handoffs

| To | When |
|----|------|
| **Recruiter** | Scheduling changes, candidate questions, assessment not complete |
| **HR** | Policy exceptions, scorecard template issues |

See [Hiring sequence](./hiring-sequence.md).
