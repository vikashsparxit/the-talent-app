# AI + Agentic Opportunities — SparxTalent / TTA

> **Purpose:** Brainstorm (Jul 2026) for closing job openings faster using Gemini + Chitragupta constraints. Actionable backlog — not a commitment to build.
>
> **Related:** [AI_FEATURES.md](../AI_FEATURES.md) · [docs/AI_PROMPTS.md](AI_PROMPTS.md) · [CHITRA_KRA.md](../CHITRA_KRA.md) · [TALENT_DATABASE_GROWTH.md](TALENT_DATABASE_GROWTH.md) (pool quality vs raw volume)

---

## Recorded decisions / parked (as of Jul 2026)

| Decision | Status |
|----------|--------|
| **Assign Hired** list / partial-fill openings CTA on Jobs list | **Accepted as-is — do not reopen** |
| Auto-send JD / bulk candidate outreach | Parked |
| Communication log / templated candidate email hub | Deferred |
| Reports RPC polish | Deferred |
| Assessments V2 (auto-assign on stage, AI subjective scoring, analytics) | Deferred |
| Compliance / GDPR–DPDP agents | P2 on hold |

---

## Current AI / agentic assets

### Scoring & enrichment

| Asset | Surface | Role |
|-------|---------|------|
| Bulk resume parse | `parse-resume` | Extract structured CV → candidate |
| Profile enrichment | `enrich-profile` | Skills + proficiency, AI summary, red flags |
| Company website resolve | `enrich-company-websites` | Work-history links |
| Job fit / suitability | `analyze-candidate` + `candidate_job_scores` | 0–100 fit on cards + Pending Approval |
| Credential / batch rescore | `rescore-candidates` | Settings batch |
| Applicant job match | `jobMatchScore.ts` | Portal ranking — **deterministic, no Gemini** |

### Interviewer acceleration

| Asset | Surface | Role |
|-------|---------|------|
| Interview kits | `generate-interview-kit` | Stage questions from JD + resume |
| Draft with AI | `draft-feedback` | Notes → verdict + scorecard draft |
| Feedback gate | UI | Blocks app until overdue feedback submitted |

### Hiring quality / screening

| Asset | Surface | Role |
|-------|---------|------|
| AI assessment draft | `generate-assessment` | Tiered exam from JD (Release 1) |
| Pipeline health scorer | `score-pipeline` | On-demand A–F grade on Reports |
| Product insight | `product-insight` | Usage/health insights (see park list re: provider) |

### Chitragupta (notify / escalate only)

Covers most funnel stalls today: overdue feedback (KRA1), stagnation (2), deadline thin pipeline (3), praise (4), SA chat (6), daily brief (7), schedule-after-proceed SLA (8), no-show (9), on-hold (10), interviewer overload (11), weekly funnel report (12), pre-screen overdue (13), assessment abandon (14), recruiter silence (15), rejection reasons (17). Private-only `chitra-social-draft` is OSS marketing — not hiring velocity.

**Hard rules reminder:** below.

---

## Ranked opportunities

