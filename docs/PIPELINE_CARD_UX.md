# Pipeline Kanban Card UX

Durable decisions for hiring-board card density. Implementation: `src/components/pipeline/PipelineKanbanCards.tsx`.

## Option A — Active cards

Keep active interview cards scannable, not dossier-like:

- **Row layout** — (1) drag + name + score/⋯ (2) fit badge + status (verdict chip / Feedback overdue / NEW / Form pending / assessment) (3) schedule datetime + people avatars on one line (4) action CTAs.
- **People** — one horizontal row of compact initials avatars: job recruiters (always, when assigned) + this-round panelists when scheduled (deduped). No full-name vertical list. Share the datetime row when both exist (date left, avatars right).
- **Overdue** — amber card tint + muted “Feedback overdue” on the fit/status row; never a pulsing pill beside the name.
- **Surface tints** — rejected/declined rose; hold + feedback overdue amber; proceeded emerald; normal/default otherwise.
- **CTAs** — at most one filled primary per card (overdue Feedback soft-amber → Join → Schedule). Reschedule / Edit Feedback / non-urgent Feedback are outline. No pulse on Feedback. Verdict actions stay `flex-row flex-wrap` (Reschedule + Edit Feedback + Advance / Mark Hired).
- **Overflow** — Assign Assessment, Re-open, Remove live in `⋯`, not as always-visible buttons

## Option C — Terminal / declined strips

Rejected verdict, withdrawn (`backout`), and Pending Approval **Declined** use a single compact row: name + fit badge + status chip. No schedule/feedback CTA row; overflow only where reopen/remove still applies. Declined strips use a muted rose tint + strikethrough.

## Post-verdict actions

When a verdict exists (non-locked), **Reschedule** (or Schedule) and **Edit Feedback** share one row so recruiters can correct timing or feedback without opening the drawer first. Advance / Mark Hired remain the single filled primary when shown, in the same horizontal wrap row.

## Do strip (Action Queue)

Header strip above the board (`PipelineActionQueue` + `buildPipelineActionQueue`). Deterministic counts only — no Gemini essays on the strip. Hidden entirely when the selected job is **paused** (alongside Health).

**Priority (cap ~6):** Decide → Approve pending → Reschedule/clear no-shows → Schedule / schedule-push → Source → Chase feedback.

**Closure targets (v1):**
- **schedule_push** — when unscheduled interviews exist and a deadline is set: “Align N interviews before {date}”; CTA filters `?action=schedule`. Without deadline: “Schedule N this week”.
- **source** — when openings remain and **clean active** funnel depth &lt; `openings_left × 4` (thin / near-deadline / early or aged thin): “Add N candidates this week” (or “by {deadline}” if ≤14d). Bite size capped 1–8 (prefer ≥3 away from deadline). CTA → `/hiring?view=list&job={id}&action=add`. Clean active excludes unresolved `no_show` rows.

**noshow** — when unresolved no-shows exist: “Reschedule or clear N no-shows”; CTA filters `?action=noshow`.

Urgent decisions still rank above sourcing.

**Not the same as:**
- **Radar** — deterministic weekly/closure strategy (floating FAB / toolbar). Funnel depth, weekly add-N, stage pass signals, no-show waste, rejection mix, shortlist-by-fit. Ops math only — no Gemini. Hidden when the job is **paused**. Shown on healthy funnels too (quiet FAB; panel suggests maintain/improve). Amber badge when urgent (`!healthy`).
- **Health** — AI grade (A–F) for the role; regenerate in the health drawer. Hidden entirely when the job is **paused** (even if a grade already exists).
- **Chitra** — autonomous watch/nudge agent.

Buttons focus/filter the board or navigate to Add Candidate (`source`). No-shows use `?action=noshow`.

## Radar UX

- **Where** — Hiring / Pipeline **board** view only (`Pipeline.tsx`). Not on Candidates / list view.
- **Desktop** — teal FAB (same diameter/shadow/open→X pattern as Chitra) fixed bottom-right, stacked **above** Chitra; closed state animates the radar glyph. Click opens ~340px mini-panel (job title heading + plain-English summary, Do this week, Status with People in play, Funnel notes; Do-vs-Radar note in header Info tooltip).
- **Mobile** — teal-elevated toolbar icon (next to Health) → bottom sheet; no second corner FAB (Chitra owns the corner).
- **Mutual exclusion** — opening Radar closes Chitra and vice versa when both are available.
- **Job tabs** — plan re-derives from job-scoped `buildPipelineClosePlan` inputs when the active job changes; panel heading uses `activeJob.title`.
- **Internal** — builder/math keep `pipelineClosePlan` / `buildPipelineClosePlan`; UI label is **Radar** (`lucide` `Radar`).

## Radar vs Do vs Health vs Chitra

| Layer | Role | Source of truth |
|-------|------|-----------------|
| **Do** | Click-now micro-actions (Decide, Approve, Clear no-shows, Schedule, Source, Chase feedback) | `buildPipelineActionQueue` — counts + CTAs |
| **Radar** | Weekly/closure volume + strategy (FAB + panel) | `buildPipelineClosePlan` — openings left, **clean active** (excludes unresolved no-shows), funnel target `×4`, weekly add 1–8 |
| **Health** | Role grade A–F + insights | AI regenerate in drawer |
| **Chitra** | Autonomous internal nudges | `notifications` / escalations only |

**Clean active** (shared by Source chip and Radar) = non-rejected board + pending needing action − unresolved `no_show` rows.
