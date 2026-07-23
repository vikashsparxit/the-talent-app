export type Role = 'Admin' | 'HR' | 'Recruiter' | 'Interviewer' | 'Candidate';

export interface Feature {
  id: string;
  title: string;
  description: string;
  roles: Role[];
  addedAt: string;
  highlight?: boolean;
}

export const FEATURES: Feature[] = [
  // ── Admin ─────────────────────────────────────────────────────────────
  {
    id: 'user-offboarding',
    title: 'User Offboarding & Archive',
    description: 'Guided wizard to archive departing team members — transfers owned candidates to a replacement recruiter, removes job assignments, flags pending interviews for reassignment, and disables login immediately. Full history preserved. Deactivated users can be reactivated.',
    roles: ['Admin'],
    addedAt: '2026-05-26',
  },
  {
    id: 'user-roles',
    title: 'User Role Management',
    description: 'Assign and manage Admin, HR, Recruiter, and Interviewer roles. Any user can be enabled as an interviewer regardless of role. Super-admin status is fully protected.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'system-config',
    title: 'System Configuration',
    description: 'Centralised settings for credential scoring rules, job domains, tier-1 colleges, team structures, and certification tiers — all configurable without code changes.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'chitragupta',
    title: 'Chitragupta — AI HR Manager',
    description: 'Autonomous AI HR Manager that monitors every activity in real time: escalates overdue feedback, flags stalled candidates, rewards on-time submissions, sends daily and weekly pipeline intelligence reports, and responds to natural-language queries from the super admin.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'red-flag-rules',
    title: 'Red Flag Rules',
    description: 'Configure which signals trigger red flags on candidate profiles — employment gaps, frequent job-switching, skill mismatches, and short senior tenures. All thresholds adjustable.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'vendor-mgmt',
    title: 'Vendor Management',
    description: 'Track recruitment agencies and vendors — fee structure, placement history, guarantee period, and source attribution for cost-per-hire reporting.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'announcements',
    title: 'Announcements',
    description: 'Broadcast time-limited banners to all internal users. Multiple announcements supported with expiry dates, managed from Settings.',
    roles: ['Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'email-settings',
    title: 'Transactional Email (AWS SES)',
    description: 'Configure AWS SES SMTP from Settings → Email (admin-only): from address, reply-to, and company name. Branded HTML layout for auth, applicant, and staff emails. Scoped notification toggles include hire, rejection, interview scheduled, interviewer daily digest, assessment complete, and Chitragupta reports. Every send logged in email_delivery_log. See docs/EMAIL_NOTIFICATIONS.md.',
    roles: ['Admin'],
    addedAt: '2026-06-19',
    highlight: true,
  },
  {
    id: 'application-questions',
    title: 'Application Question Bank',
    description: 'Settings → Application Questions tab (admin/HR): manage the pre-screen question bank — 36 questions across 8 categories. Each digital application form randomly assigns 10 active questions. Add, edit, activate, or retire questions without code changes.',
    roles: ['Admin', 'HR'],
    addedAt: '2026-06-17',
  },
  {
    id: 'hr-settings-access',
    title: 'HR Settings Access',
    description: 'HR users can open Settings for day-to-day configuration — branding, scorecards, application questions, vendors, and more. Admin-only tabs (users, email, Chitra thresholds, system config) remain restricted.',
    roles: ['HR'],
    addedAt: '2026-06-17',
  },

  // ── HR / Recruiter ────────────────────────────────────────────────────
  {
    id: 'dashboard',
    title: 'Dashboard & KPI Overview',
    description: 'Real-time KPI cards (Talent Pool, Active Candidates, Open Jobs, Hires), sourcing trend, stage funnel, upcoming interviews, recruiter leaderboard, and action items — switchable between This Week and This Month.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-01-01',
  },
  {
    id: 'job-management',
    title: 'Job Management',
    description: 'Create and manage open roles with department, experience level, required skills, salary range, headcount, and deadlines. Set status (open / paused / closed) and assign multiple recruiters with one primary owner. Jobs page splits Active vs Completed tabs; closed jobs show hired candidates with assign/change hire actions for admin/HR.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'jobs-completed-hires',
    title: 'Jobs Active / Completed & Hire Assignment',
    description: 'Jobs page Active and Completed tabs separate open/paused roles from closed ones. Completed jobs list hired candidates; admin/HR can assign or change hired people on a closed job, including multi-select when headcount allows more than one hire.',
    roles: ['Admin', 'HR'],
    addedAt: '2026-07-03',
    highlight: true,
  },
  {
    id: 'send-job-details-email',
    title: 'Send Job Details Email',
    description: 'From the candidate drawer Pre-Screen section, email the candidate job title, location, type, experience, and full description with a careers-page link. Tracks jd_sent_at and supports resend.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-06-25',
  },
  {
    id: 'reports-funnel',
    title: 'Reports & Pipeline Analytics',
    description: 'Per-job pipeline funnel, stage conversion rates, recruiter performance charts, sourcing breakdown, and time-based trends. Export-ready.',
    roles: ['HR', 'Admin', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'time-velocity-reports',
    title: 'Time & Velocity Reports',
    description: 'Dedicated Reports tab for HR and admins tracking hiring speed — time to first interview, time to offer, time to fill, and average days per stage. KPI cards with period-over-period deltas and per-job bar charts.',
    roles: ['Admin', 'HR'],
    addedAt: '2026-06-09',
  },
  {
    id: 'pipeline-health-scorer',
    title: 'AI Pipeline Health Scorer',
    description: 'Grade the open role (A–F) from hire-based conversion, speed, and health — with scenario-aware language when the funnel is still small. Compact chip in the Pipeline header; open the drawer for insights, risks, and regenerate (no refresh icon on the chip). Recommendation points at the Do strip so you can act next.',
    roles: ['HR', 'Admin', 'Recruiter'],
    addedAt: '2026-07-14',
    highlight: true,
  },
  {
    id: 'pipeline-action-queue',
    title: 'Pipeline Do Strip (Action Queue)',
    description: 'Always-on deterministic “Do” strip on Hiring → Pipeline (hidden when the job is paused). Concrete next actions: Decide, Approve pending, Schedule (deadline-aware “Align N interviews before {date}”), Source (“Add N candidates this week”), Feedback overdue, and Reschedule/clear no-shows. Tap a chip to focus/filter the board or jump to Add Candidate. Complements Health (score), Radar (weekly strategy), and Chitra (watch) — Do is where you click now.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-07-14',
    highlight: true,
  },
  {
    id: 'pipeline-radar',
    title: 'Pipeline Radar',
    description: 'Teal floating FAB on Hiring → Pipeline (board only, above Chitra; animated radar glyph). Opens a job-scoped panel with a plain-English summary, Do this week actions, Status (People in play / openings / deadline), and Funnel notes. Deterministic weekly volume and closure strategy — no Gemini. Hidden when the job is paused; not shown on Candidates / list view. Complements Do (click-now chips) and Health (grade).',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-07-14',
    highlight: true,
  },
  {
    id: 'prescreen-form',
    title: 'Pre-Screen & Digital Application Drawer',
    description: 'Unified candidate drawer section combining the Applicant Digital Form (randomised question responses, BGV references, submission status) with Recruiter Screening Notes (CTC, notice period, experience, relocation, work mode, communication rating). CTC and notice details hidden from interviewers.',
    roles: ['HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-17',
  },
  {
    id: 'digital-application-form',
    title: 'Digital Job Application Form',
    description: 'Per-job digital application with 10 randomised questions from the bank, background-verification references, and pipeline status badges (pending / submitted). Applicants complete via the portal; recruiters can complete on behalf from a dedicated modal without closing the candidate drawer. Shared `form_sent_at` on the application shows when the form was last emailed — visible to all recruiters on the job.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-06-19',
  },
  {
    id: 'mark-as-hired',
    title: 'Mark as Hired',
    description: 'Explicit "Mark as Hired" action on pipeline cards sets candidates.hired_at — the canonical hire timestamp used by dashboard KPIs, recruiter leaderboard, and time-to-hire reports instead of inferring hire from stage movement. On closed jobs, admin/HR can also assign or change hired candidates from the Jobs Completed tab.',
    roles: ['HR', 'Recruiter', 'Admin'],
    addedAt: '2026-06-17',
  },
  {
    id: 'evaluation-builder',
    title: 'Custom Assessment Builder',
    description: 'Build multi-section evaluations with MCQs, coding problems, open-ended questions, and file-upload answers (file and/or Google Drive/Docs link). Set time limits, scoring thresholds, and passing criteria. Generate draft assessments with AI from a linked job (tiered by experience and role type). Org defaults in Settings → Assessments.',
    roles: ['Admin', 'HR'],
    addedAt: '2026-06-19',
    highlight: true,
  },
  {
    id: 'evaluation-assign',
    title: 'Candidate Evaluations & Proctoring',
    description: 'Assign assessments to candidates, track status (invited / in-progress / submitted / expired), and review results with live integrity monitoring — tab-switch counter with in-exam warnings, evaluation timeline events, and time-per-question logs. Export results to CSV.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-06-19',
    highlight: true,
  },

  // ── Talent Database & Pipeline ────────────────────────────────────────
  {
    id: 'unified-hiring',
    title: 'Unified Hiring Workspace',
    description: 'Single `/hiring` hub with PIPELINE (kanban board) and CANDIDATES (list) view toggles — switch without leaving the page. Shared job picker drives both views. Pipeline board includes Do strip and Radar FAB. Replaces separate Candidates and Pipeline nav items for one recruiting workflow.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-23',
    highlight: true,
  },
  {
    id: 'copy-profile-link',
    title: 'Copy Candidate Profile Link',
    description: 'Copy a shareable deep link to a candidate profile from the candidate drawer — opens the drawer for teammates with access; shows an access-denied state when the recipient cannot view that candidate.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-07-09',
  },
  {
    id: 'pull-to-refresh',
    title: 'Pull-to-Refresh (PWA)',
    description: 'On mobile/PWA, pull down at the top of Dashboard, Jobs, Candidates, and Hiring to refresh the current page data — same gesture as native apps.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-07-03',
  },
  {
    id: 'global-search',
    title: 'Global Search (⌘K)',
    description: 'Command palette from any page (⌘K / Ctrl+K) — search candidates, jobs, and upcoming interviews in one place. Results are role-scoped; selecting a result opens the candidate drawer, job board, or interview context directly.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-23',
    highlight: true,
  },
  {
    id: 'job-pipeline-pinning',
    title: 'Pin Jobs in Pipeline Picker',
    description: 'Pin frequently used jobs to the front of the shared job picker — order persists per user in localStorage. Unpin anytime from the star icon on each job tab.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-06-23',
  },
  {
    id: 'pipeline-stage-sort',
    title: 'Pipeline Stage Card Sort',
    description: 'Within each kanban column, rejected candidates sink to the bottom; on-hold and no-show cards sit above them. Active candidates stay on top so recruiters focus on live pipeline.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-06-23',
  },
  {
    id: 'header-quick-actions',
    title: 'Header Quick-Action Icons',
    description: 'One-click icon buttons in the app header — Talent Database, Jobs, and Add Candidate — for recruiters and HR without digging through nav menus.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-06-23',
  },
  {
    id: 'talent-database',
    title: 'Talent Database vs Active Candidates',
    description: 'Two distinct views: the full talent pool (every CV ever added) and active candidates (only those mapped to an open job). Keeps sourcing history without cluttering active pipelines.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'candidate-profile',
    title: 'Candidate Full Profile Drawer',
    description: 'Deep-dive panel: AI scores (job fit, credential, red flags), work experience with company websites and tenure, education, certifications, skills by proficiency, pre-screen details, interview history with artifacts, and AI-generated summary.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-01-01',
  },
  {
    id: 'advanced-search',
    title: 'Advanced Candidate Search',
    description: 'Boolean search using AND / OR / NOT operators across the full talent pool. Combined with skill filter, job filter, and missing-info filter for precise sourcing.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'bulk-csv',
    title: 'Bulk CSV Import',
    description: 'Upload Naukri, Greenhouse, or generic CSVs with automatic column mapping, duplicate detection, and a preview step before import. Maps skills plus current and preferred location among ~50 column aliases; optional batch skills apply to every row.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'bulk-resume',
    title: 'Bulk Resume Upload & AI Parsing',
    description: 'Upload multiple PDFs at once — Gemini extracts structured profile data (skills, experience, education, certifications, awards) and creates candidate records automatically.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'candidate-export',
    title: 'Candidate Export',
    description: 'Export any filtered subset of candidates to CSV with selectable columns — name, contact, job, status, scores, recruiter, source, and more.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'assign-interviewers',
    title: 'Assign Interviewers to Candidates',
    description: 'Assign one or more interviewers to a candidate across all pipeline stages. Assigned interviewers receive scheduling notifications and see only their assigned candidates.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'pending-approval',
    title: 'Pending Approval Gate',
    description: 'Every candidate assigned to a job lands in a Pending Approval column before entering any interview stage. Recruiters review the profile, approve (moves to Screening) or decline with an optional reason. Declined candidates stay visible at the bottom for sourcing visibility.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-05-26',
  },
  {
    id: 'pending-approval-decline-reason',
    title: 'Decline Reason Capture',
    description: 'When declining a candidate from Pending Approval, recruiters can enter a free-text reason (e.g. "Skills don\'t match the role requirements"). The reason is stored and shown on the declined card — helps sourcing teams calibrate future submissions.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-05-28',
  },
  {
    id: 'pipeline-kanban',
    title: 'Interview Pipeline (Kanban)',
    description: 'Drag-and-drop kanban board with fully configurable stages per job — open from Hiring → PIPELINE (`/hiring?view=board`). Do strip for click-now actions, Radar FAB for weekly volume/strategy, Health grade in the header, move candidates across stages, track verdicts, schedule interviews, and manage multi-round interviews inline.',
    roles: ['HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-01-01',
  },
  {
    id: 'stage-templates',
    title: 'Interview Stage Templates',
    description: 'Save and reuse interview stage configurations (e.g. Screening → L1 Technical → L2 Technical → HR Round) across multiple jobs.',
    roles: ['HR', 'Recruiter', 'Admin'],
    addedAt: '2026-01-01',
  },
  {
    id: 'scheduling',
    title: 'Interview Scheduling',
    description: 'Schedule interviews with a specific interviewer, optional date/time, meeting link, and interview mode (video/phone/in-person). Video mode requires a valid http(s) meeting link before save. Notifications fire to the assigned interviewer in their local timezone; panelists get an instant interview-scheduled email when added.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'interview-conflict-warnings',
    title: 'Interview Schedule Conflict Warnings',
    description: 'When scheduling, overlapping slots for the same panelist surface a confirm dialog before save. On My Interviews, overlapping upcoming interviews show a conflict badge and banner so interviewers can ask HR/recruiter to reschedule. Back-to-back slots are allowed; only true overlaps flag.',
    roles: ['HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-07-12',
    highlight: true,
  },
  {
    id: 'panel-interviews',
    title: 'Panel Interviews',
    description: 'Schedule a single interview with multiple panelists in one step. Each panel member receives a notification and sees the interview on their calendar and My Interviews hub.',
    roles: ['HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-08',
  },
  {
    id: 'interview-kits',
    title: 'AI Interview Kits',
    description: 'When an interview is scheduled, Gemini generates tailored questions from the job description and candidate resume. Interviewers open a read-only kit panel alongside the candidate profile — stage templates provide fallbacks when AI is unavailable.',
    roles: ['Interviewer', 'HR', 'Recruiter'],
    addedAt: '2026-06-09',
  },

  // ── AI Features ───────────────────────────────────────────────────────
  {
    id: 'job-fit-score',
    title: 'AI Job Fit Score',
    description: 'Gemini computes a 0–100 fit score per candidate-job pair based on skills match, experience level, seniority, and salary alignment. Shown on pipeline cards and the Pending Approval column. Applicant portal uses improved deterministic job-match scoring (skills, titles, education) to rank relevant open roles.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-06-17',
  },
  {
    id: 'ai-candidate-summary',
    title: 'AI Candidate Analysis',
    description: 'Full AI analysis of a candidate against their linked job: suitability score, matched skills, skill gaps, strengths, concerns, and a 2–3 sentence professional summary — all generated by Gemini.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'red-flags-display',
    title: 'Red Flag Detection',
    description: 'AI surfaces employment gaps, frequent job-switching, skill-role mismatches, and other risk signals on candidate profiles. Each flag is dismissable with a reason.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'credential-score',
    title: 'Credential Score',
    description: 'AI-assessed education and certification quality score (0–100) based on institution tier, degree level, and relevant certifications. Shown alongside the job fit score.',
    roles: ['HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'company-website-enrichment',
    title: 'Company Website Enrichment',
    description: 'AI automatically resolves the official website for each company in a candidate\'s work history. Appears as a link icon next to the company name in the profile drawer — runs silently in the background.',
    roles: ['Admin', 'HR', 'Recruiter'],
    addedAt: '2026-05-26',
  },
  {
    id: 'interview-notes-side-panel',
    title: 'Live Interview Notes & AI Feedback',
    description: 'During an active interview, open a side panel alongside the candidate profile to take raw notes (auto-saved every second). "Draft with AI" sends the notes to Gemini and shows a preview — Edit opens the pre-filled feedback form; Submit saves the draft as feedback without leaving the drawer.',
    roles: ['Interviewer', 'HR', 'Recruiter'],
    addedAt: '2026-05-28',
  },

  // ── Interviewer ───────────────────────────────────────────────────────
  {
    id: 'interviewer-daily-digest',
    title: 'Interviewer Daily Digest & Instant Emails',
    description: 'Each morning at 9 AM IST, panelists with interviews that day receive a digest email (candidate, stage, time, mode, join link). Scheduling or adding a panelist also sends an instant interview-scheduled email. Admin toggle: Settings → Email → Interviewer daily digest.',
    roles: ['Interviewer', 'Admin', 'HR', 'Recruiter'],
    addedAt: '2026-07-09',
    highlight: true,
  },
  {
    id: 'feedback-form',
    title: 'Structured Interview Feedback',
    description: 'Submit verdicts (Proceed/Reject/Hold/No-Show), overall score (1–5), category ratings (Technical, Communication, Problem Solving, Culture Fit), rejection reason, written feedback, and work sample artifacts.',
    roles: ['Interviewer', 'HR', 'Recruiter'],
    addedAt: '2026-01-01',
  },
  {
    id: 'scorecard-templates',
    title: 'Scorecard Templates',
    description: 'Tier-1 ATS-style structured scorecards per interview stage — criteria, rating scales, and default kit questions. Admins edit templates in Settings → Scorecards; the matching scorecard auto-loads when interviewers submit feedback.',
    roles: ['Admin', 'Interviewer'],
    addedAt: '2026-06-09',
  },
  {
    id: 'feedback-gate',
    title: 'Mandatory Feedback Gate',
    description: 'A non-dismissable overlay blocks the app until all overdue interview feedback is submitted — ensuring nothing slips through the cracks.',
    roles: ['Interviewer'],
    addedAt: '2026-01-01',
  },
  {
    id: 'artifacts',
    title: 'Work Sample Artifacts',
    description: 'Attach files or links to interview feedback — design portfolios, coding test outputs, written assignments. Stored in cloud storage and visible in the candidate\'s interview history.',
    roles: ['HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-05-24',
  },
  {
    id: 'calendar',
    title: 'Interview Calendar',
    description: 'Unified calendar (month/week/day/agenda views) showing all scheduled interviews with mode indicators, candidate avatars, interviewer names, and one-click join links — all times in the user\'s saved timezone.',
    roles: ['Interviewer', 'HR', 'Recruiter'],
    addedAt: '2026-05-25',
  },
  {
    id: 'timezone',
    title: 'Per-User Timezone',
    description: 'Each user sets their timezone in My Profile (auto-detected from browser). All interview times in the pipeline, calendar, and notifications display in their local time.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-05-25',
  },
  {
    id: 'my-interviews',
    title: 'My Interviews Hub',
    description: 'Dedicated workspace for interviewers and recruiters — upcoming and past interviews grouped by day. Upcoming cards show a live countdown (including in-progress within the 30-min slot), conflict badge when slots overlap, and a Join meeting CTA for video interviews with a link for the full slot. Past cards use a denser two-column layout with kit, profile, notes, and feedback actions.',
    roles: ['Interviewer', 'Recruiter', 'HR'],
    addedAt: '2026-07-12',
    highlight: true,
  },
  {
    id: 'profile-photo',
    title: 'Profile Photo Upload',
    description: 'Upload a profile photo from My Profile — stored in secure cloud storage and shown in the header, leaderboards, and anywhere team members are displayed.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-14',
  },
  {
    id: 'mobile-experience',
    title: 'Mobile App & PWA',
    description: 'Installable progressive web app — add to home screen on iOS or Android. Mobile-first shell with bottom navigation, More menu for secondary pages, mobile-optimised dashboard, full-screen notifications sheet, and interview prep with kit/profile switcher. Use The Talent App on the go.',
    roles: ['Admin', 'HR', 'Recruiter', 'Interviewer'],
    addedAt: '2026-06-19',
    highlight: true,
  },

  // ── Candidate Portal ──────────────────────────────────────────────────
  {
    id: 'careers-page',
    title: 'Careers Page & Applications',
    description: 'Public careers page listing all open roles. Candidates browse and apply directly without an account. Applications auto-create candidate records with source tracking.',
    roles: ['Candidate'],
    addedAt: '2026-01-01',
  },
  {
    id: 'applicant-portal',
    title: 'Applicant Portal',
    description: 'Candidates log in to view application status, upcoming interviews, assigned assessments, job match scores on open roles, and complete digital application forms. Email verification redirects to the portal. Extended profile fields including LinkedIn (auto-normalised to https).',
    roles: ['Candidate'],
    addedAt: '2026-06-19',
    highlight: true,
  },
  {
    id: 'assessments-portal',
    title: 'Online Assessments',
    description: 'Candidates complete coding challenges and custom evaluation forms in the browser — including file-upload questions — timed, auto-submitted, with live integrity monitoring and tenant-branded exam portal (logo and colors from your settings).',
    roles: ['Candidate'],
    addedAt: '2026-06-19',
  },
];

export const FEATURES_LAST_SEEN_KEY = 'sparx_features_last_seen';

export function getNewFeatures(): Feature[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return FEATURES.filter(f => new Date(f.addedAt) >= cutoff);
}

export function hasUnseenFeatures(): boolean {
  const lastSeen = localStorage.getItem(FEATURES_LAST_SEEN_KEY);
  if (!lastSeen) return getNewFeatures().length > 0;
  const lastSeenDate = new Date(lastSeen);
  return FEATURES.some(f => new Date(f.addedAt) > lastSeenDate);
}

export function markFeaturesAsSeen(): void {
  localStorage.setItem(FEATURES_LAST_SEEN_KEY, new Date().toISOString());
}
