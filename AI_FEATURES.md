# The Talent App — AI Features

All AI in The Talent App runs exclusively through the **Google Gemini API** (`gemini-2.5-flash`), invoked via Supabase Edge Functions (Deno runtime). No other LLM provider is used.

---

## 1. Resume & Profile Enrichment
**Edge function:** `enrich-profile`

Triggered automatically in the background whenever a candidate is added (manually or via bulk CSV import). Sends the candidate's raw resume text to Gemini and extracts structured data: work experience timeline, education, certifications, awards, and a normalised skills list with proficiency levels. Results are written back to the candidate record, populating fields that would otherwise require manual entry.

---

## 2. AI Skills Extraction with Confidence Scoring
**Edge function:** `enrich-profile` (part of enrichment pipeline)

Each skill pulled from a resume is tagged with a `proficiency` level (Beginner / Intermediate / Advanced / Expert) and a `confidence` percentage reflecting how certain the model is about the attribution (e.g., "React — Advanced, 92%"). Skills are also tagged by source (`resume`, `assessment`, `manual`). Displayed in the Skills panel of the candidate detail drawer with colour-coded confidence badges.

---

## 3. Red Flag Detection
**Edge function:** `enrich-profile` (part of enrichment pipeline)

During enrichment, Gemini surfaces warning signals that a human reviewer might miss at a glance:
- Employment gaps ≥ 3 months
- Frequent job-switching (avg tenure < 12 months)
- Over-experienced but under-certified for the role
- Skill–role mismatch
- Short stints in senior positions

Flags are stored as `red_flags JSONB` on the candidate record. The detail drawer header shows a flag count badge; each flag can be individually dismissed by a reviewer with a reason.

---

## 4. Candidate Credential / Resume Score
**Settings:** "Re-score All Candidates" batch trigger

A composite 0–100 score that measures a candidate's profile quality against the job they applied for. Gemini evaluates: skills match percentage, years of experience vs. job requirement, career stability, seniority alignment, and overall profile completeness. Scores are cached in `candidate_job_scores` and displayed as a badge on candidate cards and inside the detail drawer. A batch re-score can be triggered from Settings.

---

## 5. Job Fit Score
**Table:** `candidate_job_scores` | **Applicant portal:** `src/lib/jobMatchScore.ts`

A per candidate–job pair analysis distinct from the general credential score. Gemini computes a `fit_score` (0–100) and a `fit_breakdown` JSONB with sub-scores for: required skills match, YOE vs. job spec, seniority alignment, and salary expectation vs. budget. Shown in the Intelligence Header section of the candidate detail drawer and on pipeline cards. The score is cached and invalidated when the job spec or candidate profile changes.

**Applicant portal job matching** uses a separate deterministic scorer (no Gemini call) that tokenises skills, work titles, and education from the applicant profile against each open job's required skills — surfacing a colour-coded match % on the careers dashboard so candidates see their most relevant roles first.

---

## 6. On-Demand Candidate Analysis
**Edge function:** `analyze-candidate`

A one-click deep-dive on any individual candidate. Uses Gemini function-calling to produce a structured evaluation containing: key strengths, concerns worth probing in an interview, an overall recommendation, and a hiring confidence indicator. Accessible from the candidate detail view. Result is ephemeral (not written to the DB) and is regenerated fresh on each request.

---

## 7. Pipeline Health Scorer
**Edge function:** `score-pipeline` | **UI:** Hiring → Pipeline header chip + health drawer (also usable from Reports)

When a recruiter or HR wants a quick read on an open role, they generate **Pipeline Health** from the compact header chip. Metrics use **hire-based conversion** and scenario-aware low-N language (early/aged thin funnels avoid panicky rate talk). The frontend sends stage funnel counts, conversion, feedback coverage, velocity, deadline pressure, and related signals to Gemini with scoring rules in the system prompt.

Gemini returns:
- `overall_score` (0–100), `speed_score`, `health_score`
- `grade` (A–F) with a label (Excellent / Good / Fair / Poor / Critical)
- 2–4 factual `insights`
- 0–3 `risks` (empty when healthy)
- One `recommendation` — a short next step aligned with the **Do** strip (Approve pending / Schedule / Decide / Chase feedback / Source)

The chip shows the grade in a denser header; **regenerate lives in the drawer only** (no refresh icon on the chip). Analysis is **ephemeral** per session cache — not a substitute for the deterministic Do strip (click-now), Radar FAB (weekly volume/strategy), or Chitragupta (watch).

---

## 8. Chitragupta — Autonomous AI HR Manager
**Edge functions:** `chitra-engine` (hourly cron), `chitra-daily-report` (8 AM daily), `chitra-chat`

