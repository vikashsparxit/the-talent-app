# TTA Design Kit — UI-only visual refresh

> **Scope:** Restyle only. No route, query, RLS, drag-and-drop, MFA, or email logic changes.  
> **Audience:** Engineers implementing phased visual polish. Public-safe — no pricing, private strategy, or tenant-specific ops.

---

## Verdict

**Yes — a Dribbble-grade ATS look is achievable without rewriting the product.**

TTA already runs on Tailwind + shadcn with CSS-variable tokens, runtime brand theming (`brandTheme.ts` + Settings → Business), and several domain-specific skins (pipeline chips, `MetricCard`, candidate drawer score rings). The gap vs reference shots (TalentLink, SmartHire, Talentfly) is mostly **layout chrome** (horizontal top nav vs vertical ATS sidebar), **token consistency** (mixed hardcoded Tailwind palette vs brand primary), and **elevation/radius** (default shadcn `rounded-md` + `border` vs softer card-on-canvas depth).

Restyle via tokens + component skins + small layout wrappers — not a 1200-line Pipeline rewrite.

---

## Current state audit (Sep 2026)

### What exists today

| Layer | Location | Notes |
|-------|----------|-------|
| **Design tokens** | `src/index.css` | SparxIT coral/red primary (`--primary: 2 65% 55%`), charcoal accent, success/warning/info, `--radius: 0.5rem` (8px), custom `--shadow-card`, `--gradient-primary`, sidebar CSS vars |
| **Tailwind mapping** | `tailwind.config.ts` | Standard shadcn HSL token bridge; `fontFamily.sans` = Inter, `display` = Plus Jakarta Sans |
| **Runtime brand** | `src/lib/brandTheme.ts`, `BrandThemeProvider` | Injects `--primary`, `--ring`, `--sidebar-primary`, `--gradient-primary`, `--shadow-button` from Settings hex |
| **shadcn primitives** | `src/components/ui/` | 48 components — default shadcn variants (Button `rounded-md`, Card `rounded-lg border shadow-sm`, Badge `rounded-full`, Sheet overlay `bg-black/80`) |
| **App shell** | `src/components/AppShell.tsx`, `Header.tsx` | Light vertical sidebar (desktop) + slim top bar: search, CTAs, Chitra, notifications, profile. Mobile keeps bottom nav. |
| **Mobile nav** | `src/components/BottomNav.tsx` | Fixed bottom tabs + More sheet |
| **Dashboard** | `src/pages/Index.tsx` | Page title block + `MetricCard` KPI grid (custom, not raw Card) + lazy chart widgets |
| **Pipeline** | `src/pages/Pipeline.tsx` (~1.7k lines) | Job tabs, horizontal kanban, `DroppableColumn` with `bg-secondary/30` drop zones, DnD via `@dnd-kit` |
| **Kanban cards** | `src/components/pipeline/PipelineKanbanCards.tsx` | Custom `CHIP_BASE`, verdict tints, fit-score badges, `CARD_SURFACE` — **already domain-aware** |
| **Candidate drawer** | `src/components/candidates/CandidateDetailDrawer.tsx` | Radix Sheet, `text-2xl` name header, score rings, collapsible sections — functional but default sheet chrome |
| **KPI cards** | `src/components/MetricCard.tsx` | `rounded-xl`, colored top bar, hardcoded palette (`blue`, `violet`, `emerald` — **not brand-primary**) |

### What reads as "AI-generic shadcn"

1. **Horizontal nav shell** — reference ATS UIs (TalentLink, SmartHire) use a persistent **light vertical sidebar** + content canvas; TTA uses a marketing-style top nav that feels like a generic SaaS landing app.
2. **Default shadcn radii and borders** — `--radius: 0.5rem`, cards with `border border-border shadow-sm`; Dribbble refs use **10–12px radius**, borderless cards on a tinted canvas with elevation-1/2 shadows.
3. **Palette sprawl** — `MetricCard` and pipeline chips use Tailwind semantic colors (blue/violet/emerald/rose) alongside brand primary; refs keep **one brand accent** + muted status pastels.
4. **Accent misuse** — `--accent` is charcoal (SparxIT brand secondary), so ghost/outline hover states feel dark-neutral instead of brand-tinted.
5. **Unused sidebar infra** — `src/components/ui/sidebar.tsx` + sidebar CSS vars exist but the staff app shell does not use them.
6. **Sheet overlay** — `bg-black/80` is heavier than TalentLink-style drawers (lighter scrim, wider panel, stats bar under header).

### What is *not* broken — keep it

