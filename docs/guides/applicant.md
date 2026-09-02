# Applicant / candidate playbook

Guide for **candidates** using the careers page and applicant portal.

> **In-app (v1):** This guide lives in `docs/guides/` and ships with OSS. Staff can read it from `/help` (admin reference). Applicant footer link deferred to v2.

## Getting started

| Step | Where |
|------|-------|
| Browse open roles | `/careers` |
| Apply without account | Job detail → apply form on `/careers/:id` |
| Create portal account | `/applicant/login` — email verification redirects to portal |
| Dashboard | `/applicant` or `/applicant/dashboard` |

## Profile

Complete profile at `/applicant/profile`:

- Contact details, experience, education, skills.
- **LinkedIn** — auto-normalised to `https://`.
- Profile completeness improves job match scores on open roles.

## Application lifecycle

After applying:

1. Application appears on applicant dashboard with status.
2. **Job match scores** rank other open roles you may fit.
3. Recruiters review in **Pending Approval** on their pipeline.

## Digital job application form

When required for your application:

- Open from dashboard → `/applicant/applications/:id/form`.
- **10 randomised questions** from the org question bank.
- Background verification references section.
- Status badges: **pending** / **submitted** (visible to recruiters on pipeline).

If you cannot complete in time, your recruiter may complete on your behalf — confirm details with them.

## Online assessments

When assigned an assessment:

1. Notification and dashboard link to exam portal.
2. Open `/exam/:assessmentId` (or linked from portal).
3. **Consent** — exam integrity and proctoring terms shown before start.
4. Timed sections; auto-submit on expiry.
5. Tab-switch monitoring with in-exam warnings.

Results are reviewed by recruiters/HR — you typically do not see detailed scoring in portal.

## Interviews

- Upcoming interviews shown on dashboard.
- Join via meeting link when provided.
- Times display in your saved timezone (set in profile).

## Notification preferences

Manage email preferences from applicant profile settings (`notification_prefs`):

- Control which transactional emails you receive where exposed in UI.
- Auth and critical assessment emails may still send per org policy.

## Compliance note

Applicant data collection (apply form, exam consent, notification prefs) aligns with org privacy policy. Future GDPR/DPDP erasure workflows are tracked in product roadmap — contact the hiring organisation for data requests.

## What applicants cannot do

- Access internal pipeline, `/evaluations`, or staff Settings.
- See other candidates or internal recruiter notes.
- Self-advance application stage.

## Staff cross-reference

Recruiters: [Recruiter playbook](./recruiter.md) · HR: [HR playbook](./hr.md)
