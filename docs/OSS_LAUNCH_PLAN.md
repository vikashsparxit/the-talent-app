# OSS Launch Plan — The Talent App

> Internal playbook for the SparxIT team. Safe to share internally and export to the public repo — no secrets, no internal URLs.

---

## 1. Overview

| Item | Detail |
|------|--------|
| **Product** | [The Talent App](https://github.com/vikashsparxit/the-talent-app) — open-source, minimal ATS with AI-assisted hiring workflows |
| **Public repo** | https://github.com/vikashsparxit/the-talent-app |
| **Marketing site (planned)** | https://thetalentapp.io |
| **Maintainer** | [SparxIT](https://www.sparxitsolutions.com) |
| **License** | See `LICENSE` in the public repo |

### Positioning

**Who it's for:** Small agencies and recruiting teams still running hiring on spreadsheets, shared drives, and email threads — who want a real ATS without enterprise lock-in.

**How it runs:** Self-hosted on [Supabase](https://supabase.com) (cloud project or self-hosted stack). Full setup guide: [docs/LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md).

**What we're not launching yet:** Hosted SaaS, managed signup, or pricing tiers. Do **not** announce hosted availability until there is a real product and landing page for it.

---

## 2. Pre-launch checklist

Complete these before any public announcement. Treat unchecked items as launch blockers.

### Repository & docs

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | README polished (features, stack, quick start, links) | ☐ | Public-facing; no SparxIT-internal paths |
| 2 | `LICENSE` present and correct | ☐ | |
| 3 | `CONTRIBUTING.md` — fork, branch, PR flow | ☐ | |
| 4 | `docs/SUPPORT.md` — self-host, community, professional services | ☐ | Links to SparxIT contact for paid help |
| 5 | `AGENTS.md` — AI agent rules for contributors | ☐ | |
| 6 | `docs/LOCAL_SETUP_GUIDE.md` — end-to-end self-host works | ☐ | Fresh clone → running app on a clean machine |
| 7 | Edge functions documented (Gemini required; Resend optional) | ☐ | See README + setup guide; no secret values |

### Release & assets

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8 | GitHub Release **v0.1.0** with changelog | ☐ | Tag matches export; list major features + breaking notes |
| 9 | 3–5 screenshots or one short demo GIF | ☐ | Pipeline, candidate drawer, dashboard — anonymized data |
| 10 | OG image for social sharing (1200×630) | ☐ | For GitHub social preview, thetalentapp.io, and posts |
| 11 | `thetalentapp.io` landing page live | ☐ | When ready — GitHub + docs are enough for v0.1.0 |

### Security & hygiene

| # | Task | Status | Notes |
|---|------|--------|-------|
| 12 | No secrets in repo or export | ☐ | `.env*` excluded; review `oss-export.exclude` |
| 13 | Rotate/redact any leaked keys in git history if needed | ☐ | Use `git log -p` / GitHub secret scanning; rotate in Supabase/Gemini/Resend |
| 14 | `npm run export:oss` dry-run reviewed | ☐ | Confirm no private paths leak |

### GitHub repo settings

| # | Task | Status | Notes |
|---|------|--------|-------|
| 15 | Topics added (`ats`, `recruitment`, `supabase`, `react`, `open-source`, etc.) | ☐ | |
| 16 | Repo description + website URL set | ☐ | Website → GitHub or thetalentapp.io when live |
| 17 | Discussions enabled (optional but recommended) | ☐ | Q&A + ideas |
| 18 | Pin repo on org/user profile | ☐ | |

---

## 3. Announcement platforms

Use this as the master list. **Tier 1** first for impact; **Tier 3–4** can run in parallel with lower effort.

### Tier 1 — High impact

| Platform | URL | Purpose | Best timing | One-line tip |
|----------|-----|---------|-------------|--------------|
| **Hacker News — Show HN** | https://news.ycombinator.com/showhn.html | Dev/startup audience; high traffic if it lands | Week 2 (Tue–Thu, US morning) | Lead with problem + self-host; link GitHub + setup guide |
| **Product Hunt** | https://www.producthunt.com/posts/new | Broader product audience; agencies may discover | Week 4 | Prepare maker comment, screenshots, and FAQ; don't oversell SaaS |
| **Reddit — r/selfhosted** | https://www.reddit.com/r/selfhosted/ | Perfect fit for Supabase self-host story | Week 2 (space from HN by 2–3 days) | Be technical, honest about ops; follow sub rules |
| **Reddit — r/opensource** | https://www.reddit.com/r/opensource/ | OSS community visibility | Week 2–3 | Focus on license, stack, and contribution path |
| **Reddit — r/recruiting** | https://www.reddit.com/r/recruiting/ | HR/recruiter angle; less technical | Week 4 | Emphasize spreadsheet pain and pipeline — avoid jargon |
| **GitHub Release** | https://github.com/vikashsparxit/the-talent-app/releases | Canonical version anchor for all links | Week 1 | v0.1.0 + changelog; link from every post |
| **GitHub — topics & pin** | https://github.com/vikashsparxit/the-talent-app | Discoverability in GitHub search | Week 1 | Add 5–8 relevant topics |
| **GitHub Discussions** | Repo → Settings → Features | Community Q&A without issue noise | Week 1 | Pin a "Welcome / How to self-host" thread |

### Tier 2 — Dev communities

| Platform | URL | Purpose | Best timing | One-line tip |
|----------|-----|---------|-------------|--------------|
| **Dev.to** | https://dev.to/new | Long-form technical post + tags | Week 3 | "How we built an ATS on Supabase" — code snippets, architecture |
| **Hashnode** | https://hashnode.com/ | Cross-post or mirror Dev.to | Week 3 | Same article; canonical link to Dev.to or Hashnode |
| **Lobsters** | https://lobste.rs/ | Quality technical audience | Week 2–3 | Only if you have an account; no hype — technical depth |
| **Indie Hackers** | https://www.indiehackers.com/post/new | Builders considering self-host vs buy | Week 3–4 | Story angle: why OSS first, not SaaS yet |
| **LinkedIn — personal** | https://www.linkedin.com/ | Founder/team credibility | Week 3 | Short post + screenshot; tag SparxIT lightly |
| **LinkedIn — SparxIT company** | https://www.linkedin.com/company/sparx-it-solutions/ | Company reach | Week 3 | Professional tone; link GitHub, not sales page |

### Tier 3 — Listings & directories

| Platform | URL | Purpose | Best timing | One-line tip |
|----------|-----|---------|-------------|--------------|
| **Awesome Self-Hosted** | https://github.com/awesome-selfhosted/awesome-selfhosted | High-intent self-host traffic | Week 1 (PR) | Follow their PR template; category: Software / Groupware or Office |
| **AlternativeTo** | https://alternativeto.net/ | "Alternative to Greenhouse/Lever" discovery | Week 2–4 | List as self-hosted ATS; link GitHub |
| **OpenAlternative** | https://openalternative.co/submit | OSS product directory | Week 2–4 | Submit after README and release are solid |
| **LibHunt** | https://www.libhunt.com/ | Auto-indexes trending GitHub repos | Passive | Ensure repo description and topics are good — indexing is automatic |
| **Supabase community** | https://discord.supabase.com/ + showcase channels | Stack-aligned users | Week 2 | Share in #showcase; mention Supabase + edge functions |

### Tier 4 — Newsletters (optional submit)

| Newsletter | URL | Purpose | Best timing | One-line tip |
|------------|-----|---------|-------------|--------------|
| **Console.dev** | https://console.dev/ | Dev tools spotlight | Anytime after launch | Short pitch: OSS ATS, Supabase, AI optional |
| **Bytes** | https://bytes.dev/ | React/front-end audience | After Dev.to post | Tie to React + TanStack Query stack |
| **React Status** | https://react.statuscode.com/ | React ecosystem | After Dev.to post | Same story, React angle |
| **Self-hosted newsletters** | Search Substack/Medium for "self-hosted" roundups | Niche install guides audience | Week 2–3 | Offer to write a guest blurb if they accept submissions |

---

## 4. Recommended launch sequence

Space announcements **at least 2–3 days** apart. Monitor comments on GitHub, Reddit, and HN daily during launch month.

| Week | Focus | Actions |
|------|-------|---------|
| **Week 0 — Prep** | Checklist | Finish pre-launch checklist; dry-run `export:oss`; test setup guide on clean machine; capture screenshots/GIF; draft all posts |
| **Week 1 — Foundation** | GitHub + listings | `npm run export:oss:push` → Release **v0.1.0**; enable Discussions; topics + pin repo; open Awesome Self-Hosted PR |
| **Week 2 — Technical audience** | HN + Reddit technical | Show HN (Tue–Thu); r/selfhosted 2–3 days later; r/opensource; Supabase Discord showcase; Lobsters if applicable |
| **Week 3 — Content + social** | Dev.to + LinkedIn | Publish technical blog post; LinkedIn personal + company; submit AlternativeTo / OpenAlternative |
| **Week 4 — Broader reach** | PH + HR angle | Product Hunt launch; r/recruiting; Indie Hackers post; newsletter submits if desired |

### Daily during launch month

- Reply to GitHub Issues and Discussions within 24–48 hours
- Thank contributors; triage PRs (label, review, or politely defer)
- Note recurring questions → update FAQ in README or SUPPORT.md

---

## 5. Messaging guidelines

### Do say

- **OSS value:** Free to self-host, full source, no vendor lock-in
- **Spreadsheet pain:** Scattered candidates, no pipeline visibility, interview chaos
- **Stack honesty:** React + Supabase + optional Gemini for AI features
- **Links:** GitHub repo, [LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md), [SUPPORT.md](SUPPORT.md)
- **Professional help:** [SparxIT contact](https://www.sparxitsolutions.com/contact-global.shtml) for implementation, integrations, or managed setup — via SUPPORT.md, not as the main CTA

### Do not say

- Hosted signup, "try free," or SaaS pricing — **not available yet**
- Fake enterprise features or compliance certifications we don't have
- Internal URLs, client names, or production SparxIT instance links
- "We're the next Greenhouse" — we're a minimal OSS ATS for small teams

### Tone

Professional, helpful, technical when the audience is technical. Lead with the problem and the open-source solution — not a sales pitch.

---

## 6. Draft post titles (examples)

### Show HN

> **Show HN: The Talent App – open-source ATS for agencies still on spreadsheets (self-host with Supabase)**

### r/selfhosted

> **[Self-hosted] The Talent App – minimal ATS (React + Supabase + optional Gemini AI)**

### LinkedIn (one-liner)

> We open-sourced **The Talent App** — a lightweight ATS for teams tired of hiring on spreadsheets. Self-host on Supabase, full pipeline + AI optional. GitHub link in comments.

---

## 7. Dual-repo reminder

| Repo | Remote | Role |
|------|--------|------|
| **sparxtalent** | `origin` (private) | Source of truth — all development |
| **the-talent-app** | `oss` (public) | Sanitized export only |

**Never** push directly to `oss` or `the-talent-app`. OSS updates only via:

```bash
npm run export:oss        # preview (dry run)
npm run export:oss:push   # export + push to public main
```

**Authoritative reference:** [docs/DEPLOYMENT.md](DEPLOYMENT.md)

Before every export: confirm `npx tsc --noEmit` and `npm run build` pass; review `oss-export.exclude` for new private paths.

---

## 8. Post-launch

| Area | Action | Cadence |
|------|--------|---------|
| **GitHub Issues** | Respond, label (`bug`, `enhancement`, `question`), close duplicates | Ongoing |
| **Community PRs** | Triage within 1 week; review or explain roadmap deferral | Per PR |
| **Public export** | `npm run export:oss:push` after meaningful releases | Monthly or per release |
| **Metrics** | Track stars, forks, clone traffic (GitHub Insights) | Weekly first month, then monthly |
| **Docs** | Update README/setup from recurring questions | As needed |
| **Security** | Rotate keys if exposure suspected; keep dependencies updated | Ongoing |

### Release rhythm (suggested)

- **Patch** (0.1.x): bug fixes, doc updates — export when convenient
- **Minor** (0.2.0): features — GitHub Release + short changelog post
- **Announce** only on Tier 1/2 channels for minor+ releases; avoid announcement fatigue

---

## Quick reference

| Resource | Link |
|----------|------|
| Public repo | https://github.com/vikashsparxit/the-talent-app |
| Self-host guide | [LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md) |
| Support | [SUPPORT.md](SUPPORT.md) |
| Deploy / dual-repo | [DEPLOYMENT.md](DEPLOYMENT.md) |
| SparxIT | https://www.sparxitsolutions.com |
| Professional contact | https://www.sparxitsolutions.com/contact-global.shtml |
| Marketing site (planned) | https://thetalentapp.io |

---

*Last updated: June 2026 — maintain this doc as launch tactics evolve.*
