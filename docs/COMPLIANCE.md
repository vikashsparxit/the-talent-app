# GDPR / DPDP Compliance Implementation Plan — SparxTalent

> **Status:** P2 / on hold — not in the active build queue. Full checklist remains in [`ROADMAP.md`](../ROADMAP.md#-compliance--gdpr--dpdp-p2).

Based on `ROADMAP.md` compliance section, codebase grep, `docs/`, `Settings.tsx`, applicant portal flows, and migration `20260619000007_email_notification_settings.sql`.

---

## 1. Current State — What Exists vs. Gaps

### ✅ Already in place

| Area | What exists | Key files / tables |
|------|-------------|-------------------|
| **Exam / assessment consent** | Checkbox before start; persisted on `candidate_assessments` (`consent_given`, `consent_given_at`, `consent_source`); server enforces consent in `candidate-portal` | `src/pages/ApplicantExam.tsx`, `src/pages/CandidatePortal.tsx`, `src/components/portal/ExamInterface.tsx`, `supabase/migrations/20260618000001_job_assessment_integration.sql`, `supabase/functions/candidate-portal/index.ts` |
| **Applicant email prefs (UI + storage)** | Three toggles: `application_updates`, `assessment_reminders`, `marketing` (default off) on `applicant_profiles.notification_prefs` | `supabase/migrations/20260615000009_applicant_portal_improvements.sql`, `src/lib/applicantProfile.ts`, `src/components/applicant/ApplicantNotificationMenu.tsx`, `src/pages/ApplicantDashboard.tsx` |
| **Applicant email prefs (enforcement)** | `_shared/email.ts` → `applicantAllowsEmail()` gates `application_*` and `assessment_*` template types before send; logs `skipped` to `email_delivery_log` | `supabase/functions/_shared/email.ts` (lines 41–55, 143–168, 230–243) |
| **Admin email toggles (not staff per-user)** | Nine scoped types in `system_config.email_notification_settings`; Settings → Email → Notifications | `supabase/migrations/20260619000007_email_notification_settings.sql`, `src/pages/Settings.tsx`, `docs/EMAIL_NOTIFICATIONS.md` |
| **Email audit trail** | `email_delivery_log` + quota RPC | Email Notifications v1–v3 (ROADMAP Active Build Queue #1) |
| **Storage / access control** | Private `resumes` bucket; staff-scoped RLS; `system_config` anon leak fixed | `supabase/migrations/20260611000001_security_hardening.sql` |
| **Staff offboarding** | Archive wizard: transfer candidates, disable login, preserve history | `supabase/migrations/20260526000004_user_deactivation.sql`, `supabase/functions/deactivate-user/index.ts`, `src/pages/Settings.tsx` (Users tab) |
| **Staff candidate export** | CSV export of filtered candidates (recruiter tool, not DSAR) | `src/components/candidates/ExportCandidatesDialog.tsx` |
| **Staff hard delete** | Admin/HR can `DELETE` from `candidates` (no request queue, no anonymize path) | `src/hooks/useCandidates.tsx` (`deleteCandidate`), RLS policies in base migration |
| **Cron infrastructure** | `pg_cron` + `pg_net` pattern exists (Chitragupta) | `supabase/migrations/20260421000003_chitra_cron_schedules.sql`, `docs/DEVOPS_HANDOFF.md` §8 |
| **Integrity monitoring disclosure** | Consent copy mentions "integrity monitoring" at exam start | Exam consent UI |

**Clarification on migration `000007`:** `20260619000007_email_notification_settings.sql` is **tenant-wide admin toggles** per email type (`candidate_hired_staff`, `interview_scheduled`, etc.). It is **not** per-staff-user notification prefs — `docs/EMAIL_NOTIFICATIONS.md` explicitly lists "staff per-user opt-out" as out of scope.

---

### ❌ Gaps (mapped to ROADMAP checklist)

| ROADMAP item | Gap |
|--------------|-----|
| **Lawful basis & consent at every collection point** | Consent only on exam portal. **Missing:** careers apply (`src/pages/Careers.tsx`, `QuickApplyDialog`), applicant signup (`src/pages/ApplicantLogin.tsx`), bulk import (`BulkImportDialog.tsx`), manual candidate add (`Candidates.tsx`). No `consent_*` on `candidates` or `applicant_profiles`. No `lawful_basis` metadata. No withdrawal flow. |
| **Data subject rights** | No `data_deletion_requests` table, no applicant self-service access/export/erasure, no HR review queue. Staff CSV export ≠ Article 15/20 portability. Hard delete exists but is unstructured. |
| **Privacy policy hooks** | No configurable privacy URL. No Compliance tab in Settings (tabs today: users, business, email, assessments, scorecards, certifications, colleges, domains, teams, vendors, application-questions, announcements, red-flag-rules, chitra). `ApplicantFooter.tsx` has copyright only. Staff `Auth.tsx` has generic "terms of service" text with no link. |
| **`notification_prefs` full enforcement** | Partially done. **`marketing` pref is UI-only** — not checked in `email.ts`. No interview emails to applicants today (staff-only). Exemption list undocumented. ROADMAP still calls for full audit. |
| **Data retention** | No `system_config` retention keys, no cron, no auto-archive/anonymize, no retention audit log. |
| **Breach notification** | No runbook, no `security_incidents` table. |
| **DPA / sub-processors** | No in-product listing. Processors in use: **Supabase**, **Resend**, **Google Gemini** (`parse-resume`, `analyze-candidate`, `enrich-profile`, Chitragupta functions, etc.). |
| **Cookie / tracking** | No inventory or notice. Uses: Supabase auth `localStorage`, sidebar cookie (`src/components/ui/sidebar.tsx`), announcement dismissals, feature-seen flags (`src/lib/features.ts`), feedback drafts, job referral counts. No third-party analytics SDK found. |
| **India DPDP specifics** | No grievance officer config, no consent manager UI, no children's-data exclusion, no India deployment / localization guidance. |
| **OSS documentation** | **`docs/COMPLIANCE.md` does not exist.** `docs/OSS_LAUNCH_PLAN.md` warns against fake compliance certifications but has no compliance checklist. |
| **Chitragupta boundary** | Correct today (notifications only). Compliance workflows must remain staff-initiated per ROADMAP. |

### Sensitive data note (DPDP-relevant)

`applicant_profiles` collects **DOB** (`dob_documented` required in profile modal), **blood group**, **gender**, **marital status**, **emergency phone** — collected without explicit consent or purpose limitation UI (`ApplicantProfileModal.tsx`). Digital application form and pre-screen add more PII. Resume/assessment data is sent to **Gemini** edge functions.

---

## 2. Phased Rollout

### Phase 1 — Legal hooks & consent foundation (P0)

**User-visible outcome:** Applicants and staff see privacy policy links; consent is captured at signup, apply, and bulk import; admin configures compliance settings in one place.

| Dimension | Detail |
|-----------|--------|
| **Scope** | `system_config.compliance_settings`: `privacy_policy_url`, `terms_url`, `grievance_officer` (name, email), optional `dpa_links[]`. Settings → **Compliance** tab (admin-only). Consent checkbox + policy link on: careers apply, applicant signup, bulk import final step. Static `/privacy` page (renders external URL or hosted markdown). Footer links on careers/applicant pages. |
| **DB migrations** | **Yes** — `compliance_settings` in `system_config`; `candidates` + `applicant_profiles` columns: `consent_given`, `consent_given_at`, `consent_source`, `lawful_basis` (text/enum); optional `consent_audit_log` (subject_type, subject_id, action, source, ip, created_at). |
| **Frontend** | `Settings.tsx` (new tab), `Careers.tsx`, `ApplicantLogin.tsx`, `BulkImportDialog.tsx`, `ApplicantFooter.tsx`, public privacy route in `App.tsx`. |
| **Edge / cron** | None required. |
| **Legal / docs** | `docs/COMPLIANCE.md` (tenant vs. deployer responsibilities, sub-processor list, sample privacy-policy template). Internal `docs/BREACH_NOTIFICATION_RUNBOOK.md` (draft). |
| **Effort** | **L** (~2–3 weeks) |
| **Dependencies** | Legal review of policy text and consent wording; SparxIT privacy URL decision (hosted in-app vs. sparxitsolutions.com). |
| **Blockers** | None technical — legal sign-off is the gate. |

---

### Phase 2 — Consent completeness, prefs audit & DPDP consent manager (P0/P1)

**User-visible outcome:** Consent is recorded when assessments are assigned; applicants can view and withdraw consent; all outbound email paths are documented and gated.

| Dimension | Detail |
|-----------|--------|
| **Scope** | Assign-time notice in `AssignAssessmentDialog` + invitation email links to policy. Applicant portal **Consent & Privacy** section: view consent history, withdraw marketing/general processing (flags record; HR notified). Complete email audit: map every `EmailTemplateType` to pref/toggle/exempt. Enforce `marketing` pref when marketing emails ship. Document exempt types (auth, legal notices). Exam consent: link to tenant privacy URL dynamically. |
| **DB migrations** | **Maybe** — extend `consent_audit_log`; `applicant_profiles.consent_withdrawn_at` or status enum if needed. |
| **Frontend** | `ApplicantDashboard` / profile area, `AssignAssessmentDialog`, email template footers. |
| **Edge** | Update `send-invitation-email`, `send-applicant-email`, etc. to pass `applicantEmail` consistently; add `marketing` type set in `email.ts` when used. |
| **Legal / docs** | Update `docs/EMAIL_NOTIFICATIONS.md` with exemption matrix; `COMPLIANCE.md` consent-withdrawal section. |
| **Effort** | **M** (~1–2 weeks) |
| **Dependencies** | Phase 1 `compliance_settings` and consent columns. |
| **Blockers** | Product decision: what happens on consent withdrawal mid-pipeline (pause vs. continue under legitimate interest). |

---

### Phase 3 — Data subject rights (access, erasure, portability) (P0)

**User-visible outcome:** Applicants can request their data or deletion; HR reviews and approves; structured export and anonymize/hard-delete paths.

| Dimension | Detail |
|-----------|--------|
| **Scope** | `data_deletion_requests` table (status: pending / approved / rejected / completed). Applicant portal: "Download my data" (JSON/ZIP) + "Request deletion". HR queue: Settings → Compliance or Candidates → Privacy Requests. Edge function `export-applicant-data` (profile, applications, assessments, responses metadata — not staff notes). Edge function or RPC `process-erasure-request`: anonymize vs. hard-delete per `compliance_settings.retention_mode`. **No auto-delete without HR confirmation** (per ROADMAP). Audit log of actions. |
| **DB migrations** | **Yes** — `data_deletion_requests`, RLS (applicant insert own; HR/admin read/update), possibly `candidates.anonymized_at`, `erasure_audit_log`. |
| **Frontend** | Applicant portal privacy section; HR review UI in Settings or dedicated page. |
| **Edge** | `export-applicant-data`, `process-erasure-request` (service role, cascade: `candidate_responses`, storage objects, `applicant_profiles`, auth user if requested). |
| **Legal / docs** | Erasure policy (anonymize vs. delete); SLA for request handling; template responses to data subjects. |
| **Effort** | **L** (~3–4 weeks) |
| **Dependencies** | Phase 1 consent infrastructure; legal policy on retention vs. erasure for hired/rejected candidates. |
| **Blockers** | Cascading deletes across `candidates`, `job_applications`, `candidate_assessments`, `candidate_responses`, storage buckets, and linked `applicant_profiles` / auth users — needs careful RPC design. |

---

### Phase 4 — Retention automation & incident logging (P1)

**User-visible outcome:** Inactive candidates auto-flagged/archived per policy; compliance actions logged; optional incident register.

| Dimension | Detail |
|-----------|--------|
| **Scope** | `system_config.data_retention_policy`: `inactive_months`, `action` (archive / anonymize / notify_only). Monthly `pg_cron` → edge `enforce-data-retention`: find candidates with no activity since N months, create HR notifications (Chitragupta nudge or `notifications`), log to `retention_audit_log`. Optional `security_incidents` table for tenant breach logging. |
| **DB migrations** | **Yes** — retention config key, audit tables, indexes on `candidates.updated_at` / last activity. |
| **Frontend** | Settings → Compliance: retention policy editor; retention audit read-only table. |
| **Edge / cron** | New `enforce-data-retention` + `pg_cron` schedule (mirror Chitragupta pattern). |
| **Legal / docs** | Retention schedule in `COMPLIANCE.md`; align with Phase 3 erasure policy. |
| **Effort** | **L** (~2–3 weeks) |
| **Dependencies** | Phase 3 anonymize RPC; definition of "inactive" (application date vs. last interview vs. last login). |
| **Blockers** | HR must define N months and whether hired candidates are exempt before automation goes live. |

---

## 3. India DPDP Specifics — What's Different in This Product

| DPDP requirement | SparxTalent implication |
|------------------|-------------------------|
| **Explicit, informed consent** | Stricter than GDPR "legitimate interest" for recruitment. Every collection point (apply, profile with DOB/blood group, digital form, exam, bulk import) needs clear purpose + consent, not just exam portal. |
| **Consent withdrawal** | Must be as easy as giving consent — applicant Consent Manager (Phase 2) with auditable withdrawal; downstream processing must stop where legally required. |
| **Grievance officer** | Mandatory designation — name + email in Settings → Compliance; surfaced on privacy page and applicant footer (DPDP § grievance redressal). |
| **Children's data** | Recruitment context: add age affirmation ("I am 18+") at signup/apply; reject or flag minors. No dedicated children's consent flow needed if excluded by policy. |
| **Sensitive personal data** | DOB, blood group, gender, marital status, health-adjacent fields in `applicant_profiles` / digital form — require **explicit** consent and purpose limitation (e.g. "for employment verification only"), not bundled with generic ToS. |
| **Data localization** | SparxIT prod likely on Supabase cloud + Gemini (US/EU). Self-hosters in India need `COMPLIANCE.md` guidance: choose India-region Supabase if available, disclose cross-border transfers, DPA with processors. Product cannot enforce localization — documentation + deployer responsibility. |
| **Significant Data Fiduciary (SDF)** | SparxIT scale likely below SDF thresholds today — document assessment; revisit if volume/profiling triggers SDF rules. |
| **Breach notification** | Notify Data Protection Board + affected individuals — timelines differ from GDPR 72h; runbook must cover India authority (Phase 1 doc). |
| **Processor agreements** | Supabase, Resend, Google — tenant must have DPAs; Compliance tab links + OSS README section. |

**GDPR baseline still applies** for EU applicants if SparxIT/OSS serves EU data subjects: same consent, access, erasure, portability, and processor documentation — DPDP adds grievance officer, explicit consent emphasis, and India-specific breach/authority steps.

---

## 4. Quick Wins vs. Heavy Lifts

### Quick wins (days, not weeks)

1. **Draft `docs/COMPLIANCE.md`** — sub-processors, RLS isolation summary, deployer checklist (no code).
2. **Breach runbook** — internal doc only; no product change.
3. **Footer privacy link** — wire to external SparxIT policy URL before full Compliance tab (config hardcode interim).
4. **Consent checkbox on applicant signup** — minimal UI + store on `applicant_profiles` at profile creation.
5. **Email exemption matrix** — document in `EMAIL_NOTIFICATIONS.md` which types bypass `notification_prefs` (auth emails already exempt).
6. **Enforce `marketing` pref in `email.ts`** — even before marketing emails exist (defensive).
7. **Age affirmation** on signup/apply — single checkbox, no migration beyond consent columns.

### Heavy lifts

1. **`data_deletion_requests` + cascading erasure RPC** — many related tables, storage cleanup, auth user deletion.
2. **Applicant data export edge function** — assemble cross-table JSON, signed URLs for resumes, redact staff-only fields.
3. **Retention cron with anonymization** — define activity signals, safe anonymize without breaking pipeline analytics.
4. **Consent at bulk import** — recruiter attestation + per-row lawful-basis metadata; legal weight on deployer.
5. **Full consent audit log** — append-only trail across all flows.
6. **Cookie notice + preference UI** — if classified as non-essential (sidebar cookie, feature flags on public pages).

---

## 5. Recommended Starting Phase for SparxIT Prod

**When the team picks this up, start with Phase 1** — ideally before expanding applicant profile collection further (DOB, blood group, etc.) without consent infrastructure.

**Rationale for SparxIT prod specifically:**

1. **Highest legal exposure today:** PII collected at apply/signup/profile with no policy link or consent record; sensitive fields already in profile modal.
2. **Exam consent is done** — don't re-open; extend the same pattern upstream.
3. **Low risk to hiring ops** — Phase 1 is additive (checkboxes, config, docs); no automated deletion.
4. **Unblocks OSS narrative** — this document supports public repo credibility (`OSS_LAUNCH_PLAN.md` pre-launch checklist).
5. **Phase 3 erasure** can follow once SparxIT legal defines anonymize vs. delete for rejected vs. hired candidates.

**Suggested SparxIT prod sequence:** Phase 1 → Phase 2 (prefs audit + consent manager) → Phase 3 (DSAR) → Phase 4 (retention). Phase 1 + partial Phase 2 (email audit doc) could ship in one release if bandwidth allows.

---

## ROADMAP Checklist Coverage Summary

| ROADMAP item | Current | Target phase |
|--------------|---------|--------------|
| Lawful basis & consent (all collection points) | Exam only | P1 + P2 |
| Data subject rights | None | P3 |
| Privacy policy hooks + Compliance tab | None | P1 |
| `notification_prefs` enforcement | Partial | P2 |
| Data retention | None | P4 |
| Breach process | None | P1 (doc), P4 (optional table) |
| DPA / sub-processors | None | P1 (docs + Settings links) |
| Cookie / tracking | None | P1 (inventory + notice) |
| India DPDP (grievance, consent manager, localization) | None | P1 + P2 + docs |
| OSS `COMPLIANCE.md` | Missing | P1 |
| `candidates.consent_*`, `data_deletion_requests`, retention keys | Missing | P1–P4 |
| HR review gate for erasure | N/A | P3 |
| Chitragupta stays staff-initiated | ✅ | Maintain in all phases |

---

*This is a planning document only — no code or files were modified. Switch to Agent mode when ready to implement Phase 1.*

[REDACTED]