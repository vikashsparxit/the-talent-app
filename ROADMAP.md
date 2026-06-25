# The Talent App — Roadmap

---

## 🚀 Active Build Queue — Sequential

> **Next up:** See Active Build Queue sections below. **Compliance (GDPR / DPDP) is on hold (P2)** — phased plan in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md). Queue **#1, #3, #4 done**; **#2 skipped** — existing applicant profile is sufficient for now.

---

### 1. 📧 Email Notifications — Done ✅
Transactional email via **AWS SES (SMTP)** with quota guards, delivery logging, and staff fan-out.

**Shipped (v1):**
- `email_delivery_log` table + `get_email_send_counts()` RPC for quota tracking
- Shared edge module `_shared/email.ts` (settings, prefs, quota, logging)
- Refactored `send-applicant-email`, `send-invitation-email`, `send-completion-email`
- New `send-staff-email` for interview scheduled + verdict submitted (parallel to in-app notifications)
- Settings → Email tab (admin): enabled, from/reply-to, quota display
- Applicant `notification_prefs` enforced for application/assessment emails
- Hold/backout email templates; duplicate assessment email removed from `assignAssessment`

**Configure:** `SES_SMTP_HOST`, `SES_SMTP_USER`, `SES_SMTP_PASSWORD` (+ optional `SES_SMTP_PORT`, `EMAIL_FROM`) and `SEND_AUTH_EMAIL_HOOK_SECRET` in edge secrets; `send-auth-email` edge function + Auth Send Email Hook in Dashboard (prod); `email_settings` in Settings; optional DB webhook for trigger-only paths.

**Shipped (v2 — auth via Send Email Hook):**
- `send-auth-email` edge function intercepts GoTrue auth emails (signup, recovery, magic link, invite, email change, reauthentication)
- Branded HTML templates in `_shared/authEmailTemplates.ts` (company name + primary color from `business_branding`)
- Local hook wired in `config.toml` `[auth.hook.send_email]`

**Shipped (v3 — scoped toggles + branded layout):**
- Nine admin-toggle notification types in Settings → Email → Notifications (`email_notification_settings`)
- Shared branded layout (`_shared/emailLayout.ts`) for all transactional emails — tenant logo, colors, no hard-coded company name
- Hire, Chitragupta, interview, assessment-complete, and rejection flows respect per-type toggles
- Inventory and trigger map: [docs/EMAIL_NOTIFICATIONS.md](docs/EMAIL_NOTIFICATIONS.md)
- Self-hosted prod checklist: [docs/DEVOPS_HANDOFF.md](docs/DEVOPS_HANDOFF.md)

---

### 2. 👤 Applicant Profile Completion — Skipped ⏭️
**Status:** Not needed for now — cancelled from active queue (Jun 2026).

**Decision:** Current applicant profile and apply/login flow are sufficient; no guided multi-section completion work planned until product asks again.

**Deferred reference:** Applicant Public Profile (ATS Feature Gaps) remains the place for richer public-facing profile work if prioritized later.

---

### 3. 📋 Digital Job Application Form (Pre-Screen) — Done ✅
Replace the offline job application form process with a digital pre-screening round that applicants complete themselves.

**Shipped (Phase 1 + 2):**
- Migration `20260619000001_sync_job_application_from_candidate` — `job_applications.source`, UNIQUE `(job_id, applicant_email)`, backfill + candidate→application sync trigger
- Recruiter-added / imported candidates auto-bridge to `job_applications` (coordinates with `auto_create_candidate_from_application`)
- Drawer Pre-Screen shows digital form when synced; query invalidation on create/add-to-job
- **Send Form to Candidate** email (`application_form_required`) with portal login redirect to form
- Applicant login honors `?redirect=/applicant/applications/:id/form`

**Still open:**
- Per-job custom question configuration beyond the shared question bank
- Full pipeline Pending Approval gate on form completion (badges exist; advance gating optional)

**Implementation notes:**
- Extends existing pre-screen data model and applicant portal apply path (`/careers`)
- Recruiter-side manual pre-screen dialog stays as fallback, not the default entry point

---

### 4. 🧠 Assessments — AI-Native & Useful — Release 1 Done ✅
**Status:** Release 1 shipped — job linkage, pipeline integration, tiered AI generation, integrity P0, and dynamic portal branding live.

**Product summary:** Builder, exam portal, and Evaluations page link assessments per job, surface status in pipeline/drawer, gate stage advance on pass (with admin/HR override), capture exam consent, notify recruiters on completion, and support tiered AI generation from the Assessments page — all in Release 1.

**Builds on:** Evaluations & Assessment Builder (Done). No greenfield assessment engine.

#### Release 1 (current scope) — Phase 1 + AI generate, one release

| # | Item | Status |
|---|------|--------|
| 1 | Migration `20260618000001_job_assessment_integration` — `jobs.assessment_*`, `candidate_assessments.job_id` / consent / `assigned_via`, `assessments.source_job_id` / `ai_generated` | ✅ |
| 2 | Jobs UI — assessment config (enable, default assessment, deadline days, pass override, notify on complete, require pass) | ✅ |
| 3 | `AssignAssessmentDialog` — pre-fill from job default + pass `job_id` / `assigned_via` | ✅ |
| 4 | `AssessmentSection` in candidate drawer — job-linked status, assign CTA | ✅ |
| 5 | Pipeline badges + `usePipelineAssessmentStatuses` batch hook | ✅ |
| 6 | Pass-to-advance gating + admin/HR override on `advance_candidate_stage` | ✅ |
| 7 | Completion notifications — in-app to recruiter + email on job-linked complete | ✅ |
| 8 | Exam consent capture — `consent_given` / `consent_given_at` / `consent_source` at exam start | ✅ |
| 9 | `generate-assessment` edge function — Gemini drafts tiered sections from JD (6 profiles: tech fresher/junior/mid/senior + non-tech fresher/experienced; auto-detect from role type + experience) | ✅ |
| 10 | Generate from Assessments page — create/link assessment from job context (moved from Jobs form); Settings → Assessments for org defaults and tier parameters | ✅ |
| 11 | `AI_FEATURES.md` + `docs/AI_PROMPTS.md` — document job-linked AI assessment generation | ✅ |
| 12 | Assessment integrity P0 — live tab-switch counter, in-exam warnings, evaluation timeline events | ✅ |
| 13 | Dynamic assessment portal branding — tenant logo/colors on exam portal header | ✅ |

**Release 1 tally:** ✅ 13 · ⬜ 0 · 🔜 0

#### 🔜 V2 / deferred