Chitragupta is The Talent App's always-on AI HR Manager. He runs on a pg_cron schedule and continuously monitors the recruitment pipeline for issues that humans forget to act on.

**What he monitors:**
- Interview feedback overdue beyond configured thresholds
- Candidates stuck in a stage with no movement
- Jobs approaching their application deadline with insufficient candidates
- Stage bottlenecks (too many candidates piling up at one stage)
- Positive behaviours to reward (on-time feedback, same-day candidate advancement)

**Escalation ladder:** Chitragupta escalates notification severity (Level 0 soft nudge → Level 4 formal warning) the longer an issue remains unresolved, using Gemini to vary tone appropriately at each level.

**Daily digest:** Every morning at 8 AM, Chitragupta sends the super admin a structured report summarising overnight pipeline activity, pending actions, and any open escalations.

**Two-way chat:** Super admin can converse with Chitragupta via a dedicated chat interface. Chitragupta answers HR and pipeline questions in real time using Gemini, with full read access to live pipeline data.

Chitragupta only writes to `notifications` and `chitra_escalations`. He never modifies candidate data, pipeline positions, or interview records.

---

## 9. Product Insight
**Edge function:** `product-insight`

Gemini-powered analytics assistant for admin and HR roles. Analyses platform usage patterns and recruitment health signals to surface actionable insights about how the team is using The Talent App — e.g., which stages are bottlenecks across all jobs, which sources produce the best conversion, or whether interview feedback quality is declining. Accessible from the admin dashboard.

---

## 10. AI Assessment Generation from Job Description
**Edge function:** `generate-assessment` | **UI:** Assessments page → "Generate with AI" (linked job context)

Staff can draft a full assessment (sections + MCQ/coding/subjective questions) from a job description using Gemini structured output. Six tier profiles auto-detect from role type and experience level (tech fresher/junior/mid/senior + non-tech fresher/experienced). Creates a **draft** assessment linked via `source_job_id`, sets `ai_generated = true`, and optionally becomes the job's `default_assessment_id`. Org-wide tier counts and duration defaults live in Settings → Assessments (`assessment_generation_settings`). Prompt inventory: [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md).

Recruiters review and publish in Assessment Builder before assigning to candidates. Pairs with job-linked pipeline badges, pass gating, and manual assign from the pipeline card menu.

---

## 11. AI Assessment Response Grading
**Edge function:** `grade-assessment` | **UI:** Evaluations → Evaluation Detail → "AI Grade" / "Re-grade with AI"

After a candidate submits (or via staff backfill), Gemini scores non-MCQ responses:

| Type | Scoring |
|------|---------|
| MCQ | Unchanged — DB trigger sets `auto_score` |
| Subjective | Gemini vs question + `subjective_rubric` → `auto_score` + `feedback` |
| Coding | Prefer `execution_result` pass rate → marks; else Gemini code review |
| File upload | Multimodal on uploaded image/PDF when possible; Drive-link-only gets a light/conservative grade |

Writes **`auto_score`** (never overwrites `manual_score`). `final_score = COALESCE(manual_score, auto_score)`. Staff Edit still sets `manual_score`. Auto-invoked fire-and-forget from `candidate-portal` on submit/auto-complete. Bulk: `{ "all_pending": true }`.

---

## Summary Table

| Feature | Trigger | Ephemeral? | Writes to DB? |
|---|---|---|---|
| Resume Enrichment | Auto on candidate add/import | No | Yes (candidate fields) |
| Skills Extraction + Confidence | Auto (part of enrichment) | No | Yes (`skills JSONB`) |
| Red Flag Detection | Auto (part of enrichment) | No | Yes (`red_flags JSONB`) |
| Credential / Resume Score | Manual batch or auto on import | No | Yes (`candidate_job_scores`) |
| Job Fit Score | On demand / cache invalidation | No | Yes (`candidate_job_scores`) |
| Candidate Analysis | On demand (button) | Yes | No |
| Pipeline Health Scorer | On demand (Pipeline chip / drawer; Reports) | Yes | No |
| Chitragupta Engine | pg_cron hourly + 8 AM daily | No | Yes (`notifications`, `chitra_escalations`) |
| Chitragupta Chat | On demand (chat interface) | Yes (chat turns) | No |
| Product Insight | On demand (admin dashboard) | Yes | No |
| AI Assessment Generation | On demand (Assessments page) | No | Yes (draft assessment + sections) |
| AI Assessment Grading | Auto on submit + Evaluation Detail / backfill | No | Yes (`candidate_responses.auto_score`, `feedback`) |
