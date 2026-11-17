# Changelog

All notable changes to The Talent App are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on versions before 1.0.0.** Releases from June to October 2026 were
> published as unversioned snapshots of `main`. The 0.x version numbers below
> were assigned retroactively to describe what each snapshot shipped. They were
> not tagged, and they are not available as separate downloads. 1.0.0 is the
> first tagged release.

## [Unreleased]

### Added
- Assessment portal: pasting and text drag-and-drop are blocked in subjective
  answers and the coding editor, with a short notice to the candidate. The
  Google Drive link field is unchanged. Each attempt is recorded as a
  `paste_attempt` integrity event (at most one per question every 3 seconds)
  with the question and the pasted length, never the pasted text.
- Reviewers see paste attempts on the evaluation integrity card and timeline,
  in the Evaluations list, and in a new "Paste Attempts" CSV export column.
  Attempts are a signal for review only and do not change the score. No
  database migration or edge function change is required.

## [1.0.1] - 2026-11-17

Adds Web Push, a Public Jobs API and assessment portal hardening, fixes the
`advance_candidate_stage` authorization check, and clears the open production
dependency advisories.

**Database migrations required.** 1.0.1 adds migrations on top of the 1.0.0
baseline, one of which must be run as the function owner, and one changes what
anonymous clients can read from `jobs`. The public `main` branch was rebuilt
after the v1.0.0 tag, so a v1.0.0 clone cannot fast-forward with `git pull`.
Read [docs/UPGRADING.md](docs/UPGRADING.md) before you upgrade.