| Item | Notes |
|------|-------|
| Auto-assign on stage entry | Manual assign + job default in Release 1; `assigned_via = 'auto_stage'` reserved in migration |
| AI subjective scoring assist | Open-ended / coding rubric suggestions for evaluators |
| Recruiter builder access | Today admin/HR only for Assessment Builder |
| Clone assessment per job | `source_job_id` column ready; UI deferred |
| Assessment analytics dashboard | Per-job funnel, pass rates, integrity trends |
| Token RLS hardening | Security backlog — `candidate_assessments` / `candidate_responses` always-true token policies |
| Harder GDPR consent at assign-time | Release 1: exam-portal consent; full assign-time + withdrawal flow in Compliance work |

#### Open decisions — resolved

| Decision | Resolution |
|----------|------------|
| Phase 1 vs AI generate timing | **One release** — job linkage + pipeline integration + `generate-assessment` ship together |
| Assignment model | **Manual + job default now**; auto-assign on stage entry → V2 |
| Stage gating | **Must pass to advance** when `require_pass_before_interview` is on; admin/HR can override pass/fail |

#### Manual steps (super admin)

1. ~~Review and apply `supabase/migrations/20260618000001_job_assessment_integration.sql`~~ ✅
2. Regenerate Supabase types if schema drift (`assessment_enabled`, `default_assessment_id`, `assessment_config`, consent columns)
3. Deploy `generate-assessment` edge function
4. Smoke-test: job config → assign → exam consent → complete → recruiter notification → pass gate → override → integrity timeline

#### Key files

| Area | Path |
|------|------|
| Migration | `supabase/migrations/20260618000001_job_assessment_integration.sql` |
| Job types / hook | `src/types/jobs.ts`, `src/hooks/useJobs.tsx` |
| Assessment hooks | `src/hooks/useJobAssessment.tsx` |
| Drawer section | `src/components/candidates/AssessmentSection.tsx` |
| Assign dialog | `src/components/candidates/AssignAssessmentDialog.tsx` |
| Assign mutation | `src/hooks/useCandidates.tsx` (`assignAssessment`) |
| Jobs form | `src/pages/Jobs.tsx` |
| Assessments + AI generate | `src/pages/Assessments.tsx` |
| Settings → Assessments | `src/pages/Settings.tsx` (assessment generation defaults) |
| Pipeline | `src/pages/Pipeline.tsx` |
| Drawer host | `src/components/candidates/CandidateDetailDrawer.tsx` |
| Stage advance | `src/hooks/useInterviewPipeline.tsx`, `advance_candidate_stage` RPC |
| Exam / consent / integrity | `src/pages/ApplicantExam.tsx`, `src/components/portal/ExamInterface.tsx` |
| Completion email | `supabase/functions/send-completion-email/index.ts` |
| AI generate | `supabase/functions/generate-assessment/index.ts` |
| AI docs | `AI_FEATURES.md`, `docs/AI_PROMPTS.md` |

---

## 🔐 Compliance — GDPR / DPDP (P2)

> **P2 — on hold** (documented in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)). The Talent App (OSS self-host + SparxIT production) must eventually meet EU GDPR and India DPDP obligations for personal data collected from applicants and staff. Implement enforceable controls when this track is prioritized; self-hosters should read the compliance doc for tenant vs. deployer responsibilities.

**Scope:**

- **Lawful basis & consent** — Capture and record consent at every data-collection point (careers apply, bulk import, manual add, assessment/exam portal). Store `consent_given`, `consent_given_at`, `consent_source`, and lawful-basis metadata on candidate/applicant records. India DPDP: explicit, informed consent before processing; withdrawal path.
- **Data subject rights** — Workflows for access (Article 15 / DPDP right to access), erasure (Article 17 / right to erasure), and portability (Article 20 / machine-readable export). HR review queue for deletion requests; anonymise vs hard-delete policy per retention rules.
- **Privacy policy hooks** — Configurable privacy-policy URL and consent checkbox on careers apply, applicant login, and bulk-import acknowledgement. Settings → Compliance tab for tenant-specific policy links and DPDP grievance-officer contact (name, email).
- **Applicant `notification_prefs` enforcement** — Audit all outbound email paths (application, assessment, interview, status) to respect applicant opt-out; document which transactional emails are exempt (legal/service notices).
- **Data retention** — Configurable retention policy (e.g. auto-archive or anonymise candidates inactive for N months). Scheduled job or edge cron to enforce; audit log of automated actions.
- **Breach notification process** — Document internal runbook: detect → assess → notify DPA/data subjects within statutory windows (72h GDPR / DPDP timelines). Optional: `security_incidents` table for tenant incident logging.
- **DPA for processors** — Document and link standard DPAs for Supabase, AWS SES, and Google Gemini. Settings or docs page listing sub-processors; self-host OSS README section on processor responsibilities when tenants bring their own keys.
- **Cookie / tracking** — Inventory any cookies, localStorage, or analytics (e.g. Supabase Realtime, feature-seen flags). Cookie notice on public careers/applicant pages if non-essential cookies are used; minimal-tracking default for OSS.
- **India DPDP specifics** — Consent manager UI, grievance officer designation in Settings, data-localisation notes for self-hosters (India deployment guidance), children's data exclusion (recruitment context — no minor applicants).
- **OSS self-host documentation** — `docs/COMPLIANCE.md` (or equivalent): tenant checklist, RLS/data-isolation guarantees, what the deployer is responsible for vs what the app enforces, sample privacy-policy template, DPA/sub-processor list.

**Implementation notes:**

- Builds on partial work: applicant `notification_prefs` (Email Notifications v1), private storage buckets + signed URLs (Security Hardening Jun 2026), user offboarding/archive flow.
- Supersedes the brief "GDPR / Data Privacy Controls" entry in ATS Feature Gaps — see that section for cross-reference only.
- DB changes likely needed: `candidates.consent_*` columns, `data_deletion_requests` table, `system_config` keys for retention policy and grievance officer, optional `consent_audit_log`.
- No automatic deletion without admin confirmation in v1 — HR review gate for erasure requests.
- Chitragupta must not process or expose PII beyond existing notification scope; compliance actions are staff-initiated only.

---

## 🔨 Platform Improvements — Planned

---

### 🏢 SaaS Multi-Tenancy (Subdomain SaaS)
**Status:** Planned — not started · **Priority:** Strategic (post-OSS v0.1.0)

Convert TTA from single-tenant (SparxIT production + OSS self-host) to subdomain-based SaaS at `*.thetalentapp.io` — e.g. `sparxit.thetalentapp.io` for SparxIT, `acme.thetalentapp.io` for other orgs. Each tenant: own business, team invites, isolated data via shared DB + `tenant_id` + RLS.

