# AI Prompts Inventory

Engineer reference for every LLM prompt in SparxTalent. Prompt text lives in **edge function source code**, not in Settings. Settings only tune parameters (counts, thresholds, template question lists).

---

## 1. Overview

| Item | Detail |
|------|--------|
| **Primary LLM** | Google Gemini via OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/chat/completions`) or native `generateContent` (parse-resume) |
| **Model** | `GEMINI_MODEL` env var, default `gemini-2.5-flash` |
| **API key** | `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY` on edge functions |
| **Exception** | `product-insight` uses **Claude** (`CLAUDE_API_KEY` / `ANTHROPIC_API_KEY`, model `claude-sonnet-4-6`) — not Gemini |
| **Client (`src/`)** | No prompt text. `src/lib/devGemini.ts` only forwards `dev_gemini_key` in local dev |
| **Assessment prompts** | Hard-coded in `generate-assessment`. Settings → Assessments controls **tier parameters** (`assessment_generation_settings`), not prompt wording |

---

## 2. Prompt Inventory

| Feature | Edge function | File | Prompt type | Configurable via Settings? | Notes |
|---------|---------------|------|-------------|---------------------------|-------|
| Resume parsing | `parse-resume` | `supabase/functions/parse-resume/index.ts` | system + user | Partial (`cert_tiers`, `tier1_colleges` for post-parse scoring, not prompt text) | Native Gemini API + `extract_resume_data` tool |
| Candidate–job fit | `analyze-candidate` | `supabase/functions/analyze-candidate/index.ts` | system + user | No | Tool: `analyze_suitability` |
| Profile enrichment | `enrich-profile` | `supabase/functions/enrich-profile/index.ts` | system + user | Partial (`red_flag_rules` thresholds injected into system prompt) | Tool: `enrich_profile` |
| Assessment generation | `generate-assessment` | `supabase/functions/generate-assessment/index.ts` | system + user | Partial (tier counts/duration via `assessment_generation_settings`) | `buildSystemPrompt()` + JSON schema in code |
| Assessment response grading | `grade-assessment` | `supabase/functions/grade-assessment/index.ts` | system + user | No | Native Gemini + `grade_response` tool; multimodal for file uploads |
| Interview kit questions | `generate-interview-kit` | `supabase/functions/generate-interview-kit/index.ts` | system + user | Partial (`scorecard_templates.prompt_questions` = template fallback, not Gemini prompt) | Gemini when JD/candidate context exists; else template |
| Feedback drafting | `draft-feedback` | `supabase/functions/draft-feedback/index.ts` | system + user | Partial (scorecard `criteria` labels in user message) | Tool: `draft_feedback` |
| Pipeline scoring | `score-pipeline` | `supabase/functions/score-pipeline/index.ts` | system + user | No | Detailed scoring rules in system prompt; tool: `score_pipeline` |
| Company website lookup | `enrich-company-websites` | `supabase/functions/enrich-company-websites/index.ts` | system + user | No | Batch URL resolution |
| Chitra escalation copy | `chitra-engine` | `supabase/functions/chitra-engine/index.ts` | user only | Partial (`chitra_escalation_thresholds` = timing, not copy) | `generateMessage()`; hard-coded fallbacks |
| Chitra daily brief | `chitra-daily-brief` | `supabase/functions/chitra-daily-brief/index.ts` | user only | No | `generateBrief()` → notification JSON |
| Chitra weekly brief | `chitra-weekly-report` | `supabase/functions/chitra-weekly-report/index.ts` | user only | No | `generateWeeklyBrief()` → notification JSON |
| Chitra chat | `chitra-chat` | `supabase/functions/chitra-chat/index.ts` | system + user | No | Agentic loop with 6 DB query tools |
| Product insights | `product-insight` | `supabase/functions/product-insight/index.ts` | user only | No | **Claude**, not Gemini; `generateInsights()` |

**Row count: 14**

---

## 3. Per-Feature Reference

### parse-resume

- **Purpose:** Extract structured candidate data from PDF/DOC/DOCX.
- **Key symbols:** `loadConfig()`, inline `systemInstruction`, user parts in main handler (~L217–236).
- **Injected:** Resume file/text; college-tier hint in user message.
- **Output:** `extract_resume_data` function call → DB insert. JSON schema in code (~L239–318).

### analyze-candidate

- **Purpose:** Score candidate vs job (skills 40%, experience 30%, role relevance 30%).
- **Key symbols:** Main handler builds `candidateProfile` + `jobDescription`; system/user messages ~L97–108.
- **Injected:** Candidate fields (skills, experience, role); job title, description, required skills, benefits.
- **Output:** `analyze_suitability` tool → `suitability_analysis` JSON on candidate.

### enrich-profile

- **Purpose:** Skill tags, proficiency, AI summary, red flags.
- **Key symbols:** System prompt ~L108–139; `profileSummary` user message ~L76–91.
- **Injected:** Full candidate profile; job title for fit sentence; `red_flag_rules` numeric thresholds in system prompt.
- **Output:** `enrich_profile` tool → updates `candidates` (skills_tags, ai_summary, red_flags).

### generate-assessment

- **Purpose:** AI-draft hiring exam from job description.
- **Key symbols:** `buildSystemPrompt(profile)` ~L938; `callGemini()` ~L998; `detectTier()` ~L528 merges `assessment_generation_settings`.
- **Injected:** `buildJobContext(job)` (title, skills, experience, description); `GenerationProfile` (section counts, question mix, marks).
- **Output:** JSON assessment → `assessments` / `assessment_sections` / `assessment_questions`. Schema in `buildSystemPrompt` return string (~L969–995).

### grade-assessment

- **Purpose:** Score subjective / coding / file_upload responses after exam submit or staff backfill.
- **Key symbols:** `callGeminiGrade()`; `gradeOneResponse()`; coding prefers `execution_result` pass rate.
- **Injected:** Question text, `subjective_rubric`, candidate answer/code; optional multimodal file from `assessment-artifacts`.
- **Output:** `grade_response` tool → writes `candidate_responses.auto_score` + `feedback`; then `calculate_assessment_total_score`.

### generate-interview-kit

- **Purpose:** Stage-specific interview questions for one scheduled interview.
- **Key symbols:** `generateQuestionsWithGemini()` ~L87; `buildCandidateContext()` / `buildJobContext()`.
- **Injected:** Stage name, JD, candidate profile, optional resume plain text.
- **Output:** `generate_questions` tool → 6–10 strings stored in `interview_kits`. Uses `scorecard_templates.prompt_questions` only when Gemini fails or no context.

### draft-feedback

- **Purpose:** Turn raw interviewer notes into structured scorecard draft.
- **Key symbols:** System ~L79–85; user ~L88–89.
- **Injected:** Candidate name, job title, stage; scorecard criteria keys/labels; raw notes.
- **Output:** `draft_feedback` tool (verdict, per-criterion ratings, feedback text). Rating schema built dynamically from `criteria` body param.

### score-pipeline

- **Purpose:** Health/speed scores and insights for one job's pipeline.
- **Key symbols:** `systemPrompt` (~scoring + low-N narrative rules); `userMessage` (job + metrics including `days_open` / `scenario`).
- **Injected:** Job metadata, funnel counts, interview quality averages, stage funnel lines, `days_open`, `scenario` (`early_thin` | `aged_thin` | `adequate` | `empty`), `limited_sample`.
- **Output:** `score_pipeline` tool (scores, grade, insights, risks, recommendation).
- **Low-N rules:** When N &lt; 10, avoid high/low rate language (use counts); skip conversion/no-show/hold **rate** score penalties; early thin → quick-closure playbook; aged thin → sourcing/thin funnel; no-show “high” only if (≥20% and N≥10) or ≥3 events. Recommendation: one short Action Queue–aligned step.

### enrich-company-websites

- **Purpose:** Resolve company names → official URLs (batch enrichment).
- **Key symbols:** System ~L82–91; user ~L93–94.
- **Injected:** Comma-separated company name list.
- **Output:** `resolve_websites` tool → URL map.

### chitra-engine

- **Purpose:** Escalation notification title/message at levels 0–4 for overdue feedback.
- **Key symbols:** `generateMessage()` ~L62–131.
- **Injected:** Escalation level, tone guide, interviewer/candidate/job/stage names, hours overdue.
- **Output:** JSON `{ title, message }` → `notifications` (source `chitra`). Fallback templates if Gemini fails.

### chitra-daily-brief

- **Purpose:** Morning executive brief to super admin.
- **Key symbols:** `generateBrief()` ~L60–135.
- **Injected:** Date, admin first name, 24h metrics (candidates, feedback, escalations, recruiter/interviewer lines).
- **Output:** JSON `{ title, message }` → `chitra_nudge` notification.

### chitra-weekly-report

- **Purpose:** Weekly pipeline intelligence brief.
- **Key symbols:** `generateWeeklyBrief()` ~L62–127.
- **Injected:** Week range, open jobs, thin pipelines, bottlenecks, top interviewer/recruiter stats.
- **Output:** JSON `{ title, message }` → notification.

### chitra-chat

- **Purpose:** Super-admin Q&A over live recruitment data.
- **Key symbols:** `systemPrompt` ~L477; `GEMINI_TOOLS` ~L293; agentic loop ~L491–547.
- **Injected:** User message only (tools fetch data).
- **Tools:** `query_pipeline`, `query_candidates`, `query_jobs`, `query_escalations`, `query_recruiter_stats`, `query_interviewer_stats`.
- **Output:** Plain-text reply (max ~400 chars per system rules) → `chitra_reply` notification.

### product-insight

- **Purpose:** Weekly actionable insights from aggregated metrics.
- **Key symbols:** `generateInsights()` ~L22–67.
- **Injected:** JSON metrics blob (pipeline by stage, interviewer completion, escalations, deadline jobs).
- **Output:** JSON array of insight strings → `chitra_nudge` notification. Uses Anthropic API, not Gemini.

---

## 4. Safe Editing Guide

1. **Edit prompt in the edge function `.ts` file** — search for `You are`, `buildSystemPrompt`, or `` const prompt = ``.
2. **Do not move prompt text to `system_config`** unless adding a deliberate new feature; current design keeps prompts in code for reviewability.
3. **JSON / tool schemas stay in code** — changing output shape requires updating the function declaration and downstream parsing/DB writes in the same file.
4. **Redeploy:** `supabase functions deploy <function-name>`
5. **Local test:** `supabase functions serve <function-name> --env-file supabase/functions/.env` (see `docs/LOCAL_SETUP_GUIDE.md`). Use `src/lib/devGemini.ts` pattern (`VITE_GEMINI_API_KEY`) for dev-only key forwarding.
6. **Branding:** Several prompts hard-code "SparxIT". When editing persona copy, prefer loading `business_branding.company_name` from `system_config` (pattern in `supabase/functions/_shared/email.ts`) instead of hard-coding tenant names — not yet wired into all prompts.
7. **Chitragupta constraints:** Chat tools query DB only; Chitragupta must not modify candidates or contact applicants (see `CLAUDE.md`). Escalation engine inserts `notifications` / `chitra_escalations` only.

---

## 5. Related Settings (Not Prompts)

| Settings key / UI | Location | What it controls |
|-------------------|----------|------------------|
| `assessment_generation_settings` | Settings → Assessments | Section/question counts, marks, duration, passing score per tier — merged in `mergeProfileWithSettings()` |
| `scorecard_templates.prompt_questions` | Settings → Scorecards | Static question lists; interview kit fallback when Gemini skipped or fails |
| `cert_tiers` | Settings → Credentials | Post-parse certification tier matching (`parse-resume`, `rescore-candidates`) |
| `tier1_colleges` | Settings → Credentials | College tier-1 name list for scoring |
| `red_flag_rules` | Settings → Red flags | Threshold numbers injected into `enrich-profile` system prompt |
| `chitra_escalation_thresholds` | Settings → Chitragupta | Hours/minutes before escalation levels — not notification wording |
| Email notification toggles | Settings → Notifications | Transactional email on/off — no LLM |

---

## 6. Chitragupta Rules (Prompt Editors)

- **Persona:** Male HR manager ("Chitragupta"). Keep title ≤60 chars, message ≤120 chars for escalation notifications; daily/weekly briefs allow up to ~300 chars in message body.
- **chat (`chitra-chat`):** Only edit the short system persona (~L477–483). Tool definitions and `dispatchTool()` handlers control data access — changing tools affects what the model can answer, not just tone.
- **engine (`chitra-engine`):** Level-specific tone guides are inline in `generateMessage()`. Fallback strings (~L123–129) apply when Gemini fails — keep them aligned if you change escalation copy.
- **Never via prompts:** Modify candidate records, pipeline positions, or send external messages to candidates. Those are enforced in code paths, not prompt honor system.

---

## Quick File Index

```
supabase/functions/
  parse-resume/index.ts          — resume parser
  analyze-candidate/index.ts     — JD fit scoring
  enrich-profile/index.ts        — profile enrichment
  generate-assessment/index.ts   — exam generation
  generate-interview-kit/index.ts
  draft-feedback/index.ts
  score-pipeline/index.ts
  enrich-company-websites/index.ts
  chitra-engine/index.ts
  chitra-daily-brief/index.ts
  chitra-weekly-report/index.ts
  chitra-chat/index.ts
  product-insight/index.ts       — Claude (exception)
```

---

## See also

- [AI_FEATURES.md](../AI_FEATURES.md) — product-facing AI capability reference
- [EMAIL_NOTIFICATIONS.md](EMAIL_NOTIFICATIONS.md) — Chitragupta email fan-out types (not prompt text)
- [DEVOPS_HANDOFF.md](DEVOPS_HANDOFF.md) — `GOOGLE_AI_API_KEY` on edge functions container
- [ROADMAP.md](../ROADMAP.md) — Assessments Release 1 (tiered `generate-assessment`)
