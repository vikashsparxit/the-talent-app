# Talent Database Growth — SparxTalent / TTA

> **Purpose:** Brainstorm (Jul 2026) on growing the talent pool so AI features (fit scoring, talent-pool refill, sourcing briefs) stay useful. Not a build commitment.
>
> **Related:** [AI_AGENTIC_OPPORTUNITIES.md](AI_AGENTIC_OPPORTUNITIES.md) · [COMPLIANCE.md](COMPLIANCE.md) · [ROADMAP.md](../ROADMAP.md)

---

## Context

SparxIT internal ATS has ~**2,000** candidate profiles today. Gemini-only AI. Chitragupta never contacts candidates. Goal: make matching and refill trustworthy — **not vanity headcount**.

**Honest read of ~2k:** Usable seed if structured. Not enough for “always 20 strong dormant matches per JD” across niches. The usual failure mode is less “only 2k rows” and more “too few are enriched, deduped, skill-tagged, and eligible to re-contact.”

---

## Current intake & bottlenecks

### How candidates enter today (shipped)

| Channel | Surface | Source | What you get | Auto AI? |
|---------|---------|--------|--------------|----------|
| Careers apply | `/careers`, `/careers/:id` | `portal` | Name, email, phone, resume, optional LinkedIn; **job-tied** | Resume stored; parse/enrich not guaranteed on apply |
| Applicant Quick Apply | Portal | portal | Reuses saved profile | Same |
| Manual add | Talent Database | `manual` / `referral` | Recruiter fields + optional resume | Enrich + analyze if job linked |
| Bulk resume upload | Candidates / Database | `bulk_resume` | Gemini `parse-resume` | Parse yes; analyze on job assign |
| CSV / XLSX import | Bulk Import | `csv_import` or vendor `source_key` | Tabular fields; Naukri/Greenhouse/Lever aliases | Fire-and-forget `enrich-profile` |
| JD email | Drawer → Send Job Details | N/A | Careers link; apply still job-tied | Human-only |
| Applicant “refer a friend” | Share job link | — | Share count only — **does not** create referral candidates | — |

**Product truth:** `/database` = full pool. Active hiring = job mapping → Pending Approval → pipeline. Decline at Pending Approval → **stays in pool**; **Add to Job** reactivates + `analyze-candidate`.

### Not built (often assumed)

- No always-on / general applications (apply without a live job)
- No LinkedIn scrape / extension (LinkedIn is a URL field today)
- No job-board syndication APIs
- No employee referral portal with tracking (only free-text `referred_by`)
- No global duplicate merge (ROADMAP)
- No automated re-engagement of past applicants (parked; Chitra-safe only as **staff** nudges)
- Consent / DPDP hooks incomplete at apply, signup, bulk import (`docs/COMPLIANCE.md`)

### Bottlenecks