**Full plan:** [`docs/SAAS_MULTI_TENANCY.md`](docs/SAAS_MULTI_TENANCY.md) — schema, auth, routing, edge functions, SparxIT cutover, phases 0–9, risks, stakeholder checklist.

**Scope honesty:** Platform rewrite (4–7 month estimate); not a config toggle. OSS self-host preserved via `VITE_DEPLOYMENT_MODE=self_hosted`.

---

### 📚 Role-Based User Guides & Process Playbooks
**Priority:** P1 · **Status:** v1 shipped (2026-06-19)

**Product summary:** TTA has grown to 60+ features across five internal roles plus the applicant portal, but there is no single place that tells each user type *how to use the product*, *what hiring process to follow*, and *which features matter for their job*. QA feedback and OSS self-hosters repeatedly surface confusion about role boundaries (recruiter vs HR vs interviewer), assessment gating, digital form vs pre-screen, and Settings tab visibility. This initiative delivers role-specific onboarding and end-to-end process documentation so every stakeholder — staff, applicants, hiring managers, super admin, and self-host deployers — knows what to do and when.

**Why P1 (not P2):** Adoption and correct process execution block value from features already shipped (assessments, digital forms, email, evaluations). Wrong handoffs create data-quality and compliance risk. OSS self-hosters lack SparxIT-style tribal knowledge; without guides, support burden falls on the maintainer. P2 only if bandwidth is constrained — defer in-app first-login tips before deferring written playbooks.

**v1 shipped:** Markdown source in `docs/guides/`; in-app `/help` with role-filtered cards + markdown rendering (`react-markdown` + Vite `?raw` imports); entry points in Footer, Settings (admin/HR), and mobile More menu. Applicant in-app link deferred — `docs/guides/applicant.md` only.

#### Scope — per role

| Role | Guide must cover |
|------|------------------|
| **Admin** | Settings (users, roles, pending users), Email tab (SES SMTP, quota), Assessment Builder (`/assessments`), Application Question Bank, system config (credential rules, domains, Chitra thresholds), announcements, vendor management, compliance hooks (privacy URL, grievance officer — when shipped) |
| **HR** | Full pipeline workflow, Pending Approval gate, pre-screen review, digital application form oversight, assign assessments, Evaluations page + pass/fail override, advance-stage override when assessment gating blocks, limited Settings (branding, scorecards, application questions, vendors — not Email/Users/Chitra) |
| **Recruiter** | Assigned jobs/candidates only, pipeline card actions (approve, advance, hold, reject), assign assessments + job defaults, pre-screen (primary: applicant fills; fallback: recruiter on behalf), schedule/reschedule interviews, job fit / analyze candidate, digital form on behalf, ownership transfer visibility |
| **Interviewer** | My Interviews / pending feedback gate, feedback submission (ratings, verdict, work samples), calendar view, interview notes → AI draft; read-only assessment status in drawer; no pipeline advance or eval override |
| **Applicant / Candidate** | Careers apply, applicant login, profile completion, digital job application form (when required), assessment/exam portal + consent, notification preferences, dashboard status |
| **Hiring manager** *(if distinct from HR)* | Pending Approval decisions, pre-screen shortlist review, what they can vs cannot do in TTA today |
| **Super admin** | Chitragupta widget, escalation thresholds, product insight — pointer to existing KRA; not a duplicate of admin guide |
| **OSS self-hoster** | Initial setup checklist: Supabase, edge secrets, AWS SES SMTP, Gemini, RLS posture, role seeding, link to compliance docs |

Guides should align with the live feature catalogue on `/features` (`src/lib/features.ts` role tabs) — not a parallel feature list.

#### Process flows — hiring sequence

Document the standard end-to-end path and **who does what** at each step:

```
Apply → digital form (if required) → assessment (if required) → pre-screen → interview round(s) → hire
```

| Step | Primary actor | Others involved | Key TTA surfaces |
|------|---------------|-----------------|------------------|
| Apply | Applicant | — | `/careers`, applicant dashboard |
| Digital application form | Applicant (recruiter fallback) | HR configures questions | Applicant form, drawer Pre-Screen, pipeline badges |
| Assessment | Applicant | Recruiter assigns; HR/admin override eval | Assign dialog, exam portal, consent, Evaluations, pipeline gating |
| Pre-screen | Recruiter / HR | Applicant may have already submitted form | Pre-Screen dialog, Pending Approval |
| Interview rounds | Interviewer + Recruiter | HR schedules oversight | Pipeline stages, Calendar, feedback gate |
| Hire | HR / Admin | Recruiter initiates | Pipeline terminal stage, future offer letter (ATS gap) |

**Stakeholder handoffs to spell out:** recruiter owns day-to-day candidate movement; HR owns escalations, eval overrides, and org-wide settings; interviewer owns feedback only; admin owns tenant config. Include failure/rework paths (assessment failed → recruiter blocked vs HR override, form incomplete → schedule warning, overdue feedback → Chitragupta nudge).

