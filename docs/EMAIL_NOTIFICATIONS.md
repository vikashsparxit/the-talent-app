# Email & Notification Inventory — SparxTalent

> **Purpose:** Approved scoped email notifications with admin toggles. Updated 2026-06-19 after implementation.
>
> **Prod setup:** Requires `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD`, optional DB webhooks for `staff_email` and `hire_email` in `internal_webhook_config`.

---

## Architecture summary

| Layer | Mechanism |
|-------|-----------|
| **AWS SES (transactional)** | `_shared/email.ts` → `sendTransactionalEmail()` via SMTP; logs to `email_delivery_log`; quotas from `system_config.email_settings` |
| **Per-type toggles** | `system_config.email_notification_settings` — checked via `shouldSendEmail()` before each scoped send |
| **Auth emails** | Supabase Send Email Hook → `send-auth-email` (not governed by per-type toggles) |
| **Applicant lifecycle** | `send-applicant-email` (reject, etc.) + `send-hire-email` (hired applicant) |
| **Staff emails** | DB webhook or frontend → `send-staff-email` (interview) + `send-hire-email` (hire staff) |
| **Assessment staff emails** | `candidate-portal` → recruiter email on completion |
| **Chitragupta** | Cron functions insert `notifications` only; email fan-out via `_shared/chitraEmailFanout.ts` after insert |
| **In-app (non-email)** | `notifications`, `announcements`, Chitra widget |

**Config:** Settings → Email tab
- `email_settings`: master enable, from/reply, quotas
- `email_notification_settings`: per-type toggles (all default ON)

**Applicant opt-out:** `applicant_profiles.notification_prefs` — checked for applicant-facing types.

---

## Approved scoped notifications (9 types)

| # | Key | Email | Recipients | Trigger | Edge function / helper |
|---|-----|-------|------------|---------|------------------------|
| 1 | `candidate_hired_staff` | Candidate hired (staff) | HR + Admin roles | DB trigger on `candidates.hired_at` | `send-hire-email` via `invoke_hire_email_webhook` |
| 2 | `candidate_hired_applicant` | Candidate hired (applicant) | Applicant email | Same `hired_at` trigger | `send-hire-email` |
| 3 | `candidate_rejected` | Rejection | Candidate/applicant | Staff invokes `send-applicant-email` → `reject` | `send-applicant-email` |
| 4 | `chitra_warning` | Chitragupta warning | Interviewer warned (formal L4) | After `chitra_warning` insert in `chitra-engine` | `fanOutChitraWarningEmail` |
| 5 | `chitra_praise` | Chitragupta appreciation | Praised interviewer/recruiter | After `chitra_praise` insert in `chitra-kra234` | `fanOutChitraPraiseEmail` |
| 6 | `chitra_daily_report` | Chitra daily report | Super admin | After daily brief insert | `fanOutChitraDailyReportEmail` |
| 7 | `chitra_weekly_report` | Chitra weekly report | Super admin | After weekly report insert | `fanOutChitraWeeklyReportEmail` |
| 8 | `interview_scheduled` | Interview scheduled | Interviewer + panelists + recruiters | DB trigger / frontend fallback | `send-staff-email` |
| 9 | `assignment_completed` | Assignment completed | Job recruiters | Assessment submit in `candidate-portal` | `notifyStaffOnAssessmentComplete` |

All templates use `emailLayout.ts` + `transactionalEmailTemplates.ts` with `getEmailBranding()` (no hard-coded company name).

---

## Settings keys (`email_notification_settings`)

```json
{
  "candidate_hired_staff": true,
  "candidate_hired_applicant": true,
  "candidate_rejected": true,
  "chitra_warning": true,
  "chitra_praise": true,
  "chitra_daily_report": true,
  "chitra_weekly_report": true,
  "interview_scheduled": true,
  "assignment_completed": true
}
```

Admin-only RLS on `system_config` row. UI: Settings → Email → **Email Notifications** section.

---

## Template types (`EmailTemplateType`)

Scoped additions:
- `candidate_hired_staff`, `candidate_hired_applicant`
- `chitra_warning`, `chitra_praise`, `chitra_daily_report`, `chitra_weekly_report`
- `assignment_completed`

Existing reused: `reject`, `interview_scheduled`

---

## Trigger & invoke map

```
candidates INSERT/UPDATE (hired_at set)
  └─► notify_candidate_hired → invoke_hire_email_webhook → send-hire-email
        ├─► candidate_hired_staff (HR + admin)
        └─► candidate_hired_applicant (candidate email)

Staff reject action
  └─► send-applicant-email (reject) — gated by candidate_rejected toggle

candidate_interviews (scheduled_at)
  ├─► notify_interview_scheduled → invoke_staff_email_webhook → send-staff-email
  └─► scheduling UI → notifyStaffEmail (fallback)

candidate-portal (assessment complete)
  └─► notifyStaffOnAssessmentComplete — gated by assignment_completed toggle

chitra-engine (L4 formal warning to interviewer)
  └─► notifications insert → fanOutChitraWarningEmail

chitra-kra234 (praise to interviewer/recruiter)
  └─► notifications insert → fanOutChitraPraiseEmail

chitra-daily-brief / chitra-weekly-report
  └─► notifications insert → fanOutChitraDailyReportEmail / fanOutChitraWeeklyReportEmail
```

---

## Prod webhook setup

After applying migration `20260619000007_email_notification_settings.sql`:

```sql
-- Staff interview emails (existing)
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'staff_email',
  '{"enabled": true, "url": "https://YOUR-PROJECT/functions/v1/send-staff-email", "bearer_token": "YOUR_SERVICE_ROLE_KEY"}'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Hire emails (new)
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'hire_email',
  '{"enabled": true, "url": "https://YOUR-PROJECT/functions/v1/send-hire-email", "bearer_token": "YOUR_SERVICE_ROLE_KEY"}'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Deploy edge function: `send-hire-email` (`verify_jwt = false`, service-role auth).

**Secrets:** `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD`, optional `HIRE_EMAIL_HOOK_SECRET`, `STAFF_EMAIL_HOOK_SECRET`.

---

## Out of scope (unchanged)

Auth emails, application received, shortlist/hold/backout, assessment invitation/completion to candidate, verdict_submitted, marketing, staff per-user opt-out.

---

*Approved scope implemented — toggles in Settings; see migration `20260619000007_email_notification_settings.sql`.*

---

## See also

- [DEVOPS_HANDOFF.md](DEVOPS_HANDOFF.md) — self-hosted prod env vars, SES SMTP, DB webhooks
- [AI_PROMPTS.md](AI_PROMPTS.md) — Chitragupta and other AI prompt inventory (not email copy)
- [ROADMAP.md](../ROADMAP.md) — Email Notifications v1–v3 in Active Build Queue
- [README.md](../README.md) — Core Features summary