Rank ~ impact on time-to-hire × Gemini + Chitra feasibility × risk. Numbers are priority rank, not build order (see [Recommended sequence](#recommended-sequence)).

| # | One-liner | How | Who | Chitra-safe? | Size | Impact |
|---|-----------|-----|-----|--------------|------|--------|
| **1** | **Talent-pool refill** for thin / at-risk jobs | When KRA3 fires, suggest top N dormant pool matches for that JD; link to ranked shortlist; human assigns | Primary recruiter + SA | Yes for nudge; **recruiter enrolls** | M | High |
| **2** | **Recruiter morning triage digest** | Daily per-recruiter queue: Pending Approval by fit, schedule-SLA gaps, stagnant cards, assessment abandon, panel-complete — deep links; optional Gemini “do these 3 first” | Recruiters (HR for unassigned) | Yes (staff notify / email) | S–M | High |
| **3** | **Pending Approval AI triage** | Default sort by fit + red flags; optional one-sentence decline draft from gaps. **No auto-approve/decline** | Recruiters / HR | Aging nudge OK; **human decides** | S | High |
| **4** | **Panel complete → decide** | All panel verdicts in (or sole interviewer done) → instant recruiter nudge with kit/score summary; optional 2-line conflict synthesis | Recruiter → HR escalate | Fully (fills gap between KRA1 and KRA8) | S | High |
| **5** | **Post-proceed scheduling accelerator** | On `proceeded`, suggest next-stage interviewers (workload KRA11 + history) + conflict-aware slots; Chitra still owns SLA | Recruiters | Nudge only; **recruiter schedules** | M | Med–high |
| **6** | **Kit → feedback continuity** | Kit probes as notes checklist; unanswered probes feed `draft-feedback` | Interviewers | Assistive (N/A); Chitra still escalates late | S–M | Med–high |
| **7** | **Proactive Pipeline Health CTA** | Cron/Chitra push: open jobs below grade B get one recommendation + CTA (reuse `score-pipeline`) | Recruiter owners + SA | Yes if notify-only | S | Med |
| **8** | **Rejection-pattern → sourcing brief** | Weekly: e.g. “Flutter L1 70% skill_gap — tighten gate / assessment on X” + optional pool search string (extend KRA12/17) | SA / HR / recruiter | Yes | S | Med |

**Honorable (lower leverage / larger):** AI Interview Notetaker (roadmap Future — L); offer-letter AI draft (needs offer workflow — L); subjective assessment scoring (Assessments V2 — park).

---

## Recommended sequence

Smallest path that moves time-to-hire without deferred work:

1. **Panel-complete nudge** (#4)
2. **Pending Approval triage** (#3)
3. **Recruiter digest** (#2)
4. **Talent-pool refill suggestions** (#1)

Rationale: decision compression first (data already exists), then personalised queues, then refill when pipelines are thin.

---

## Agentic loops (nudge-only)

All: `notifications` + `chitra_escalations` only; internal staff only; never mutate pipeline / contact candidates.

| Loop | Trigger | Who | Escalation idea |
|------|---------|-----|-----------------|
| Pending Approval aging | Job-assigned, no stage enrollment >2–3d | Recruiter → HR | New KRA sibling to pre-screen |
| Panel complete, no decision | All panel verdicts in; no advance/reject | Recruiter → HR at +24h | Gap between KRA1 and KRA8 |
| Thin pipeline + talent match ready | KRA3 open + ≥3 pool matches ≥threshold | Recruiter (“review N matches”) | SA already on KRA3 L1 |
| Proceeded, no schedule | Exists as KRA8 | Recruiter | Keep; enrich with suggested interviewers |
| Assessment done, score unused | Submitted/pass; same stage >24h | Recruiter | Distinct from KRA14 abandon |
| Conflicting panel verdicts | Mix proceed/reject same round | Recruiter + HR | Force human calibration |
| Recruiter personal digest | Daily ~9 AM IST | Each recruiter | Informational (actionable KRA15-adjacent) |
| Interviewer prep nudge | Interview in &lt;2h, kit not opened | Interviewer | Soft; praise if kit used |
| SA “jobs that will miss deadline” | Extend daily brief | Super admin | Ranked CTAs on KRA7/12 |

**Explicit non-goals for agents:** auto-advance stages, auto-reject, auto-email candidates, auto-assign assessments (V2), auto-send JD.

---

## Park / avoid

| Idea | Why |
|------|-----|
| Auto-send JD / bulk outreach | Deferred + **Chitra violation** if agent-sent |
| Communication log / candidate email hub | Deferred ATS gap |
| Assessments V2 | Explicitly deferred |
| Reports RPC polish | Explicitly deferred |
| Compliance / consent / retention agents | P2 on hold; do not expand Chitra PII surface |
| Assign Hired list / partial openings CTA | **Accepted as-is** |
| AI Interview Notetaker (live transcript) | Future; consent + Teams/Zoom cost |
| Chitra auto-moving candidates or editing verdicts | Hard KRA violation |
| Chitra contacting applicants | Hard violation |
| Multi-LLM expansion / Anthropic | Policy is Gemini-only; don’t add providers |
| SaaS multi-tenant Gemini key self-service | Strategic, not SparxIT time-to-hire |
| Generic “AI chatbot for candidates” | Contact = out of bounds for Chitra |

---

## Chitra hard rules

From `CHITRA_KRA.md` / `CLAUDE.md` — never break these:

1. **Only** inserts into `notifications` and `chitra_escalations`.
2. **Never** modifies candidate data, pipeline positions, or interview records.
3. **Never** contacts candidates — internal users only.
4. Notifications he sends have `source = 'chitra'`.
5. Action buttons shape: `[{ "label": "...", "link": "/path" }]`.

Types: `chitra_nudge` · `chitra_warning` · `chitra_praise`.

---

## Practical takeaway

You already **monitor** the funnel well (Chitra KRAs). The gap to **close openings faster** is not more scoring — it is:

1. **Decision compression** after humans have data (panel complete → decide; Pending Approval triage).
2. **Pipeline refill from the talent DB** when KRA3 flags thin pipelines — grow **enriched / labeled** pool quality first; see [TALENT_DATABASE_GROWTH.md](TALENT_DATABASE_GROWTH.md) (no scrapers / no free bulk resume API).
3. **Personalised daily queues** so recruiters don’t rely only on the SA Chitra brief.

---

*Recorded Jul 2026. Update when an opportunity ships, is rejected, or decisions change.*