**Compliance cross-ref:** Where guides touch applicant data collection, link to [Compliance — GDPR / DPDP (P2)](#-compliance--gdpr--dpdp-p2) — consent at apply, exam portal consent, `notification_prefs`, and future erasure workflows.

#### Deliverables (decide during spec)

| Option | Pros | Cons |
|--------|------|------|
| In-app `/help` or role-aware Help drawer | Contextual, always in sync with deploy | Build + maintenance cost |
| First-login role tips (dismissible) | Fast adoption | Easy to ignore; needs i18n later |
| Settings → **Guides** link per role | Discoverable for power users | Not visible on first day |
| Notion / `docs/` markdown in repo | Fast to ship for OSS; versioned in git | Not in-product for SparxIT staff |
| PDF export per role | Printable for HR onboarding | Stale quickly |

**Recommended v1:** Repo `docs/guides/` (or Notion mirror) per role + link from Settings and footer next to Features Overview; v2 in-app first-login checklist keyed off `profiles.role`.

#### Cross-references

- **Features catalogue:** `/features` — `src/lib/features.ts` (role tabs must match guide sections)
- **QA roles matrix:** `docs/MANUAL_TEST_CASES.md` §18.16 item 9 (Admin / HR / Recruiter / Interviewer permissions spot-check)
- **Compliance:** [Compliance — GDPR / DPDP (P2)](#-compliance--gdpr--dpdp-p2) — consent flows for applicant-facing steps

#### Build checklist

| # | Item | Status |
|---|------|--------|
| 1 | Spec: deliverable format(s) + v1 vs v2 scope sign-off | ✅ Hybrid: `docs/guides/` + `/help` + footer/Settings links; no first-login tips (v2) |
| 2 | End-to-end hiring sequence diagram + handoff table (all roles) | ✅ `docs/guides/hiring-sequence.md` |
| 3 | Admin playbook (Settings, assessments builder, question bank, email, system config) | ✅ `docs/guides/admin.md` |
| 4 | HR playbook (pipeline, pre-screen, digital forms, assessments, evaluations override, Settings limits) | ✅ `docs/guides/hr.md` |
| 5 | Recruiter playbook (pipeline workflow, assign assessments, pre-screen, interviews, job match, form on behalf) | ✅ `docs/guides/recruiter.md` |
| 6 | Interviewer playbook (My Interviews, feedback, calendar, read-only assessment) | ✅ `docs/guides/interviewer.md` |
| 7 | Applicant playbook (profile, apply, digital form, exam portal, notification prefs) | ✅ `docs/guides/applicant.md` (docs only in v1) |
| 8 | OSS self-host quickstart (env, roles, smoke path pointer to MANUAL_TEST_CASES §18.15) | ✅ `docs/guides/oss-self-host.md` |
| 9 | Align guide feature list with `src/lib/features.ts` — no contradictions | ✅ Guides reference real routes/features; `/features` remains catalogue |
| 10 | In-product entry point (Settings link and/or `/help` stub) | ✅ `/help`, Footer, Settings banner, More menu |
| 11 | Optional: first-login dismissible tips per `profiles.role` | ⬜ v2 |
| 12 | QA sign-off: §18.16 roles matrix walkthrough matches guides | ⬜ |

**Tally:** ✅ 10 · ⬜ 2

---

### 🔑 Business self-service Gemini API key
**Complexity:** High · **Status:** Deferred

Allow each tenant to supply their own Gemini API key from Settings (admin-only), stored via a secure edge function — not in client-side config. Touches ~11 edge functions that call Gemini today; requires a full security review (encryption at rest, key rotation, audit logging, fallback behavior when key is missing).

---

### 🌙 Dark Mode
Full dark theme support across all pages and components.

**Notes:**
- Tailwind dark mode already configured (`dark:` classes exist on many components)
- Need a persistent user preference stored in `profiles` or `localStorage`
- Toggle in the top-right header (sun/moon icon)
- Main effort: audit and patch components that don't yet have dark variants (charts, dialogs, modals)

---

### ⚡ Performance — Remaining Bottlenecks
Major page-load work shipped Jun 2026 (see Done). What still slows down at scale:

- **Candidates search / filters** — plain text search is now server-side paginated (Jun 2026); boolean search, skill filter, advanced filters, and "Missing Info" still trigger `forceFullFetch`. Optional: `20260612000003_candidate_search_indexes.sql` (pg_trgm on name/email).
- **Reports / Recruiter Performance** — `useRecruiterPerformance` batches interview fetches across all recruiter-owned candidates; needs a materialized view or cached aggregates RPC.
- **Jobs page** — still uses full `useJobs()` with aggregate counts; could adopt `summary` mode where counts aren't needed.
- ~~**Code cleanup** — `useHolisticPipeline()` removed (Jun 2026).~~

**Next approach:**
- `search_candidates` RPC with pagination + boolean/ILIKE support
- `get_recruiter_performance` RPC to replace client-side batching
- Optional: `candidates.created_at` index if pagination/search RPCs are added

---

### 🔒 Security — Supabase Advisor Backlog
Migrations `20260611000001`–`000003` applied. Advisor exports in `supabase/issues/` flag remaining items:

**P0 — migration ready (`20260612000002_tighten_service_role_rls.sql`):**
- Drops `Service role inserts notifications` and `Service role full access to chitra escalations` (service role + SECURITY DEFINER triggers bypass RLS; no replacement policy needed)

**P1 — review (some intentional for exam portal token flow):**
- `candidate_assessments` / `candidate_responses` — token-based UPDATE/INSERT policies flagged as always-true
- `job_applications` — three overlapping permissive INSERT policies; consolidate to one scoped policy
- `advance_candidate_stage` — mutable `search_path` on function

**P2 — performance indexes (migration ready):**
- `20260612000001_query_performance_indexes.sql` — `chitra_escalations(reference_id, violation_type)`, `candidates(created_at DESC)`, `jobs(created_at DESC)`, `candidate_interviews` partial stage index

**Ignore:** Realtime `list_changes` ~94% DB time — platform overhead, not app code.

---

### 📊 Query Performance Dashboard (Jun 2026 snapshot)
Supabase advisor export: `supabase/issues/Supabase Query Performance Statements (default).csv`

| Query | % DB time | Verdict |
|-------|-----------|---------|
| `realtime.list_changes` | **~94%** | Supabase Realtime WAL polling — not fixable in app code |
| `chitra_escalations` lookup by `reference_id` + `violation_type` | **~0.8%** but **597k calls** | N+1 in `chitra-engine` — **batched**; needs dedup index |
| `candidates` `SELECT *` ORDER BY `created_at` | **~0.4–0.3%** each | Historical full-table fetches — **mitigated** by Jun pagination; add `created_at` index |
| `jobs` with embedded `candidates(count)` | **~0.26%**, 15k calls | Jobs page `useJobs()` — use `summary` mode where counts not needed |
| `candidate_interviews` + full `candidates(*)` join | **~0.2%** | Historical holistic pipeline — **mitigated** by Jun scoped queries |
| `_analytics.log_events` INSERT | **~1.3%** | Supabase platform logging — ignore |
| `net._http_response` cleanup | **~0.4%** | pg_net extension housekeeping — ignore |

**Note:** "743 slow queries" counts any query with max time > threshold — includes platform noise. After index migration + `chitra-engine` batch fix, re-export stats in 48h to measure improvement.

---

### 🎙️ AI Interview Notetaker _(Future)_
Real-time AI transcription and structured note-taking during live interviews (MS Teams, Zoom).

**How it works:**
- Interviewer starts a session from the pipeline card; a Teams/Zoom meeting link is launched
- A bot joins the meeting and transcribes audio in real time via a speech-to-text API
- Gemini processes the transcript: generates structured notes (technical, behavioural, red flags, strengths)
- Notes appear in the feedback form pre-filled after the interview ends; interviewer reviews and submits

**Key challenges:**
- MS Teams Bot Framework integration (Bot App registration, Graph API permissions)
- Zoom SDK / Recall.ai for meeting capture
- Real-time streaming transcript → Gemini pipeline (WebSocket-based)
- Privacy compliance: explicit candidate consent notice before recording starts

**DB changes needed:**
- `interview_transcripts` table: `interview_id`, `raw_text TEXT`, `structured_notes JSONB`, `created_at`
- Consent flag on `candidate_interviews`: `recording_consented_at TIMESTAMPTZ`

---

## 🗂️ ATS Feature Gaps — Planned

> Features common in popular ATS platforms (Greenhouse, Lever, Workday, SmartRecruiters, iCIMS) that The Talent App does not yet have. Ordered by impact.

---

### 🔴 Priority 1 — Core Hiring Workflow Gaps

#### Global Search (⌘K) — Done ✅
Search candidates, jobs, interviews, and pipeline records from anywhere in the app — no need to open Talent Database or Jobs first.

**Shipped (Jun 2026):**
- Command palette via ⌘K (Ctrl+K on Windows) from any page; header search bar on desktop
- Debounced search across candidates (name, email), jobs (title), and scheduled interviews
- Results grouped by entity type; selection opens candidate drawer, job board, or interview context on `/hiring`
- Role-scoped: recruiters see assigned jobs/candidates only; admin/HR see the full tenant

---

#### Time-to-Hire / TAT Metrics
Track the key hiring velocity metrics that HR leadership reports on. Data already partially exists in the DB.

**Metrics to capture:**
- Time to first interview (candidate created → first `scheduled_at`)
- Time to offer (candidate created → hired status)
- Time to fill (job opened → first hire)
- Average days per stage (time spent in each pipeline stage)

**Implementation notes:**
- No new DB columns needed for basic metrics — derive from `candidates.created_at`, `candidate_interviews.scheduled_at`, and job status change timestamps
- New Reports tab: "Time & Velocity" — per-job and aggregate bar charts (recharts)
- KPI cards: avg time-to-hire (last 30/90 days), comparison vs. previous period
- Optionally add `job_status_log` table to track when jobs moved open→paused→closed for accurate time-to-fill

---

#### Offer Letter Management
Complete the hiring loop end-to-end. Currently nothing exists after a candidate is marked "hired."

**How it works:**
- Offer templates configured in Settings (role level, compensation fields, joining date, benefits)
- When a candidate is hired, recruiter clicks "Generate Offer" → prefilled form with candidate + job data
- Offer goes through an approval chain (configurable: recruiter → HR → admin)
- Once approved, offer letter PDF generated and tracked (sent / accepted / declined / lapsed)
- Candidate can digitally accept via applicant portal

**DB changes needed:**
- `offer_letters` table: `candidate_id`, `job_id`, `template_id`, `compensation JSONB`, `status ENUM(draft, pending_approval, approved, sent, accepted, declined, lapsed)`, `approved_by`, `sent_at`, `accepted_at`
- `offer_templates` table: reusable templates per job level
- `offer_approvers` table: configurable approval chain per job/department

---

#### Candidate Communication Log
All recruiter communication with candidates currently happens outside The Talent App — no audit trail.

**How it works:**
- Templated emails (interview invite, rejection, offer, hold) sent directly from The Talent App via configured SMTP/SendGrid
- Every email logged against the candidate: subject, body, sent_by, sent_at, opened_at (if tracking enabled)
- Communication timeline visible in Candidate Detail Drawer (below existing tabs)
- Bulk rejection emails: select multiple candidates → send templated rejection in one click

**DB changes needed:**
- `candidate_communications` table: `candidate_id`, `type (email/note/sms)`, `subject`, `body`, `sent_by`, `sent_at`, `direction (outbound/inbound)`
- `email_templates` table: reusable templates with `{{candidate_name}}`, `{{job_title}}`, `{{interviewer_name}}` placeholders
- Integration: SMTP config in Settings (or SendGrid/Mailgun API key)

---

#### Background Verification (BGV) Tracking
Post-hire BGV is currently managed entirely outside the system with no visibility.

**How it works:**
- When a candidate is hired, recruiter initiates BGV from within The Talent App
- Tracks: BGV vendor (AuthBridge, SpringVerify, custom), date initiated, checks requested (employment, education, criminal, address), status per check, final outcome (clear / discrepancy / adverse)
- Guarantee period from vendor tracked (links to vendor record)
- HR notified when BGV is complete or if a discrepancy is found

**DB changes needed:**
- `bgv_records` table: `candidate_id`, `vendor_name`, `initiated_at`, `initiated_by`, `checks JSONB`, `status ENUM(initiated, in_progress, completed, discrepancy)`, `outcome`, `completed_at`, `notes`

---

### 🟡 Priority 2 — Collaboration & Automation

#### Candidate Notes Thread (@mentions)
Currently notes is a single text field on the candidate. No conversation history.

**How it works:**
- Replace single notes field with a threaded notes/comments section in the Candidate Detail Drawer
- Any user with access can add a note; notes are timestamped and attributed
- @mention any user in a note → they receive a notification (via existing notifications system)
- Internal-only — never visible to candidates
- Pinned notes: recruiter can pin one note as the candidate summary

**DB changes needed:**
- `candidate_notes` table: `candidate_id`, `author_user_id`, `body TEXT`, `is_pinned BOOLEAN`, `created_at`, `updated_at`
- Mentions parsed from body text → insert notifications for mentioned users

---

#### Automated Stage Triggers / Workflow Rules
Reduce manual follow-up by automating common pipeline actions.

**Example triggers:**
- When verdict = `proceeded` → automatically notify next-stage interviewer to schedule
- When verdict = `rejected` → optionally auto-send rejection email from template
- When candidate stuck in stage for N days → Chitragupta nudge (already partially handled)
- When all interviewers submit feedback → notify recruiter that panel is complete

**Implementation notes:**
- Configurable per-job or globally in Settings → "Automation Rules"
- Rules table: `trigger_event`, `condition JSONB`, `action_type (notify/email/move_stage)`, `action_config JSONB`, `is_active`
- Processed by a lightweight edge function triggered by DB webhooks or hourly cron

---

#### Proactive System — Phase 2: Scheduled Email Digest
- Enable `pg_cron` extension in Supabase
- New edge function `send-recruiter-digest`: daily 8 AM UTC, emails each recruiter their action list
- Covers: candidates stuck >7d, jobs deadline ≤5d, assessments expiring tomorrow, pending verdicts
- Migration: `20260414000000_enable_pg_cron.sql` + cron.schedule() call

---

#### Job Requisition / Headcount Approval Workflow
For companies with budget controls — a job must be approved before recruiters can start hiring.

**How it works:**
- Department head raises a "hire request" with: role, level, budget range, justification, target start date
- Goes through approval chain: manager → finance/admin → HR
- Once approved, HR converts requisition into an active Job in The Talent App
- Rejected requisitions stored for audit

**DB changes needed:**
- `job_requisitions` table: `title`, `department`, `level`, `budget_min/max`, `justification`, `status ENUM(draft, pending, approved, rejected)`, `requested_by`, `approved_by`, `converted_job_id`

---

#### Candidate Self-Service Status Page
The applicant portal exists but candidates cannot see their real-time pipeline status.

**How it works:**
- Candidates log in to applicant portal → see current stage ("Your application is in: L2 Technical Interview")
- Status updates automatically as pipeline advances (no manual communication needed)
- Candidate can see scheduled interview date/time, interviewer name (optional)
- Status vocabulary is HR-controlled (no internal verdict language exposed — e.g. "Under Review" not "Hold")

---

#### Applicant Public Profile
**Complexity:** Medium-High · **Status:** Planned

A shareable, public-facing digital resume that applicants build and share with recruiters or anyone — their primary virtual resume for professional outreach.

**How it works:**
- Applicants curate a public profile from the applicant dashboard; published profiles get a unique shareable URL (e.g. `/p/{slug}`) — no login required for viewers
- Serves as the primary digital resume replacement for sharing via link, email, or social — more attractive and always up to date than a static PDF attachment
- Rich content sections beyond basic bio: work experience, education, skills, projects, **accolades**, **certifications**, **acknowledgments**, awards, portfolio links — multiple configurable info blocks to make the page polished and engaging
- **PDF download** button on the public page exports the profile in a print-ready resume format matching the chosen template
- **Multiple design templates** — applicant picks from several visual themes (e.g. Modern, Classic, Minimal, Creative); live preview before publishing
- Applicant controls visibility: publish / unpublish; optional link-only or password-protected sharing
- The Talent App candidates can optionally attach their public profile URL to their candidate record so recruiters can open it from the drawer

**DB changes needed:**
- `applicant_profiles` table: `user_id`, `slug TEXT UNIQUE`, `is_published BOOLEAN`, `template_id TEXT`, `profile_data JSONB` (sections, accolades, certifications, acknowledgments), `updated_at`
- `applicant_profile_templates` seed/config for template definitions (layout, colors, typography)
- Edge function for server-side PDF generation from the active template + profile data
- Public RLS: anon can `SELECT` published profiles by slug only

---

### 🟢 Priority 3 — Compliance & Intelligence

#### Duplicate Candidate Detection (Global / Cross-Job)
Bulk import catches within-batch duplicates. But the same candidate across different jobs or added months apart isn't flagged.

**How it works:**
- When a candidate is added (manual or import), check for fuzzy match on name + phone/email across entire DB
- If potential duplicate found, recruiter sees: "This looks like [Name] added on [date] for [Job]. Link them or keep separate?"
- Merged duplicates: one canonical record, historical job applications preserved

---

#### GDPR / Data Privacy Controls

> **Superseded by [Compliance — GDPR / DPDP (P2)](#-compliance--gdpr--dpdp-p2)** — full scope, DPDP, OSS docs, and processor DPAs live there. Keep this stub for ATS gap tracking only.

**Features (summary):** consent capture, retention policy, right-to-deletion workflow, data export/portability — see priority section for complete checklist.

---

#### Diversity & Inclusion Metrics

**Features:**
- Optional EEO fields on candidate profile (gender, age group — never mandatory, privacy-first)
- D&I dashboard: gender split at each pipeline stage (application → interview → offer → hire)
- Drop-off analysis: where do underrepresented candidates fall out of the funnel?
- Per-job D&I breakdown

---

#### Cost-per-Hire Tracking

**How it works:**
- Job board spend logged per job (manual or API)
- Vendor placement fee auto-calculated from vendor fee % × candidate CTC when hired
- Internal recruiter time (estimated hours × blended rate, configurable)
- Reports: cost breakdown per hire, per job, per source/vendor

**DB changes needed:**
- `hiring_costs` table: `job_id`, `candidate_id`, `cost_type (vendor_fee/job_board/agency/internal)`, `amount`, `currency`, `notes`

---

#### LinkedIn / Browser Extension for Candidate Sourcing

**How it works:**
- Chrome/Edge extension: one-click "Save to The Talent App" button on LinkedIn profiles
- Pulls: name, current role, company, LinkedIn URL, location, skills
- Creates candidate in The Talent App pre-filled; recruiter assigns to a job
- Source auto-set to `linkedin`

---

#### Job Board Integration (Multi-posting)

**How it works:**
- Job configured in The Talent App → one-click post to connected job boards
- API integrations: Naukri (has API), LinkedIn Jobs API, Indeed Employer API
- Inbound applications from job boards auto-create candidates tagged with the source
- Posting status tracked per board: live / paused / expired / budget exhausted

---

#### Pre-Screen Shortlisting (Management Approval Gate) — On Hold

**How it works:**
- When a job is marked as requiring management pre-screen, newly added candidates enter a **"Pending Approval"** stage before any pipeline activity
- Management reviews the profile, resume, red flags, and resume score
- Decision: Approve (moves to pipeline) | Reject (with reason) | Hold

---

## ✅ Done

---

### Unified Hiring & Recruiter UX (Jun 2026)
- **`/hiring`** — Board | List toggle with shared job picker; `/candidates` and `/pipeline` redirect here
- **Job pinning** — per-user pinned jobs in picker (`localStorage`)
- **Pipeline sort** — rejected/on-hold sink to bottom of each stage column; active candidates on top
- **Global Search (⌘K)** — role-scoped command palette for candidates, jobs, and interviews
- **Header icon CTAs** — Database, Jobs, Add Candidate as one-click header buttons
- **Digital form sent tracking** — shared `form_sent_at` on `job_applications` visible to all recruiters

---

### Performance & Load Speed (Jun 2026)
Cold-load performance overhauled across the main ATS pages. Target met for default (unfiltered) views.

- **Candidates / Database** — server-side pagination (25/page), lean column select, scoped assignee/assessment/pipeline-stage queries, `useJobs({ summary: true })`, no duplicate `useParsedProfiles` fetch, full candidate hydrated on drawer open
- **Pipeline** — scoped `useCandidateAssignees`, open-job-only `usePipelineJobCounts`, lean interview + candidate joins, lean pending-approval select
- **Calendar** — `useUpdateInterview()` mutation-only (removed accidental full `useHolisticPipeline` fetch), date-windowed `useScheduledInterviews` per view
- **Dashboard** — `get_dashboard_metrics` RPC (KPIs), `get_sourcing_trend` + `get_interview_stage_funnel` RPCs, `JobsOverview` uses embedded `candidates(count)`, lazy-loaded row-2 widgets (Suspense)
- Migrations: `20260611000002_get_dashboard_metrics.sql`, `20260611000003_dashboard_performance_rpcs.sql`

---

### Security Hardening (Jun 2026)
- `system_config` anon read-all policy dropped
- `resumes` + `interview-artifacts` buckets made private with staff/applicant-scoped RLS
- `get-resume-signed-url` edge function for secure staff/applicant resume viewing
- Staff-role auth guards on unprotected edge functions; `dev_gemini_key` bypass removed
- Interviewers blocked from `/reports` and `/analytics` routes
- Migration: `20260611000001_security_hardening.sql`

---

### User Offboarding & Archive
Guided 3-step wizard in Settings → User Roles to archive departing team members (HR, Recruiter, Interviewer — not Admin).
- **Step 1** — Impact summary: owned candidates, job assignments, pending interviews
- **Step 2** — Mandatory candidate reassignment to a single replacement (skipped for interviewers with no owned candidates)
- **Step 3** — Done: candidates transferred, assignments removed, flagged interviews notify recruiters, login banned
- Deactivated users shown in a collapsible section at the bottom; Reactivate button available
- `profiles.is_active`, `deactivated_at`, `deactivated_by` columns; `deactivate-user` edge function

---

### Manual Interview Notes → AI Feedback Draft
- Notes textarea at the top of the feedback form; auto-saves to `candidate_interviews.interview_notes` 1s after typing stops
- "Draft with AI" button sends notes to Gemini → returns suggested verdict, all four rating scores, and a written feedback summary
- Interviewer reviews and edits before submitting; notes and final feedback stored separately
- Edge function: `draft-feedback`; migration: `interview_notes TEXT` column

---

### Pre-Screen: Relocation & Work Mode Fields
- **Open to Relocation** toggle (Yes / No / Maybe) and **Work Mode Preference** multi-select (WFO / WFH / Hybrid / Flexible) added to the Pre-Screen dialog
- New "Mobility & Work Mode" section between Location and Communication Rating
- Displayed in the Pre-Screen Details panel of the candidate drawer
- `candidate_prescreens.open_to_relocation TEXT`, `work_mode_preference TEXT[]` columns

---

### Company Website Enrichment
- When the candidate drawer opens, `enrich-company-websites` edge function fires silently in the background
- Strips legal suffixes and city names ("Pvt Ltd Noida" → clean brand name) before asking Gemini
- Gemini resolves official website URLs for each company; results stored in `work_experience` JSONB
- Small `↗` ExternalLink icon appears next to company names where a URL was found

---

### Per-User Timezone Preference
- Timezone dropdown in My Profile with auto-detect from browser; 13 common zones (IST listed first)
- All interview times in Pipeline cards and Calendar render in the user's saved timezone
- Interview-scheduled notifications now show IST instead of UTC
- `profiles.timezone TEXT` column; `useUserTimezone` hook; `formatDateTimeInTz` / `formatTimeInTz` utilities

---

### Pending Approval Column in Pipeline
- All new candidates assigned to a job land in a "Pending Approval" column before entering any stage
- Dropped the `trg_auto_enroll_candidate_pipeline` DB trigger — candidates must be explicitly approved
- Approve → moves to first real stage; Decline → candidate stays in talent database
- Shows AI fit score on each pending card to help prioritise

---

### Job Fit Score on Pipeline Cards
- AI suitability score (0–100) shown on every pipeline card and Pending Approval card
- Colour-coded: green ≥70, amber ≥40, red <40
- Sourced from `candidates.suitability_score` computed by the `analyze-candidate` edge function

---

### Features Overview Page (`/features`)
- Full catalogue of 60+ platform features organised by role tabs (All / Admin / HR / Recruiter / Interviewer / Candidate)
- "New" solid green badge on features added within the last 7 days; new features sort to top
- Footer "Features Overview" link with a red notification dot when unseen new features exist
- `src/lib/features.ts` — static catalog; `markFeaturesAsSeen()` backed by `localStorage`

---

### Recruiter Performance Leaderboard (Dashboard)
- Dashboard widget ranking recruiters by candidates sourced and hires made
- Switchable between This Week and This Month
- Top 3 shown with 🥇🥈🥉 medal emojis; avatar colour by rank

---

### Work Sample Artifacts in Interview Feedback
- Interviewers can attach files (PDFs, images, assignments) and external links to interview feedback
- Stored in `interview-artifacts` Supabase Storage bucket
- Rendered as clickable chips in the interview history section of the candidate drawer
- `candidate_interviews.artifacts JSONB` column; `interview-artifacts` public bucket

---

### Chitragupta — AI HR Manager (All 5 Phases)
Autonomous AI HR Manager that monitors the entire hiring pipeline, escalates violations, rewards good work, and reports daily to the super admin.

- **Phase 1** ✅ — DB schema (`chitra_escalations`, `chitra_messages`), `chitra-engine` hourly cron, overdue feedback escalations
- **Phase 2** ✅ — Stuck candidates, job deadline violations, stage bottlenecks, reward engine (praise notifications)
- **Phase 3** ✅ — Daily report to super admin via `chitra-daily-report` cron + weekly intelligence report
- **Phase 4** ✅ — Two-way chat for super admin via `chitra-chat` edge function with full Gemini tool calls
- **Phase 5** ✅ — Escalation threshold config in Settings → Chitra tab; `system_config` key `chitra_escalation_thresholds`

Edge functions: `chitra-engine`, `chitra-daily-report`, `chitra-chat`, `chitra-kra234`, `chitra-kra-phase3`, `chitra-weekly-report`

---

### Candidate Detail Drawer — Intelligence Header
- Job Fit score, Credential score, Red Flag count, and Avg. Interview Rating shown at the top of the drawer
- AI-computed scores from `analyze-candidate` edge function (Gemini)
- Red flags collapsible with per-flag dismissal

---

### Red Flag Detection & Resume Scoring
- Gemini detects employment gaps, frequent job-switching, skill-role mismatches, short senior tenures
- Flags stored as `candidates.red_flags JSONB`; credential score as `candidates.credential_score`
- Shown as badges on candidate cards and in the drawer intelligence header

---

### Pipeline Stage Templates
- Admin/HR can save and reuse interview stage configurations (e.g. Screening → L1 Technical → L2 Technical → HR Round)
- Apply a template to any job; only adds stages not already present (preserves existing interview records)

---

### Proactive & Autonomous System — Phase 1 & 3
- **Phase 1** ✅ — Staleness badges on candidate rows (amber ≥3d, red ≥7d); Action Items dashboard widget
- **Phase 3** ✅ — `notifications` table, `notify_interview_scheduled` + `notify_verdict_submitted` DB triggers, Realtime bell with unread badge

---

### Mandatory Interview Feedback
- Non-dismissable `PendingFeedbackGate` blocks the app until all past-due interviews have a verdict
- Gate cycles through multiple pending items; resolves via submit / no-show / reschedule / cancel
- Pipeline card: pulsing amber "Feedback required" badge + overdue button highlight

---

### Candidate Ownership & Transfer
- `uploaded_by` is the authoritative owner field; survives job re-attachment
- Organic applicants auto-assigned to the job's primary recruiter via DB trigger
- Drawer: owner shown with amber crown; HR/Admin can transfer ownership via inline popover

---

### Bulk Import & CSV Upload
- 3-step flow: upload → column mapping → preview → import
- ~50 column aliases for Naukri / Greenhouse / Lever / generic CSVs
- Duplicate detection within the file and against the existing DB before import

---

### Dashboard
- KPI cards: Talent Pool, Active Candidates, Open Jobs, Hires (week/month toggle) — single `get_dashboard_metrics` RPC
- Stage funnel (`get_interview_stage_funnel` RPC), sourcing trend (`get_sourcing_trend` RPC), active jobs widget, upcoming interviews, action items
- Recruiter leaderboard; Week/Month toggle for all metrics; heavy widgets lazy-loaded
- Interviewer view scoped to assigned candidates only

---

### Database / Candidates Split
- `/database` — full talent pool (all CVs ever added)
- `/candidates` — only candidates mapped to an open job

---

### Jobs Page
- Deadline urgency colouring; recruiters column with primary crown icon; multiple recruiters per job

---

### Auth & User Management
- Pending Users section in Settings; admin can confirm email and assign role in one click
- `admin-confirm-user` edge function; role-based access for all 4 roles

---

### Interview Calendar
- Unified calendar (month / week / day / agenda views) showing all scheduled interviews
- Colour-coded by interview mode (video / phone / in-person)
- Candidate initials avatar + interviewer first name on each event pill
- All times rendered in the user's saved timezone

---

### Interview Scheduling
- Schedule from pipeline card: interviewer, date/time (optional), mode, meeting link
- Reschedule new time is optional (useful when next slot not yet decided)
- Interview-scheduled notification fires to the assigned interviewer with IST time

---

### AI Pipeline Health Scorer (Reports)
- One-click "Analyse Pipeline" button on the Reports page per job
- Gemini returns: overall grade (A–F), speed score, health score, 2–4 factual insights, risk flags, and a single top recommendation
- Score is ephemeral (no DB write) — recalculated each time
- Edge function: `score-pipeline`; uses `useRecruitmentTracker` metrics as input

---

### AI Candidate Analysis (`analyze-candidate`)
- Gemini analyses a candidate's profile against the linked job description
- Returns: suitability score (0–100), matched skills, skill gaps, strengths, concerns
- Stored as `candidates.suitability_score` + `candidates.suitability_analysis JSONB`
- Triggered on-demand from the Candidates page or automatically on bulk resume upload
- Also runs AI summary (`candidates.ai_summary`) and credential enrichment in the same pass

---

### Bulk Resume Upload & AI Parsing
- Upload multiple PDFs at once from the Candidates page
- Gemini extracts: name, email, phone, skills, work experience, education, certifications, awards
- Auto-creates structured candidate records; `uploaded_by` set to the uploading recruiter
- Batch role context: assign a job to all candidates in the upload batch

---

### Work Experience Tenure Display
- Duration automatically calculated and shown next to each work experience entry in the drawer
- Format: "1 yr", "6 mos", "2 yrs 6 mos" — derived from `start_date` / `end_date` (YYYY-MM strings)
- "Present" used when `end_date` is null

---

### Applicant Portal & Careers Page
- Public careers page (`/careers`) listing all open roles — no login required to view
- Candidates apply with name, email, and resume; auto-creates candidate record tagged with source
- Applicant dashboard (`/applicant/dashboard`) for status tracking, application list, and assigned assessments
- Email verification redirects back to applicant portal (not staff login)
- Digital application form at `/applicant/applications/:id/form` with login redirect preservation
- Applicant login separate from the internal ATS login; LinkedIn URLs normalised on profile save

---

### Progressive Web App (PWA) & Mobile UI
- Installable PWA via `vite-plugin-pwa` — add to home screen on iOS/Android; standalone display mode
- Mobile-first shell: bottom navigation, More menu, mobile-optimised dashboard, full-screen notifications
- Recruiters and interviewers can review pipelines, submit feedback, and prep interviews on the go
- Manifest: `public/site.webmanifest`; service worker auto-updates on deploy

---

### Evaluations & Assessment Builder
- Multi-section assessments: MCQ, coding challenges, open-ended questions
- Time limits, scoring thresholds, pass/fail criteria per section
- Save as reusable templates; assign to candidates from the pipeline; job-linked defaults and pass gating
- Tiered AI generation from Assessments page (6 experience/role profiles); org defaults in Settings → Assessments
- Proctoring: live tab-switch counter with in-exam warnings, time-per-question tracking, evaluation timeline
- Dynamic tenant branding on assessment exam portal (logo + colors from business settings)
- Candidates complete assessments in a full-screen timed exam interface (`/exam/:id`)
- Results visible in the Evaluations page with per-section breakdown and integrity flags
- Export assessment results to CSV with selectable columns

---

### Vendor Management
- Track recruitment agencies and vendors: name, contact, fee structure (% of CTC), guarantee period
- Link vendor to candidate source for cost-per-hire reporting
- Active / inactive toggle; full edit and delete support

---

### Announcements
- Admin broadcasts time-limited banners to all internal users (shown in the top bar)
- `expires_at` field — banner auto-hides after expiry
- Multiple announcements supported; managed from Settings → Announcements tab

---

### Advanced Candidate Search
- Boolean search across the full talent pool using AND / OR / NOT operators
- Example: `"React AND Node NOT PHP"`
- Combined with job filter, skill filter, and "Missing Info" filter for targeted sourcing

---

### Can Interview Flag
- Any user (regardless of role) can be enabled as an interviewer via the "Can Interview" toggle in Settings
- Allows senior recruiters or subject-matter experts to conduct interviews without a full Interviewer role assignment
- `profiles.can_conduct_interviews BOOLEAN` column