### Added
- Web Push for staff in-app notifications, delivered even when the app is
  closed. Uses the standard Push API with a per-instance VAPID key pair; no
  Firebase or paid push vendor is required. Payloads are generic (no candidate
  names, emails or scores). Push stays off until you add the `push` row in
  `internal_webhook_config` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` for edge functions. Events: interview reminders 60 and 15
  minutes before, new application, candidate assigned and assessment graded.
  New edge functions `send-push` and `push-config`. See
  [docs/WEB_PUSH.md](docs/WEB_PUSH.md). Migrations:
  `20261018000001_web_push.sql` (tables, trigger, pg_cron retry) and
  `20261018000002_push_notification_events.sql`.
- Public Jobs API for job boards and partner integrations: the `public-jobs`
  edge function. See [docs/PUBLIC_JOBS_API.md](docs/PUBLIC_JOBS_API.md).
- Assessment portal hardening (`20261011000003_assessment_portal_hardening.sql`,
  with matching `candidate-portal` and `grade-assessment` changes):
  - AI grading runs once per attempt, and the UI can tell "grading pending"
    from a real score.
  - Exam links expire: `token_expires_at` is set on new assignments. Existing
    links with no expiry keep working.
  - Server-side time limit: answers cannot be written after `started_at` plus
    the duration, or after the deadline (plus a small grace), and overdue
    attempts are submitted by a scheduled sweep.
  - Signed-in applicants taking an exam from the dashboard get the same rules.

### Security
- `advance_candidate_stage` authorization fix. The function is
  `SECURITY DEFINER`, and its old check
  (`current_user IN ('postgres', 'service_role', 'supabase_admin')`) always
  matched the function owner, so any signed-in user could advance any
  candidate. Trusted callers are now a `service_role` JWT or a direct database
  session as `postgres` / `supabase_admin` (`session_user`). Everyone else must
  be admin/HR or a recruiter assigned to the job, both stages must belong to
  the same job, and `advanced_by` is set to `auth.uid()`. Migrations:
  `20261027000000_advance_candidate_stage_backup_definition.sql` (read-only;
  save its output as the rollback copy),
  `20261027000001_advance_candidate_stage_authz_fix.sql` (run as the function
  owner) and `20261027000010_advance_candidate_stage_verify.sql` (read-only).
  Smoke test: `supabase/scripts/smoke/20261027_advance_candidate_stage_authz_smoke.sql`.
- Anonymous readers of `jobs` can select only the public posting columns (`id`,
  `title`, `description`, `domain`, `department`, `location`, `job_type`,
  `experience_level` and similar). Salary range, openings, assessment settings,
  status notes and `created_by` are no longer readable without signing in.
  Migration:
  `20261030000001_jobs_anon_public_columns.sql`. **Breaking:** an anonymous
  `select=*` on `jobs` now fails; anonymous clients must name the columns, or
  use the Public Jobs API. Signed-in roles are unchanged.
- `npm audit --omit=dev` reports 0 vulnerabilities. Eleven moderate and low
  advisories remain in development-only tooling (eslint / typescript-eslint
  via `minimatch` and `glob`, `serialize-javascript`, and `workbox-build` via
  `vite-plugin-pwa`); they are not part of the built app.
  - `xlsx` prototype pollution and ReDoS (GHSA-4r6h-8v6p-xvw6,
    GHSA-5pgg-2g8v-p4x9): the unmaintained npm registry package is replaced by
    the official SheetJS 0.20.3 release from `cdn.sheetjs.com`.
  - `vitest` / `@vitest/mocker` path traversal (GHSA-82fw-gwwq-j7x9) and
    `tinypool` prototype pollution (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr):
    vitest 4.1.
  - `braces`, `micromatch` and `postcss-selector-parser` denial of service
    (GHSA-vfj7-8cjw-p6xm, GHSA-rj75-hqrm-r3gf): Tailwind CSS 4.
  - `zod` memory exhaustion when validating oversized constrained collections
    (GHSA-mrhx-c7xc-m3w5, high; no 3.x fix): zod 3.25.76 to 4.6.7. The sign-in
    form reads `ZodError.issues`, since zod 4 removed `ZodError.errors`.
  - `fast-uri` 3.1.8 to 3.1.9 (lockfile only).

### Changed
- Tailwind CSS 4. The theme moved from `tailwind.config.ts` to `@theme` in
  `src/index.css` and PostCSS now uses `@tailwindcss/postcss`. The UI looks the
  same as in 1.0.0. Tailwind CSS 4 needs Safari 16.4+, Chrome 111+ or
  Firefox 128+.
- Excel import (bulk candidate upload, `.xlsx` and `.xls`) loads SheetJS only
  when needed, and shows an error message for files it cannot read.
- `npm ci` downloads SheetJS from `cdn.sheetjs.com`, so build environments need
  access to that host as well as the npm registry.
- `@supabase/supabase-js` 2.117. Update payloads are typed with the generated
  `TablesUpdate` helpers.
- vitest 4.1, tailwind-merge 3, and minor and patch updates to Radix UI,
  TanStack Query, React Hook Form, next-themes and other dependencies.
- Dependency version updates are applied upstream and ship with each release. The
  public repository keeps Dependabot security alerts and security updates.

### Fixed
- Blank white screen after signing in: with `@supabase/realtime-js` 2.1xx, the
  second notifications subscription (bell and Chitra widget) reused the first
  channel and threw. Each subscription now gets its own channel.
- Installed apps and open tabs no longer go blank after a deploy. Missing
  `/assets/*` files return 404 (never `index.html`), the updated service worker
  reloads the page once when it activates, a failed build-file load triggers
  one cache-busting reload with the service worker and caches cleared, and an
  error boundary shows a Reload screen instead of a white page.
- Global search on mobile: the mic button no longer overlaps the dialog's
  close button.

## [1.0.0] - 2026-10-11

First stable, tagged release. It focuses on security hardening and a clean
starting point for new installs.

**Fresh install only, no in-place upgrade from 0.x.** 1.0.0 consolidates the
database schema into a single baseline migration. Existing self-hosters should
back up their data and do a fresh install of 1.0.0; see
[docs/UPGRADING.md](docs/UPGRADING.md). Do not run the baseline against an
existing 0.x database.

### Added
- Interview notifications show times in the recipient's timezone. The time
  zone comes from the user's profile, then the deployment default
  (`default_timezone` in `system_config`, or `DEFAULT_TIMEZONE` for edge
  functions), then UTC. Previously every time was shown in Asia/Kolkata; set
  `default_timezone` for a fixed deployment default.
- `npm run typecheck` script, and continuous integration (typecheck, lint,
  test, build on Node.js 22), CodeQL code scanning and Dependabot for the
  public repository.
- Code of Conduct, support, governance and maintainer documents, issue forms
  and a pull request template.
- [docs/UPGRADING.md](docs/UPGRADING.md), which explains the move from 0.x
  to 1.0.0.

### Security
- Multi-factor authentication is enforced on the server: staff who have a
  verified TOTP factor must complete the MFA challenge before the API returns
  or changes sensitive data. A client-side check alone no longer grants
  access. Users without MFA are not affected.
- Hiring decisions and role changes are written to the audit log by the
  database, and audit entries can no longer be edited, deleted or forged from
  the browser.
- The public job application path is rate limited (per email, per client
  address and overall), and repeat application confirmation emails are
  throttled.
- Edge functions accept cross-origin requests only from a configurable origin
  allowlist (`ALLOWED_ORIGINS`, falling back to `PUBLIC_APP_URL`).
- AI prompts are hardened against prompt injection from candidate-supplied
  content such as resumes and application answers.
- Resume storage paths are validated, and interviewers can open resumes only
  for candidates they are assigned to.
- The candidate portal completion notification requires a valid portal token.
- Email hook secrets are compared in constant time.
- Edge functions no longer return raw internal error messages to clients, and
  debug logging was removed from them.
- The AI provider API key is sent in a request header instead of the URL.
- The bundled nginx configuration adds HSTS, a Permissions-Policy (camera and
  geolocation off; microphone allowed for the app's own origin so voice search
  keeps working) and a report-only Content Security Policy.

### Fixed
- New deploys reach users straight away: the bundled nginx configuration
  revalidates the service worker, its registration script, the web manifest
  and HTML pages on every load, while hashed build assets stay cached.
- Slow role lookups are retried with backoff and identity resolution no longer
  races itself, so pages no longer hang on the loader when the first role
  lookup times out.
- Settings deep links work: `/settings/<tab>` and `?tab=<tab>` open any tab the
  user can see, including Security.
- Signed resume links open in the browser on self-hosted deployments behind an
  API gateway (set `SUPABASE_PUBLIC_URL`).
- Certification tiers are matched on whole words, which prevents false
  credential matches during scoring.
- The invitation email function validates its input.

### Changed
- Database migrations are consolidated into a single baseline,
  `supabase/migrations/20261011000000_baseline.sql`. New installs apply only
  this file; there is no in-place upgrade from 0.x. From 1.0.0 on, migrations
  are append-only on top of the baseline.
- The app type-checks cleanly against regenerated Supabase types, and
  `npm run typecheck` and `npm run lint` report no errors (explicit `any` is a
  lint warning).
- Package metadata (description, license, repository, engines) is filled in.
  Node.js 22 LTS is recommended; Node.js 20 is end-of-life.
- "The Talent App" is used as the product name throughout.
- Optional settings tabs load as extensions, so the core app builds without
  them.
- Removed dead code, stray files, unused dependencies and the Bun lockfiles.
  npm is the supported package manager.

### Removed
- The unused `VITE_GEMINI_API_KEY` frontend variable. Delete it from your
  environment.

## 0.10.0 - 2026-10-10

### Added
- Recruiter of the Month spotlight card on the dashboard.
- Icons animate on hover across the app. Animation is skipped when the system
  "reduce motion" setting is on.

### Changed
- Restyled the hiring list table, kanban cards and column wells, the hiring
  header, the action strip, the health chip and the pipeline radar.
- Updated React Router, Vite, PostCSS and Vitest within their current major
  versions.
- Scheduled jobs read their configuration at runtime instead of from hardcoded
  hosts. **Upgrade note:** set the cron configuration described in the
  self-hosting guide.
- The self-hosting guidance was corrected, and references to unpublished
  documents were removed.

### Fixed
- Dashboard charts show a proper empty state when there is little data, and
  merged stage names display correctly.

### Security
- Hardened applicant write paths, system configuration access and the code
  execution sandbox.
- Removed hardcoded hostnames from migrations and edge functions.

## 0.9.0 - 2026-09-26

### Added
- Animated product demo in the README.
- Dashboard redesign: KPI stat cards, a segmented period toggle, a weekly bar
  chart, a stage distribution chart, and section cards for interviews, actions,
  recruiters and jobs.

### Changed
- New visual design system: neutral color tokens, self-hosted Inter font, a
  brand fill that meets contrast requirements, flat controls, softer overlay
  scrims and faster origin-aware motion.
- Restyled menus, selects, the command palette, tabs and tables. The sidebar
  has pill-style active states, group labels and a skip-to-content link.
- The "Library" navigation group is renamed to "Resources".
- The mobile PWA header is more compact, and the dashboard period tabs stay
  pinned.

### Fixed
- Field error borders use the correct `aria-invalid` styling.

### Security
- Edge functions verify the service-role token, and scheduled (cron) functions
  are locked down.
- Tightened row-level security policies, RPC grants and privileged columns.
- Fixed stored XSS vectors, removed trust in client-computed scores, and closed
  resume access (IDOR/SSRF) and email relay issues.
- Applicants can no longer write to assessment score columns.

## 0.8.1 - 2026-09-24

### Fixed
- Job priority ranks appear only on active jobs.
- The Jobs "Completed" tab is split into separate "Closed" and "Cancelled"
  tabs.

## 0.8.0 - 2026-09-15

### Added
- Company-wide job priority order, shown as numbered ranks.
- A "Cancelled" job status. Migration required.

### Changed
- Company websites on work-experience entries are resolved with a web search
  lookup instead of an AI guess.
- Restyled the career coherence and salary market check panels.

### Fixed
- The salary market check loads cached results when it opens.
- Admins can open shared candidate profile links.

## 0.7.0 - 2026-09-11

### Added
- Accurate tenure calculation and in-timeline employment gap markers on
  candidate profiles.
- A salary market check for candidates, backed by an optional web search
  provider.
- Candidate portal profile photos appear in the candidate list and the
  candidate drawer. Migration required.

## 0.6.0 - 2026-09-03

### Added
- Voice input in global search, using the browser Web Speech API.
- Smart search: a natural-language sentence becomes hiring-list filters (name,
  role, skills, experience, location, stage).
- Reports sub-navigation tabs.

### Changed
- New application shell and design kit: a collapsible sidebar that stays
  collapsed between visits, icon tooltips, the profile menu moved into the
  sidebar, and slimmer header actions.

### Fixed
- The hiring search reads its state from the URL, and questions are no longer
  treated as candidate names.
- TOTP enrollment recovers from a stuck state and always shows a QR code or a
  secret. Copying the secret no longer starts a new enrollment.
- The Settings Business tab renders correctly.
- A header update loop was fixed.

## 0.5.0 - 2026-09-02

### Added
- **Identity and compliance:** TOTP multi-factor authentication for staff, an
  append-only audit log (Settings → Security), a SAML 2.0 SSO stub, and
  compliance settings: privacy and terms URLs, a grievance officer, sub-processor
  disclosure, and applicant consent for sensitive profile fields.
- **Enterprise integration:** calendar invites (`.ics`) attached to interview
  emails, `JobPosting` structured data on careers pages, and external reference
  and source fields on records.
- **Pipeline:** an action strip (decide, approve, schedule, source, feedback,
  no-shows), a pipeline radar with a plain-English summary, a pipeline health
  grade chip and drawer with regenerate, hire-based conversion rates, and
  scenario-aware health scoring.
- **Assessments:** AI grading for subjective, coding and file-upload answers,
  file-upload questions, and bulk import.
- **Interviews:** cancel a scheduled interview with a reason and notify staff,
  interview conflict warnings, Today/Tomorrow/Yesterday grouping, and
  verdict-tinted cards in My Interviews.
- Red flags carousel and a Job Fit breakdown on hover.
- Interview-pool interviewers can approve or decline pending candidates. A
  decline reason is required and shown on kanban cards.
- Paginated Staff and Applicants lists in User Roles, and a gated Confirm Email
  action.
- Integrity timeline events are tagged with the active question.

### Changed
- Denser, quieter pipeline cards with recruiter avatars and status tints.
- Health and action indicators are hidden for paused jobs, and paused tabs sort
  last.

### Fixed
- MCQ answers are scored correctly when the correct answer is stored as a list.
- Pipeline cards show "Pending review" until an assessment has been evaluated.
- AI summaries no longer leak between candidates, and the mobile drawer scrolls
  correctly.
- The feedback dialog no longer wipes interview notes.
- Overlapping interview slots are detected correctly.
- Timezone auto-detection was fixed.

### Security
- Interviewer access is limited to assigned jobs, calendars and evaluations.
  Interviewers can no longer move pipeline stages.
- Fixed a jobs visibility leak and the role scoping of scheduled interviews.
- Parsed resume fields are no longer exposed during candidate upload.

## 0.4.0 - 2026-07-09

### Added
- Interviewer daily digest and instant emails to panelists. Requires a
  scheduled job.
- Email job details to a candidate from the candidate drawer.
- Completed jobs are listed separately with their hired candidates. Admins can
  assign or change the hired candidates on closed jobs, including several hires
  at once.
- Pull-to-refresh on the Jobs, Candidates and Hiring pages in the PWA.

### Changed
- The Hiring view toggles are renamed to "Pipeline" and "Candidates".
- Upcoming Interviews appears first on the mobile dashboard.

## 0.3.0 - 2026-06-23

### Added
- Global search command palette (⌘K).
- A unified `/hiring` workspace that combines Candidates and Pipeline, with
  pinned jobs, rejected candidates sorted last, and the form-sent date.
- Role-based help guides for admins, HR, recruiters, interviewers and
  applicants, plus a self-hosting guide.
- Applicant portal: profile photo, in-app notifications, signup profiles and
  applicant role management. Staff and applicant users appear on separate tabs.
- Tiered AI assessment generation based on job experience and role type, from
  the Assessments page. Editable assessment settings with organization
  defaults.
- A live integrity counter and warnings during assessments.
- Pipeline filters, and pipeline AI analysis that is saved between visits.
- Scoped email notifications with admin toggles, and a branded HTML layout for
  all transactional email.
- Compliance documentation.

### Changed
- **Breaking (configuration):** transactional email is sent over SMTP (for
  example AWS SES) instead of a provider API. Standard `SMTP_*` variables are
  accepted. Update your email environment variables when you upgrade.
- Email settings are split into "Configure" and "Notifications" sub-tabs.

### Fixed
- Applicants no longer see assessment results on completion.
- Assessment submission from the candidate portal no longer fails.
- The current page is kept on refresh while authentication loads.
- Applicant email verification routing, email template CTAs and footer layout
  were fixed. Result emails are no longer sent to candidates.
- Parsed candidate data syncs to the applicant portal on signup.
- Phone and email are validated on application form references.

## 0.2.0 - 2026-06-18

### Added
- Digital job application form for applicants, with a pre-screen question bank
  (categories, randomized questions), split first and last name fields,
  extended profile fields, and recruiter "complete on behalf". Migration
  required.
- Job-linked assessments with AI generation and pass gating.
- Transactional email notifications with a delivery log.
- "Mark as Hired" in the pipeline, with corrected hire metrics.
- Cover letters appear in the candidate drawer.
- Applicants are limited to one active job application.

### Fixed
- Interview history keeps every entry per stage and snapshots stage and round
  numbers.
- Future interviews are classified as upcoming in My Interviews.
- Duplicate job applications from the portal are handled reliably.
- HR settings access, rescheduling errors and resume URLs were fixed.
- The applicant job match score produces fewer false positives.

### Security
- Consolidated row-level security for job application inserts, and hardened the
  stage-advance database function.

## 0.1.0 - 2026-06-16

Initial public release.

### Added
- Talent database with AI-parsed resumes, skill tagging, red flag detection and
  credential scoring.
- Interview pipeline: a kanban board with drag-and-drop, stage templates,
  scheduling, structured feedback, work-sample uploads, panel interviews,
  scorecard templates and AI interview kits.
- AI scoring: job fit score (0–100), resume score and red flag analysis.
- Pre-screen call form, plus code assessments and custom evaluation forms.
- Interview calendar, My Interviews hub, and per-user timezones.
- Reports: pipeline funnel, recruiter leaderboard, sourcing trends, time and
  velocity metrics, and an AI pipeline health scorer.
- An optional AI HR manager agent that monitors activity, escalates issues and
  sends a daily brief to the super admin.
- Applicant portal and careers pages with job matching.
- Role-based access for Admin, HR, Recruiter and Interviewer.
- Mobile-first UI and an installable PWA. Business branding.
- Vendor and referral tracking, announcements, and user offboarding.

[Unreleased]: https://github.com/vikashsparxit/the-talent-app/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/vikashsparxit/the-talent-app/releases/tag/v1.0.1
[1.0.0]: https://github.com/vikashsparxit/the-talent-app/releases/tag/v1.0.0