1. **Intake is job-gated** — closed roles stop inbound; no speculative CV drop.
2. **Enrichment coverage uneven** — many portal rows are “resume file + thin profile.”
3. **Reactivation is manual** — no ranked dormant-pool refill yet (agentic #1).
4. **Outcomes partially labeled** — decline / rejection reasons exist but not a clean pool-eligibility taxonomy.
5. **Compliance debt** — bulk Naukri dumps without consent attestation are the riskiest volume lever under India DPDP.
6. **Chitra constraint** — any re-contact of candidates must be **human-sent**, never agent-sent.

---

## Grow quality first vs raw volume

| North star | Effect on AI |
|------------|--------------|
| Chase **2k → 10k raw** without enrich | More noise for Gemini; refill/fit degrade |
| Chase **2k → ~3–4k high-quality** (enriched + tagged + recent + consent-clean) | Beats 10k CSV shells for fit and refill |
| Outcome labels (hired / reject reason / stage drop) | Cheapest long-term unlock job boards don’t give |

**Default for discussion:** usefulness first; raw volume second.

---

## Strategies

### 1. Capture more of what already happens

- Parse + enrich every portal apply (unlocks fit/refill on organic CVs you already get)
- Always-on “Join our talent pool” page (biggest product gap vs job-only careers; needs consent + spam controls)
- Careers conversion polish; JD-send attribution
- Decline → keep pool-eligible + queryable tags by default

### 2. Reactivate / normalize existing data

- Batch enrich “Missing enrichment”
- Global dedupe / merge (ROADMAP)
- Human re-contact rules for past rejects — Chitra nudges **recruiters**, never emails candidates
- Tags: `pool_ok` / `do_not_contact` / skill niche; stale-date filters

### 3. Inbound volume

- Employee referral with tracked links + `source=referral`
- Campus / internship drives → bulk resume
- Agency / vendor CSV with `source_key` (already productized)
- Ops: post free boards / LinkedIn Jobs → `/careers/:id` (no scrape)
- Job-board syndication (ROADMAP — L, spam risk)

### 4. Bulk / partner imports (compliance caveats)

- Agency CSV/PDF via existing Bulk Import — **highest short-term volume**, low quality unless enrich + dedupe
- Bulk PDF zip from drives — usually better for AI than CSV-only shells
- Historical ATS dumps once

**Caveat:** 2k→10k in a week via Naukri dumps is realistic and usually **hurts** matching until enrich, dedupe, freshness, and consent are fixed.

### 5. Product loops

- Every reject → explicit “keep in talent pool?” + reason
- Talent-pool refill suggestions (KRA3 → ranked dormant matches → human Add to Job) — agentic #1
- Rejection-pattern → sourcing brief — agentic #8
- Optional public applicant profile for share loops (ROADMAP)

---

## What AI needs

| Asset | What it is | Helps most |
|-------|------------|------------|
| **Raw resumes** | PDF/DOC + thin row | Presence only; weak matching |
| **Structured enriched profiles** | Skills, timeline, education, red flags, scores | Fit, boolean search, **refill**, kits |
| **Labeled outcomes** | Hired / rejected / decline & interview reasons | Calibrate fit; exclude bad re-suggests; sourcing briefs |

| Feature | Raw volume | Structured | Outcomes |
|---------|------------|------------|----------|
| Job fit (`analyze-candidate`) | Nice | **Required** | Calibration later |
| Talent-pool refill | Breadth | **Required** + freshness | **Strongly helps** |
| Portal job match | — | Skills/exp | — (deterministic) |
| Rejection → sourcing brief | — | Skills taxonomy | **Required** |

---

## Risks — do not ignore

| Risk | Notes |
|------|-------|
| **DPDP / consent** | Careers, bulk import, manual add lack solid consent records; bulk Naukri = highest exposure |
| **Scrapers / ToS** | **Do NOT build scrapers** for Naukri, LinkedIn, Indeed, etc. Violates ToS, DPDP risk, poor data quality |
| **No free bulk resume API** | There is no clean, legal “free resume API” that safely fills the DB. Paid boards / partner exports with consent only |
| Stale data poisoning | Old rejects dominate refill without freshness filters |
| Spam / spray apps | Always-on pool + boards → Pending Approval flood |
| Duplicate inflation | False pool size until merge ships |
| Chitra boundary | Never candidate outreach from agents |
| Gemini cost | Enrich-all / analyze-all on 10k needs batching |
| Parked auto-outreach | Do not reopen auto-send JD as a “growth hack” |

---

## Honest agent design

Agents (including Chitragupta) should:

1. **Enrich** existing rows (or nudge staff to run enrich)
2. **Nudge** recruiters/HR with ranked pool matches and queues
3. **Refill** suggestions from the **existing** DB when pipelines are thin

Agents must **not**:

- Scrape job boards or social networks
- Auto-email or WhatsApp candidates
- Mutate pipeline / enroll candidates without a human

Growth volume levers stay **product + ops + human outreach** with consent. AI multiplies quality of what you already have.

---

## 30 / 60 / 90 options (not commits)

### Days 0–30 — Quality over count

1. Measure Missing Info / enrichment coverage / declined-never-reassigned
2. Batch enrich high-value segments (recent 12 months, common roles)
3. Human re-contact policy (e.g. skill_gap OK after 6 months; integrity never)
4. Every Pending Approval decline → reason + optional `pool_ok`
5. Prefer bulk **PDF** from agencies over raw CSV; vendor `source_key`
6. Consent discussion before large dumps

*Outcome:* Quality ↑; headcount maybe +10–20%. Fit/refill trustworthy on a subset.

### Days 30–60 — Capture + reactivation

1. Always-on talent-pool apply (consent + light spam controls)
2. Recruiter “dormant matches for thin jobs” queue (Chitra nudge → Add to Job)
3. Referral v1: tracked links + `source=referral`
4. Dedupe design review
5. Inbound ops: LinkedIn Jobs / campus → careers + bulk resume

### Days 60–90 — Volume with guardrails (only if quality holds)

1. Controlled agency CSV/PDF + consent attestation + enrich + freshness
2. Evaluate board APIs / LinkedIn extension against ToS + DPDP (likely SparxIT-private)
3. Optional public applicant profile
4. Instrument: matches suggested → assigned → hired

*Prefer metric:* **“N enriched, pool-eligible profiles per open JD”** over raw 10k.

---

## Discussion prompts

1. North star: **10k rows** or **N enriched matches per open JD**?
2. Always-on open applications, or job-gated careers only?
3. Who owns human re-contact of past applicants until consent Phase 1?
4. Before any Naukri dump: consent attestation + enrich-or-discard — yes/no?
5. Build refill on current 2k (agentic #1) vs grow volume first?

---

### Verdict

**Grow usefulness first** (enrich, dedupe, tag, label outcomes, human reactivation). **Grow raw volume second** via referrals, agencies, always-on apply. Treat **2k→10k via job-board dumps / scrapers** as a compliance-and-quality risk — not an AI strategy.

---

*Recorded Jul 2026. Update when a growth lever ships, is rejected, or the north-star metric changes.*