- Runtime brand color from Settings (must survive the redesign)
- Pipeline verdict chips, fit badges, card surface tints (refine tokens, don't replace logic)
- Lucide icons throughout
- Inter + Plus Jakarta Sans pairing (matches reference aesthetic)
- Mobile bottom nav pattern (recruiter field use)
- Dark mode CSS vars (already defined; polish after light mode)

---

## What NOT to copy from reference shots

| Reference | Why not for TTA |
|-----------|-----------------|
| **GetHire** (job-seeker dashboard) | Candidate-facing IA: profile progress, "Apply" CTAs, calendar widgets for applicants. TTA is a **recruiter ATS** — do not add job-seeker navigation or hero search banners to staff views. |
| **Dribbble whitespace** | Mockups show ~5–8 cards per screen with fake data. TTA pipeline handles **real volume** — kanban columns must stay scannable at 15–30 cards; don't sacrifice density for airy mockup padding. |
| **Generic SaaS blue** | TalentLink/SmartHire use blue; Talentfly uses orange. TTA already has **coral/red brand primary** (`#D64541`) overridable per tenant. Do not reset to `#3B82F6` — extend tokens, don't replace brand. |
| **New IA / pages** | No "Overview Process" rename, no new nav items, no job-seeker "Chats" tab. Labels may tighten copy but routes stay the same. |
| **Full Pipeline.tsx rewrite** | Drag-drop, stage management, action queue, and filters are entangled in one file. Prefer **CSS variables + className overrides + thin wrappers** over structural refactors. |

---

## Design tokens

All new tokens live in `src/index.css` as CSS variables so `applyBrandTheme()` and Settings → Business continue to override `--primary` at runtime.

### Surfaces

| Token | Light value (proposed) | Usage |
|-------|------------------------|-------|
| `--background` | `220 14% 97%` (~`#F7F8FA`) | Page canvas (TalentLink/SmartHire off-white) |
| `--card` | `0 0% 100%` | Card, drawer panel, popover |
| `--muted` | `220 14% 94%` | Kanban column wells, inset sections |
| `--border` | `220 13% 91%` | Subtle dividers (prefer shadow over border on cards) |

Keep `--card-foreground`, `--muted-foreground` aligned with existing contrast ratios.

### Radius

| Token | Proposed | Maps to |
|-------|----------|---------|
| `--radius` | `0.625rem` (10px) | shadcn `rounded-lg` base |
| `--radius-sm` | `0.5rem` (8px) | chips, compact controls |
| `--radius-lg` | `0.75rem` (12px) | KPI cards, drawer sections |
| `--radius-xl` | `1rem` (16px) | hero blocks (dashboard only) |

Update `tailwind.config.ts` `borderRadius` to expose `xl` from `--radius-lg` if needed.

### Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-1` | `0 1px 3px hsl(220 20% 20% / 0.06), 0 1px 2px hsl(220 20% 20% / 0.04)` | KPI cards, kanban candidate cards |
| `--shadow-2` | `0 4px 16px -4px hsl(220 20% 20% / 0.10), 0 2px 6px -2px hsl(220 20% 20% / 0.06)` | Drawer, floating panels |
| `--shadow-button` | *(existing, brand-tinted)* | Primary CTAs |

Retire or alias `--shadow-card` / `--shadow-card-hover` to `--shadow-1` / `--shadow-2` for one elevation scale.

### Sidebar (recommended: light)

Align with TalentLink / SmartHire — **light sidebar**, white or near-white, subtle right border.

| Token | Proposed light | Notes |
|-------|----------------|-------|
| `--sidebar-background` | `0 0% 100%` | White sidebar |
| `--sidebar-foreground` | `220 9% 26%` | Nav labels |
| `--sidebar-accent` | `220 14% 96%` | Hover / active pill background |
| `--sidebar-accent-foreground` | `220 9% 15%` | Active label |
| `--sidebar-border` | `220 13% 91%` | Right edge |
| `--sidebar-primary` | *(runtime brand)* | Active indicator dot or left bar |

**Optional later:** dark sidebar variant (GetHire-style) as a theme toggle — not Phase 0.

### Typography scale

| Role | Font | Size / weight | Where |
|------|------|---------------|-------|
| Page title | Plus Jakarta Sans | `text-2xl font-bold tracking-tight` | Dashboard, Pipeline, Jobs |
| Section title | Plus Jakarta Sans | `text-lg font-semibold` | Kanban column headers, drawer sections |
| Card metric | Inter | `text-2xl–3xl font-bold tabular-nums` | KPI values |
| Body | Inter | `text-sm` | Default UI |
| Meta / chip | Inter | `text-xs font-medium` | Badges, timestamps |

Headings already use Plus Jakarta Sans via `index.css` — enforce in page title components, not globally on every `h3`.

### Status chips (pipeline + drawer)

Standardize on one chip recipe (already started in `PipelineKanbanCards.tsx`):

```css
/* Concept — implement as Tailwind @apply or shared cn() constant */
.chip {
  @apply inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none;
}
```

Status hues stay **desaturated pastels** (emerald/amber/rose/slate) — independent of brand primary. Map verdict, fit score, and application-form badges to the same height/padding.

### Kanban column chrome

| Element | Proposed skin |
|---------|---------------|
| Column header | Dot (stage color hash) + semibold title + count pill |
| Column well | `bg-muted/50 rounded-xl p-2 min-h-[200px]` — no hard border |
| Drop highlight | `ring-2 ring-primary/25 bg-primary/5` (keep existing behavior) |
| Column width | Keep `320px` — do not widen for aesthetics |

### Drawer / sheet

| Element | Proposed skin |
|---------|---------------|
| Overlay | `bg-black/40` (lighter than current `/80`) |
| Panel | `sm:max-w-2xl` or `max-w-3xl` for candidate detail; `shadow-2` |
| Header | Avatar + name + status pill + icon actions (TalentLink pattern) |
| Stats bar | Horizontal metrics with vertical dividers below header |
| Tabs | Underline active tab (`border-b-2 border-primary`) instead of muted pill list |

---

## Component skins (map to existing shadcn)

Change **default classes in `src/components/ui/*`** or add variant props — do not fork components.

| Component | File | Skin changes |
|-----------|------|--------------|
| **Button** | `button.tsx` | Default: `rounded-lg`; keep `btn-gradient` for header CTAs; outline hover → `bg-primary/5` not charcoal accent |
| **Card** | `card.tsx` | Default: `rounded-xl border-0 shadow-[var(--shadow-1)]`; optional `variant="outline"` keeps border for dense tables |
| **Badge** | `badge.tsx` | Add `soft` variant: pastel bg + matching text (pipeline chips); keep `default` for primary |
| **Sheet** | `sheet.tsx` | Lighter overlay; drawer width tokens; `rounded-l-xl` on right panel |
| **Tabs** | `tabs.tsx` | Add `variant="underline"` for drawer; keep pill `TabsList` for settings sub-tabs |
| **Input** | `input.tsx` | `rounded-lg bg-card border-border/80 h-10`; focus ring uses `--ring` (brand) |
| **Sidebar** | `sidebar.tsx` | Wire into app shell Phase 1; use existing sidebar color tokens |

### App-level wrappers (new, minimal)

| Wrapper | Purpose |
|---------|---------|
| `PageHeader` | Title + subtitle + actions row (replace repeated flex blocks in Index, Pipeline, Jobs) |
| `AppShell` | Sidebar + header strip + `{children}` canvas — wraps staff routes only |
| `KpiCard` | Evolve `MetricCard` to use brand-adjacent icon tints + `--shadow-1` (optional rename) |

---

## Phased rollout

Each phase is independently shippable. Run `npx tsc --noEmit` + visual QA after each.

### Phase 0 — Tokens only (`index.css` + `tailwind.config.ts`) ✅ Done

- Update `--background`, `--radius`, `--shadow-1/2`, sidebar light tokens
- Add utility classes: `.surface-canvas`, `.surface-card`, `.shadow-elev-1`, `.shadow-elev-2`
- **Whole app shifts** with zero component edits
- Verify `applyBrandTheme()` still overrides primary/ring/sidebar-primary

**Acceptance:** Settings brand color picker still recolors buttons and focus rings; no contrast regressions on primary buttons.

### Phase 1 — App shell (sidebar + header + page title) ✅ Done

- Introduce `AppShell` with light vertical sidebar (`sidebar.tsx`) mirroring existing `navConfig` items
- Slim top bar: search, notifications, profile (nav moves to sidebar)
- `PageHeader` on Dashboard, Pipeline, Jobs, Candidates, Settings
- Keep `BottomNav` on mobile — sidebar collapses to existing bottom tabs

**Acceptance:** Same routes and nav labels; desktop gains TalentLink-style sidebar; no broken deep links.

### Phase 2 — Dashboard KPI cards ✅ Done

- Restyle `MetricCard`: unified icon treatment (brand-tinted or neutral gray), `--shadow-1`, `--radius-lg`
- Chart/widget containers use `Card` skin from Phase 0
- Period toggle matches input radius tokens

**Acceptance:** KPI numbers still readable at a glance; 4-up grid unchanged on lg.

### Phase 3 — Pipeline kanban + job cards ✅ Done

- Column chrome (`DroppableColumn` classes only)
- `PipelineKanbanCards` — align card shadow/radius to tokens; keep verdict tints
- Job tab bar: optional underline active state (CSS only)
- Jobs list page (`Jobs.tsx`) — card rows with inline pipeline stats (Talentfly-inspired **layout**, not new data)

**Acceptance:** Drag-drop, stage edit, action queue, filters unchanged; card density ≥ current.

### Phase 4 — Candidate drawer ✅ Done

- Sheet width, overlay, header stats bar, underline tabs
- Score ring section uses `surface-card` inset
- Skills/tags use `Badge` soft variant

**Acceptance:** All drawer tabs and actions work; stacked drawer offsets (`sheetClassName`) preserved.

### Phase 5 — Settings, tables, misc (in progress)

- **Overflow containment (blocking fix):** `SidebarInset` + `StaffLayout` outlet get `min-w-0 max-w-full overflow-x-hidden`; wide tables scroll inside card wrappers (`Candidates`, `Jobs`, `Evaluations`, `Settings` tab tables); default `Table` wrapper uses `overflow-x-auto min-w-0`.
- Settings: `PageHeader` callout uses `surface-card`; tab tables use bordered card scroll wrappers.
- Evaluations list: `PageHeader`, KPI `surface-card` tiles, table card with horizontal scroll.
- Auth: brand-tinted gradient canvas + `surface-card` login card (matches applicant login tone).

**Acceptance:** Form validation and MFA enrolment UI unaffected; main content never slides under sidebar on wide tables.

### Phase 5 — remaining

- Settings tab underline variant (optional)
- Applicant portal: light touch only — separate candidate-facing tone
- Dark mode audit for new surfaces

---

## Guardrails

1. **No new pages, routes, or features** — visual only
2. **No nav IA change** — same items from `navConfig`; label tweaks OK if meaning unchanged
3. **Keep Lucide** — no icon set swap
4. **Keep Tailwind + shadcn** — no MUI, Chakra, or second CSS framework
5. **Pipeline.tsx** — CSS/class changes and extracted presentational subcomponents only; no DnD logic moves
6. **Brand via CSS variables** — never hardcode `#D64541` in new code; use `bg-primary`, `text-primary`, `hsl(var(--primary))`
7. **No commit of WIP** — each phase is a reviewable PR-sized diff
8. **Applicant vs staff** — staff ATS patterns first; applicant portal follows later if needed

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Brand color contrast** | Tenant-chosen primaries may fail WCAG on buttons/chips. Keep `getPrimaryForegroundHsl()`; add contrast warning in Settings preview (already partially there). |
| **Recruiter muscle memory** | Sidebar move disorients daily users. Ship Phase 1 with release note; optional "compact top nav" fallback flag for one release if needed. |
| **Mobile regression** | Sidebar must not break bottom nav or drawer stacking. Test iPhone safe areas + `useHasOpenOverlay`. |
| **Dark mode drift** | Light tokens ship first; audit `.dark` block in Phase 5 so new surfaces have pairs. |
| **Pipeline perf** | Avoid extra DOM wrappers per card; prefer class-only changes. |
| **Scope creep** | "While we're here" feature requests — reject; link to ROADMAP ATS gaps instead. |

---

## Reference mapping (inspiration → TTA surface)

| Reference | Borrow | TTA surface |
|-----------|--------|-------------|
| TalentLink | Light sidebar, drawer header + stats bar, skill pills | Phase 1 + 4 |
| SmartHire | Kanban card density, status badge pastels, job-level KPI row | Phase 3 |
| Talentfly | Job list with inline stage counts | Phase 3 (`Jobs.tsx`) |
| GetHire | *Do not borrow IA* | — |

---

## Files touched (by phase)

| Phase | Primary files |
|-------|---------------|
| 0 | `src/index.css`, `tailwind.config.ts` |
| 1 | `src/components/Header.tsx`, new `AppShell.tsx`, `src/App.tsx` route layout, `src/lib/navConfig.ts` (classNames only) |
| 2 | `src/components/MetricCard.tsx`, `src/pages/Index.tsx`, `src/components/dashboard/*` |
| 3 | `src/pages/Pipeline.tsx` (classes), `PipelineKanbanCards.tsx`, `src/pages/Jobs.tsx` |
| 4 | `CandidateDetailDrawer.tsx`, `sheet.tsx`, `tabs.tsx`, `badge.tsx` |
| 5 | `AppShell.tsx`, `sidebar.tsx`, `table.tsx`, `Candidates.tsx`, `Jobs.tsx`, `Hiring.tsx`, `Evaluations.tsx`, `Settings.tsx`, `Auth.tsx`, `HiringJobPicker.tsx`, `Header.tsx` |

---

## Success criteria

- Staff app reads as a **purpose-built ATS**, not a generic shadcn starter
- Brand color from Settings still drives primary, rings, and sidebar accents
- Pipeline remains usable at production candidate volumes
- Zero changes to Supabase schema, edge functions, or business logic
- Each phase is revertible without data migration
