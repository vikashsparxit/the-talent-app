# UI Redesign Plan v2: OpsLoop-grade polish for The Talent App

> **Status:** Plan only. No code has been changed.
> **Builds on:** [`docs/DESIGN_KIT.md`](DESIGN_KIT.md) (v1: sidebar shell, surface tokens, KPI cards, kanban and drawer skins, Phases 0–4 shipped). v2 keeps every v1 guardrail: no new routes or IA, no Pipeline.tsx rewrite, brand color stays a runtime CSS variable, and kanban density does not drop.
> **Reference:** [opsloop-dashboard.vercel.app](https://opsloop-dashboard.vercel.app/), measured with DevTools on 2026-09-26 (see §2.1).
> **Skills applied:** better-ui, better-typography, better-accessibility, better-layout and better-colors ([jakubkrehel/skills](https://github.com/jakubkrehel/skills)); emil-design-eng ([emilkowalski/skills](https://github.com/emilkowalski/skills)); libraries-dev ([Jakubantalik/Libraries.dev](https://github.com/Jakubantalik/Libraries.dev/tree/main/skills/libraries-dev)).

---

## 0. TL;DR

- **Direction:** a calm, neutral canvas (`#f8f8f8`) with white 12px cards separated by shadow-as-border instead of borders. Everything uses one typeface (Inter, self-hosted) at a few sizes and weights. Numbers are large, light and tabular. Coral (from the runtime brand setting) appears only on the single primary action and in data. Data visuals use thin segmented "tick" progress bars and monthly bar charts with one highlighted bar.
- **Motion:** curves are taken from the skills (these are also the exact curves opsloop ships):
  - `cubic-bezier(0.23, 1, 0.32, 1)` for UI
  - `cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement
  - `cubic-bezier(0.32, 0.72, 0, 1)` for drawers
  - `cubic-bezier(0.2, 0, 0, 1)` for icon swaps
  - Timing: 150ms for high-frequency feedback, `scale(0.96)` on press, and no animation at all on the ⌘K palette.
- **Expressive layer (libraries.dev, all MIT on npm):** thinking orbs for AI waits of 2s or more, a border beam only for waits over 3s, and the Voice glow on the palette mic. Bot avatar for Chitragupta is optional and needs your decision. Gooey and Metal are optional and used at most once. Image is **not recommended** (needs `three`, and the app has no AI-generated images).
- **Rollout:** 16 phases of at most 5 files each. Phase 0 (tokens and primitives, no visual change) needs no approval. Phases that add dependencies, change global visuals, or sweep more than 5 files are marked **[APPROVAL]**.

---

## 1. Audit of the current UI

### 1.1 Layout shell

| Piece | File | Current state | Issue (skill rule) |
|---|---|---|---|
| Staff shell | `src/components/AppShell.tsx` | shadcn `Sidebar`, `collapsible="icon"`, `defaultOpen={false}` (line ~263). Active item uses `border-l-2 border-sidebar-primary` (line 65). Jobs and Talent Database are pinned to a second group at `mt-auto`. | The active state is a hairline left border, which does not read as a selected state; opsloop uses a filled pill (`#fff` on `#f8f8f8`, 6px radius). Nav groups have no labels, so grouping is carried by position alone (better-layout: group with space first, then shape). |
| Top bar | `src/components/Header.tsx` | `bg-background/95 backdrop-blur-md border-b`. The ⌘K trigger is a `bg-secondary` pseudo-input (lines 67–79). **Two** `btn-gradient` CTAs sit side by side, Add Candidate and Calendar (line 42). | better-colors "fill exactly one action per view": Calendar is navigation and should not be filled. `btn-gradient` adds a coral glow shadow, which reads as dated next to opsloop's flat fills. The kbd is `text-[10px]`. |
| Mobile nav | `src/components/BottomNav.tsx`, `MoreMenuSheet.tsx` | `h-16`, active state = `stroke-[2.5]` icon plus color. | Active state has no shape cue. Hit areas are fine (full-width cells). |
| Page title | `src/components/PageHeader.tsx` | `font-display text-xl sm:text-2xl font-bold tracking-tight`. | Plus Jakarta at bold weight next to Inter body: two similar geometric sans faces "read as a mistake" (better-typography). |
| Global search | `src/components/GlobalSearchCommand.tsx` | Radix `Dialog` with the default `zoom-in-95` plus fade animation (line ~180). Mic uses `animate-pulse` on `MicOff` (line ~159). "Understanding your search…" uses `Loader2` (lines ~236–240). | Emil: "100+ times/day (command palette toggle) → No animation. Ever." Pulse is the only listening cue besides a text row. |

### 1.2 Tokens (`src/index.css`, `tailwind.config.ts`)

- The color notation is HSL triplets consumed as `hsl(var(--x))`. Keep it: better-colors says "match the project's color system".
- `--background: 220 14% 97%` (blue-grey canvas), `--card: #fff`, `--border: 220 13% 91%`.
- **`--accent` means two different things:** charcoal `0 0% 15%` in light mode and coral `2 65% 55%` in dark mode. Because shadcn uses `accent` for ghost-button hover, menu highlight and command selection, light mode currently highlights menu items with a **charcoal fill and white text**, while dark mode highlights them in coral. This breaks better-colors' "one color, one meaning". v1 flagged it and it is still open.
- **Radius:** `--radius: 0.625rem` (10px). In Tailwind, `sm` maps to `--radius-sm`, which is **8px, the same as `md`** (`calc(10px - 2px)`). So `rounded-sm` and `rounded-md` render identically, and there is no radius step below 8px for nested items.
- **Elevation:** `--shadow-1`, `--shadow-2` and `--shadow-button` (coral glow). No shadow-as-border token exists yet.
- **Fonts:** `@import` from Google Fonts at the top of the CSS (render-blocking, not self-hosted woff2). Inter is used for body text, and Plus Jakarta Sans is applied to **every `h1`–`h6` globally** (lines 161–163).
- **Motion:** `.card-elevated:hover { transform: translateY(-2px) }` with `0.3s ease` (lines 167–176); `animate-fade-in` 0.5s and `animate-slide-up` 0.4s both use `ease-out`. The only custom keyframes are `radar-ring`/`radar-soft` and the Chitragupta eye blink/gaze. There are **no easing tokens**.
- **Runtime brand:** `src/lib/brandTheme.ts` `applyBrandTheme()` injects `--primary`, `--ring`, `--sidebar-primary`, `--gradient-primary` and `--shadow-button` on `:root, .dark` (lines 86–118). Any new brand-derived token must be derived there too.
- **Dark mode can't be reached:** a full `.dark` block exists, but there is **no `ThemeProvider` and nothing adds `.dark`** anywhere in the code. `src/components/ui/sonner.tsx` calls `useTheme()` from `next-themes` without a provider, so it always falls back to `"system"`.

### 1.3 Measured contrast (WCAG 2.x, computed from the token values, not estimated)

| Pair | Ratio | Verdict |
|---|---|---|
| White text on brand primary `2 65% 55%` (#D64541) | **4.33:1** | Fails AA for normal text (4.5). Passes for large text only. Every default `Button` label is affected. |
| White on `2 65% 53%` | 4.58:1 | Passes. This is the lightest brand-hue fill that passes. |
| Primary `2 65% 55%` as text on white | 4.33:1 | Fails for small link text |
| `--muted-foreground` `0 0% 45%` on white | 4.76:1 | Passes |
| Proposed `0 0% 40%` on white / on `#f8f8f8` | 5.74 / 5.41 | Passes |
| Opsloop "tertiary" `#9e9e9e` on white | 2.68:1 | Fails. Do not copy it for text. |
| `orange-600` text on white (Chitra warning) | 3.56:1 | Fails for text (icons need 3:1, so icons pass) |
| `emerald-600` text on white (Chitra praise) | 3.77:1 | Fails for text |
| `violet-600` text on white (Chitra nudge) | 5.70:1 | Passes |
| Chip pastels (success/warning/danger) | 6.10 / 6.20 / 6.68 | Pass |
| Hairline border `#ebebeb` against white | 1.19:1 | Fine for dividers. As an **input boundary** it misses WCAG 1.4.11 (3:1) unless the input has another cue, such as a filled background. |
| Dark: `0 0% 60%` on card `220 10% 12%` | 5.89:1 | Passes |
| Dark: primary `2 65% 55%` on `220 10% 8%` | 4.27:1 | Fails for coral text on dark |

### 1.4 Codebase-wide inconsistencies (counted across `src/**/*.tsx`)

| Pattern | Count | Why it matters |
|---|---|---|
| Raw Tailwind palette classes (`text-violet-600`, `bg-emerald-50`…) | **646 uses in 70 files** | Bypasses the tokens, and dark mode needs manual `dark:` pairs. Heaviest in `ChitraWidget.tsx`, `NotificationBell.tsx`, `Reports.tsx` (lines 462–1000 tinted chips) and `PipelineKanbanCards.tsx`. |
| Arbitrary text sizes `text-[10px]`/`[11px]`… | **172** | Below the 12px floor (better-typography), e.g. `MetricCard.tsx:50`, the `.chip` utility |
| `transition-all` | **32** | better-ui and Emil both say "transition only what changes", e.g. `Index.tsx:51`, `ChitraWidget.tsx:512`, `PipelineRadar.tsx:311,323` |
| `Loader2 animate-spin` | **144** | Correct for short waits. Wrong affordance for AI waits of 2s or more (see §3.4). |
| `btn-gradient` | **19 uses in 11 files** | Glow CTA recipe; conflicts with flat surfaces and one-fill-per-view |
| `rounded-lg` / `rounded-md` / `rounded-xl` / `rounded-2xl` | 173 / 95 / 34 / 6 | No concentric logic, e.g. `Card rounded-lg` wrapping `rounded-lg` children |
| `shadow-md/lg/xl/2xl` vs `shadow-elev-*` | 38 vs 12 | Two elevation systems |
| `active:scale-*` | 3 (`scale-95`) | better-ui wants `0.96` on every pressable, with a `static` opt-out |
| `text-balance` / `text-pretty` | 0 | Headings and descriptions never balanced |
| `motion-safe` / `motion-reduce` | 3 (all in `PipelineRadar.tsx`) | No global reduced-motion policy |
| `Card` base vs dashboard override | `card.tsx` = `rounded-lg border shadow-sm`; 18 files override with `surface-card border-0` | The primitive and its actual usage disagree |

### 1.5 Key screens

| Screen | File(s) | Notes |
|---|---|---|
| Dashboard | `src/pages/Index.tsx` (207 lines), `MetricCard.tsx`, `components/dashboard/*` (12 widgets, all `Card className="surface-card border-0"`) | 4 KPIs (icon tile + `text-3xl font-bold` + trend chip), a 3-column widget grid, and a `PeriodToggle` with `transition-all`. No progress context on the KPIs and no monthly overview chart. |
| /hiring | `src/pages/Hiring.tsx` (125), `HiringJobPicker.tsx`, `Pipeline.tsx` (1,791), `Candidates.tsx` (2,754), `components/pipeline/*` | The toggle labels are hard-coded caps "PIPELINE"/"CANDIDATES" (better-typography: store natural case, use `uppercase`), and the active state is a coral fill (a second filled action on the page). The Do strip is `PipelineActionQueue.tsx`, the Health chip is `PipelineHealthChip.tsx`, and the Radar FAB is `PipelineRadar.tsx` (with a nice `motion-safe` ring). |
| Candidate drawer | `CandidateDetailDrawer.tsx` (~2,500) | `SheetContent` at line ~1434; `ScoreRingSmall` duplicated locally (line 175) beside the shared `ScoreRing.tsx`; AI summary Generate at line ~1597. |
| Feedback dialog | `components/pipeline/InterviewFeedbackDialog.tsx` | Large; uses `btn-gradient`. |
| Chitragupta | `ChitraWidget.tsx` (553), `NotificationBell.tsx` (427) | About 40 raw `violet-*`, `orange-*` and `emerald-*` classes. The panel is `w-[340px] rounded-2xl shadow-2xl` with `transition-all`. A `Loader2` shows while a reply is pending (line ~459). The FAB uses `animate-ping` and `active:scale-95`. The custom **eye mark** (blink 3.8s, gaze 6s) is real brand equity. |
| Reports / Analytics | `Reports.tsx` (1,214), `Analytics.tsx` (363), `reports/TimeVelocitySection.tsx`, `ui/chart.tsx` | recharts with default styling; tinted summary chips built from raw palette colors. |
| Calendar | `InterviewCalendar.tsx`, `components/calendar/*` (4) | Event pills use raw colors. |
| Settings | `Settings.tsx` (4,017) | About 15 top-level tabs in a horizontally scrolling `TabsList` (lines ~3640–3700). Hard to scan. |
| Auth | `Auth.tsx` (479), `ResetPassword.tsx`, `components/auth/*` | Gradient canvas `from-primary/5` (line 242), `btn-gradient` submit (341, 442). Do **not** touch `useAuth.tsx`. |
| Careers / applicant | `Careers.tsx` (668), `ApplicantLogin.tsx`, `ApplicantDashboard.tsx` (705), `ApplicantJob*`, `components/applicant/*` | Public-facing; same gradient-canvas recipe. |
| Mobile / PWA | `BottomNav.tsx`, `PullToRefresh.tsx`, `index.css` safe-area utilities | Solid. `Input` already uses `text-base md:text-sm` (so no iOS zoom), but `select.tsx` is `text-sm` at every width, which triggers iOS zoom on focus. |

---

## 2. Design direction

### 2.1 What opsloop actually does (measured with DevTools at 1440px)

- **Canvas:** `#f8f8f8`. **Cards:** `#fff`, `border-radius: 12px`, **no border and no shadow**; separation comes only from the canvas/card value step. Padding is `20px` on KPI cards and `24px` on chart cards; gaps are `12px` (grid) and `16px` (main stack). KPI cards are a fixed `185px` tall.
- **Type:** system SF stack, **weight 400 everywhere**. `h2` is 20px with line-height 1.2 and tracking `-0.2px`; `h3` is 18px with `-0.18px`. The KPI value is `32px`, tabular, weight 400. Ink is `#222`, secondary `#5c5c5c`, tertiary `#9e9e9e`.
- **Radii:** card 12, button 8, nav pill 6, chip 16. Icon buttons are 36×36 with a `#fafafa` fill, radius 8, and no border.
- **Nav:** horizontal pills, 32px high. Active = white fill with `#0b0b0b` text; inactive = `#505050`.
- **Data visuals:**
  - KPI progress is a row of about 40 vertical 2px ticks. Filled ticks use the category color (orange `#fc6200`, pink `#ea4c7d`, green `#66c398`, purple `#958dfc`); empty ticks use track `#e8e8e8`.
  - The monthly bar chart highlights one bar and mutes the rest.
  - "Performance distribution" is a segmented bar with a radio-group legend.
  - The worker list shows avatar, presence (Active now / Idle 2h / Offline) and a `30/35` done count.
  - The "Employee of the month" card includes a time breakdown.
- **Motion (read from computed styles):**
  - `background-color, color` 150ms with `cubic-bezier(0.23,1,0.32,1)`
  - `background-color, box-shadow, transform` 150ms, same curve
  - Chart `d`/`transform` 600ms with `cubic-bezier(0.77,0,0.175,1)`
  - `--ease-icon: cubic-bezier(.2,0,0,1)`
  - These are exactly the skill values, so the reference and the skills agree.
- **A11y:** skip link, a real `h1` (sr-only), labelled KPI links ("Pending Tasks: 24. Of 125 total. Open in Task Management"), bars as buttons with labels, and the legend as radios.

**What we adapt, not copy:**
- Keep the vertical sidebar. We have too many nav items for pills, and v1's user research chose the sidebar.
- Keep Inter rather than the Apple-only system stack, so rendering is the same on Windows and Android.
- Use 500/600 weights for headings. A dense ATS needs more hierarchy than a 4-card demo.
- Keep kanban density. v1 guardrail: at 15–30 cards per column, do not trade density for airy padding.

### 2.2 Typography

**One family:** Inter Variable, self-hosted `woff2`, loaded with `font-display: swap`. **Drop Plus Jakarta Sans.** Numbers use `tabular-nums` on every changing value. The root keeps `antialiased`, which is already set.

| Token (Tailwind key) | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `text-kpi` | 32px / 1.0 | 500 | -0.02em | KPI values (tabular) |
| `text-title-lg` | 24px / 1.2 | 600 | -0.015em | Page `h1` (`PageHeader`) |
| `text-title` | 18px / 1.3 | 500 | -0.01em | Card `h2`/`h3`, drawer name |
| `text-body` | 14px / 1.5 | 400 | 0 | Default UI (dense pro tool, so 14px is justified) |
| `text-body-lg` | 16px / 1.6 | 400 | 0 | Careers and long-form, capped at 65ch |
| `text-label` | 13px / 1.4 | 500 | 0 | Field labels, table headers, nav |
| `text-caption` | 12px / 1.4 | 400–500 | 0 (uppercase: +0.04em) | Meta, chips, timestamps. **Floor: 12px.** 11px only for kbd and count badges. |

Rules from better-typography:
- `text-balance` on headings and `text-pretty` on descriptions.
- Weight 400 or heavier below 18px.
- Line-height of at least 1.4 on anything that wraps to 3+ lines.
- Natural-case copy styled with `uppercase` (fixes Hiring.tsx "PIPELINE").
- `truncate` plus a tooltip whenever hidden text matters.

### 2.3 Spacing and density

- 4px base grid. Page gutter: 16px on mobile, 24px on desktop.
- Card padding: `p-5` (20px) for stat and list cards, `p-6` (24px) for chart cards, `p-3` for kanban cards (unchanged).
- Grid gap: 12px up to `md`, 16px at `lg` and above.
- Space between groups must be at least 2× the space within a group (better-layout): 8px inside a group, 16px+ between groups, 24px+ between page sections.
- Adjacent filled controls: 8–12px apart. Icon-only controls: at least 40×40 hit area on desktop and 44×44 on touch, extended with a pseudo-element where the visible size stays 32–36px.

### 2.4 Radius system (concentric)

Rule (better-ui/surfaces.md): **outer radius = inner radius + padding** whenever nested surfaces share an even inset of 24px or less. Above 24px, choose each radius independently.

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--radius-xs` | 4px | `rounded-xs` (new) | kbd, checkbox, tick marks |
| `--radius-sm` | 6px | `rounded-sm` (**changes from 8px**) | Menu items, segment items, nav pill, rectangular chips |
| `--radius-md` | 8px | `rounded-md` | Buttons, inputs, selects, icon buttons |
| `--radius-lg` | 10px | `rounded-lg` | Containers with `p-1` holding 6px items (6+4): dropdown, select, segmented control, tabs list |
| `--radius-xl` | 12px | `rounded-xl`, `rounded-card` | Cards, popovers, kanban column wells, toasts |
| `--radius-2xl` | 16px | `rounded-2xl` | Dialogs, Chitragupta panel, ⌘K palette (input inset 8px + 8px radius = 16) |
| `--radius-3xl` | 20px | `rounded-3xl` (new) | Hero/feature cards holding 12px inner cards at 8px inset (12+8) |
| full | 9999px | `rounded-full` | Avatars, pills, count badges, FABs |

Worked examples:
- Segmented control: `rounded-lg p-1` → items `rounded-sm`.
- ⌘K: `rounded-2xl`, input row `m-2 rounded-md`.
- Kanban column well: `rounded-xl p-1.5` → cards `rounded-md` (8 ≈ 12 − 4; use `p-1` for exact math).
- Sheet: the right panel keeps `rounded-l-2xl`.

### 2.5 Surfaces, shadows and borders

better-ui: **shadows for elevation, borders for structure.** Cards, buttons with outlines, and floating layers get a layered transparent shadow. Dividers, table cells, focus and selected states, and **input outlines** stay as borders. Values are written in HSL with pure black or white, which equals the skill's `oklch(0 0 0 / a)`, so the notation stays consistent (better-colors):

```css
:root {
  --shadow-border:
    0 0 0 1px hsl(0 0% 0% / 0.06),
    0 1px 2px -1px hsl(0 0% 0% / 0.06),
    0 2px 4px 0 hsl(0 0% 0% / 0.04);
  --shadow-border-hover:
    0 0 0 1px hsl(0 0% 0% / 0.08),
    0 1px 2px -1px hsl(0 0% 0% / 0.08),
    0 2px 4px 0 hsl(0 0% 0% / 0.06);
  --shadow-popover: 0 0 0 1px hsl(0 0% 0% / 0.06), 0 8px 24px -6px hsl(0 0% 0% / 0.12), 0 2px 6px -2px hsl(0 0% 0% / 0.06);
  --shadow-overlay: 0 0 0 1px hsl(0 0% 0% / 0.06), 0 24px 48px -12px hsl(0 0% 0% / 0.18);
}
.dark {
  --shadow-border: 0 0 0 1px hsl(0 0% 100% / 0.08);
  --shadow-border-hover: 0 0 0 1px hsl(0 0% 100% / 0.13);
  --shadow-popover: 0 0 0 1px hsl(0 0% 100% / 0.10), 0 8px 24px -6px hsl(0 0% 0% / 0.5);
  --shadow-overlay: 0 0 0 1px hsl(0 0% 100% / 0.10), 0 24px 48px -12px hsl(0 0% 0% / 0.6);
}
```

- Card hover (only when the whole card is clickable): `transition-property: box-shadow; 150ms; ease-out` → `--shadow-border-hover`. **Retire** `.card-elevated`'s `translateY(-2px)`.
- Images and avatars: `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10`. Always pure black or white, never slate, zinc or a brand tint.
- Scrims: dialog `bg-black/40` (down from `/80`), sheet `bg-black/30`.

### 2.6 Color tokens (HSL triplets; brand remains runtime)

**Neutrals.** These move the canvas from blue-grey to opsloop-neutral. **[APPROVAL]** because it changes the visual feel.

| Role | Light | Dark | Note |
|---|---|---|---|
| `--background` (canvas) | `0 0% 97%` | `0 0% 7%` | opsloop `#f8f8f8` |
| `--card` / `--popover` | `0 0% 100%` | `0 0% 11%` | Dark card vs dark bg is 1.10:1, so dark surfaces rely on `--shadow-border` rings |
| `--surface-subtle` (new) | `0 0% 98%` | `0 0% 14%` | Icon-button fill, table header, column wells |
| `--muted` | `180 5% 96%` | `0 0% 15%` | Chips, segment track |
| `--foreground` | `0 0% 13%` | `0 0% 95%` | |
| `--muted-foreground` | `0 0% 40%` (5.74:1) | `0 0% 64%` (6.77:1 on card) | Secondary text |
| `--subtle-foreground` (new) | `0 0% 55%` | `0 0% 50%` | **Placeholders and decorative meta only**; measure before using for real text |
| `--border` | `0 0% 92%` | `0 0% 18%` | Dividers only |
| `--input` | `0 0% 86%` + `bg-surface-subtle` fill | `0 0% 22%` | Fill plus border together give inputs a visible boundary |
| `--track` (new) | `0 0% 91%` | `0 0% 20%` | Empty progress ticks, chart track |
| `--accent` | **`0 0% 95%`** | **`0 0% 16%`** | **Fix:** neutral hover/highlight surface in both themes (menus, ghost buttons, cmdk selection) |
| `--accent-foreground` | `0 0% 13%` | `0 0% 95%` | |
| `--ink-strong` (new, optional) | `0 0% 15%` | `0 0% 98%` | Keeps SparxIT charcoal available for dark CTAs without overloading `accent` |

**Brand.** Driven at runtime by `brandTheme.ts`.
- `--primary`: the tenant hex (default `2 65% 55%`). Used for rings, links on large text, chart series 1, selected indicators and brand accents.
- **`--primary-solid` (new, derived):** the brand darkened in 1% lightness steps until white text reaches **4.5:1** (default brand → `2 65% 53%`). Used for filled buttons and badges. Compute it in `applyBrandTheme()` next to the existing `getPrimaryForegroundHsl()`, and unit-test it in `src/test/brandTheme.test.ts`.
- `--primary-text` (new, derived): the brand darkened until it reaches ≥4.5:1 on `--card` (default ≈ `2 65% 45%`, 5.86:1), for small coral text. The dark theme gets the lightened equivalent (`2 70% 62%` = 5.25:1).

**Status.**
- Keep `--success`, `--warning`, `--info` and the chip pastels (all pass).
- **Separate `--destructive` from brand:** today coral (2°) and destructive (0°) are the same hue. Move destructive to `354 72% 44%` (crimson) and always pair it with an icon or label (better-colors: "status hue that collides with the accent hue → move it").

**Chitragupta** (new; replaces about 40 raw `violet`/`orange`/`emerald` classes):

| Token | Light | Dark |
|---|---|---|
| `--chitra` (nudge, violet) | `262 83% 58%` (text 5.70:1) | `262 80% 72%` |
| `--chitra-bg` | `262 83% 97%` | `262 40% 16%` |
| `--chitra-warning` | `21 90% 40%` (≈orange-700, text 5.18:1) | `27 95% 65%` |
| `--chitra-warning-bg` | `33 100% 96%` | `21 40% 15%` |
| `--chitra-praise` | `163 94% 24%` (≈emerald-700, text 5.48:1) | `158 64% 60%` |
| `--chitra-praise-bg` | `152 76% 96%` | `163 40% 14%` |

**Chart palette.** One color per series; the highlight is brand coral.
- `--chart-1` = `var(--primary)` (runtime)
- `--chart-2` = `244 95% 77%` (opsloop purple `#958dfc`)
- `--chart-3` = `152 43% 58%` (green `#66c398`)
- `--chart-4` = `38 92% 55%` (amber; avoids opsloop orange, which sits too close to coral)
- `--chart-5` = `220 9% 46%` (slate)
- `--chart-muted` = `var(--track)`

Stage colors in kanban keep their existing hash but map onto `--chart-2…5` plus neutrals so they never collide with brand.

### 2.7 Motion tokens

Every value is quoted from the skills; where they disagree, the choice is noted.

| Token | Value | Source | Use |
|---|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Emil "strong ease-out" (opsloop uses it) | Enter/exit, dropdowns, popovers, hovers that move |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Emil (opsloop charts) | On-screen movement: chart bars, segment indicator, reorder |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Emil (Ionic/Vaul) | Sheet and Vaul drawer slide |
| `--ease-icon` | `cubic-bezier(0.2, 0, 0, 1)` | better-ui icon cross-fade | Icon swaps (copy→check, mic→stop) |
| `--dur-instant` | 100ms | better-ui "≤150ms" | Row hover background |
| `--dur-fast` | 150ms | better-ui / opsloop | Color, opacity, shadow, press scale, exits |
| `--dur-tooltip` | 125ms | Emil | Tooltip in; 0ms for subsequent tooltips |
| `--dur-base` | 200ms | Emil (dropdowns 150–250) | Dropdown, select, popover enter |
| `--dur-slow` | 300ms | Emil "UI under 300ms", better-ui enter | Dialog enter, sheet enter, staged page entrance items |
| `--dur-chart` | 600ms | opsloop | Chart data transitions (infrequent) |
| `--press-scale` | `0.96` | **better-ui (exact).** Emil allows 0.95–0.98 and uses 0.97; better-ui mandates 0.96, which sits inside Emil's range. | `active:scale-[0.96]` on pressables, with a `static` prop to opt out |
| Icon swap | scale `0.25→1`, opacity `0→1`, blur `4px→0` | better-ui (exact) | CSS: keep both icons in the DOM and cross-fade with `--ease-icon` |
| Stagger | 100ms between semantic chunks (better-ui); 30–80ms between list items (Emil) | both | Dashboard first load only: header → KPI row → charts. Never on hover or tab switch. |
| Enter recipe | opacity 0 + `translateY(12px)` + `blur(4px)` → rest, 300ms, `--ease-out` | better-ui enter-exit | Page-level entrances (rare) |
| Exit recipe | opacity 0 + `translateY(-12px)` (or 4–8px for popovers), **150ms** `ease-out` | better-ui "exits softer, shorter" | Toasts, menus, dismissed cards |
| Popovers | `transform-origin: var(--radix-*-content-transform-origin)`; start at `scale(0.96)` + opacity 0, never `scale(0)` | Emil | Dropdown, popover, select, tooltip. **Modals stay centered.** |

**Decision matrix (Emil):**
- 100+ times a day, meaning the ⌘K toggle, keyboard shortcuts and board/list switch: **no animation**.
- Tens of times a day, meaning row hover, tabs and menu items: **≤150ms color/opacity only**.
- Occasional, meaning dialogs, drawers and toasts: standard recipes.
- Rare, meaning first dashboard load, empty states, "hired" success and onboarding: delight is allowed.

**Implementation:** CSS transitions and `tailwindcss-animate` only, so **no `motion` dependency**. better-ui has a recipe that doesn't need one, and Emil notes CSS stays smooth under main-thread load. Transitions are interruptible; keyframes are reserved for one-shot sequences and loaders. Name the exact properties (`transition-[background-color,box-shadow,transform]`) and never use `transition-all`. `will-change` is added only after first-frame stutter is seen. Hover motion is gated behind `@media (hover:hover) and (pointer:fine)`.

**Theme switch:** use `next-themes` `disableTransitionOnChange` (it ships better-ui's inject-reflow-remove recipe).

### 2.8 Data-viz style

- **SegmentedProgress (ticks):**
  - 40 ticks of 2px with a 4px gap and 24px height (compact variant: 24 ticks, 16px).
  - Filled color comes from the series; empty ticks use `--track`.
  - Filled count = `round(value/total*ticks)`, always shown with a text value (`24/125`) so meaning never depends on color.
  - Rendered as a single `<div role="img" aria-label="24 of 125">`, not as 40 focusable nodes.
- **Bar chart (monthly):**
  - Bars `radius={[4,4,0,0]}`, max width 28px.
  - The current (or hovered) month uses `--chart-1`; the others use `--chart-muted`.
  - No vertical grid and at most 3 faint horizontal grid lines (`--border`).
  - Axis ticks in `text-caption`, `--muted-foreground`.
  - Tooltip is a popover-styled card (`--shadow-popover`, 10px radius) with a tabular value.
- **Distribution:** a single stacked horizontal bar of 12px, rounded full, with 2px gaps between segments, plus a legend as a radio group (`role="radiogroup"`) that filters the list below, the same pattern as opsloop.
- **Lists with progress:** avatar (with image outline), name, presence dot plus **text** ("Active now"), and a right-aligned `done/total` with a mini SegmentedProgress.
- **Animation:** recharts only offers named easings. Use `animationEasing="ease-out"` with `animationDuration={600}` when data changes, and `isAnimationActive={!reducedMotion}`. No animation on first mount when data is cached.
- **A11y:** every chart gets a visually hidden table or a `aria-label` summary, and bars can be focused when they are interactive (drill-down).

---

## 3. Design-system changes

### 3.1 Token and Tailwind updates

`src/index.css`:
- Add every token from §2.4–2.7 (surfaces, shadows, chitra, chart, track, motion, radius steps).
- Replace the Google Fonts `@import` with `@font-face` for self-hosted Inter Variable woff2 (see §6).
- Remove the global `h1–h6 { font-family: Plus Jakarta Sans }` rule.
- Add a global reduced-motion block (§3.5).
- Retire `.card-elevated` and `.btn-gradient` once no file uses them (Phase 14). Until then, alias them to the new recipes so nothing breaks.
- Change `.chip` to `text-caption` (12px).

`tailwind.config.ts`:
- `colors`: `surface-subtle`, `track`, `primary.solid`, `primary.text`, `chitra.{DEFAULT,bg,warning,warning-bg,praise,praise-bg}`, `chart.{1..5,muted}`, `ink-strong`, `subtle-foreground`.
- `borderRadius`: `xs 4`, `sm 6`, `md 8`, `lg 10`, `xl 12`, `2xl 16`, `3xl 20`, plus `card`/`control` aliases.
- `boxShadow`: `border`, `border-hover`, `popover`, `overlay`. Keep `elev-1`/`elev-2` as aliases until the sweep.
- `transitionTimingFunction`: `out`, `in-out`, `drawer`, `icon` (so `ease-out` maps to the strong curve).
- `transitionDuration`: `instant 100`, `fast 150`, `base 200`, `slow 300`.
- `fontSize`: the semantic scale from §2.2, with line-height and tracking tuples.
- `fontFamily`: `sans: ['Inter Variable', 'Inter', system-ui, …]`; remove `display` or alias it to `sans`.

`src/lib/brandTheme.ts`: derive `--primary-solid` and `--primary-text` (plus dark variants) and inject them next to `--primary`. Add unit tests to `src/test/brandTheme.test.ts` for the default brand, a light yellow tenant brand, and a very dark brand.

### 3.2 shadcn component restyles (`src/components/ui/*`)

| Component | Change |
|---|---|
| `button.tsx` | Base: `rounded-md`, `transition-[background-color,color,box-shadow,transform] duration-fast ease-out`, `active:not-disabled:scale-[0.96]` unless `static`. Add a `static?: boolean` prop (better-ui pattern). `default` → `bg-primary-solid text-primary-foreground hover:bg-primary-solid/90`. `outline` → `bg-card shadow-border hover:shadow-border-hover` (no border). `ghost` → `hover:bg-accent` (now neutral). `secondary` → `bg-surface-subtle`. New `icon-sm` size (32px visual, 40px hit area via `before:` pseudo). Optical padding for trailing icons: `pe-3.5` when there is an icon on the end (icon side = text side − 2px). Focus ring: `focus-visible:ring-2 ring-ring ring-offset-2`. |
| `card.tsx` | `rounded-xl bg-card shadow-border` with no border. `CardTitle` → `text-title text-balance` (was `text-2xl font-semibold`). `CardHeader`/`CardContent` padding stays `p-5`, with `p-6` available via class. This makes the 18 `surface-card border-0` overrides redundant; remove them in the sweep. |
| `badge.tsx` | `rounded-full text-caption font-medium`, `focus-visible:` instead of `focus:`. Add variants `success`/`warning`/`danger`/`neutral` backed by the chip tokens; `default` uses `primary-solid`. Add `whitespace-nowrap`. |
| `input.tsx`, `textarea.tsx`, `select.tsx` | `rounded-md bg-surface-subtle border border-input`, focus `ring-2 ring-ring/30 border-ring`, and `text-base md:text-sm` on **select** too (fixes iOS zoom). Invalid: `aria-invalid:border-destructive`. |
| `dialog.tsx` | Overlay `bg-black/40`, content `rounded-2xl shadow-overlay border-0`. Enter: fade plus `zoom-in-[0.96]` at 200ms `ease-out`, origin center. Exit: 150ms. Add a `data-instant` / `noAnimation` prop for the ⌘K palette. |
| `sheet.tsx` | Overlay `bg-black/30`. Open **300ms**, close **200ms**, both with `ease-drawer` (currently 500/300 ease-in-out, which breaks Emil's "UI under 300ms" and "exit faster than enter"). Right panel `rounded-l-2xl shadow-overlay`. |
| `drawer.tsx` (Vaul) | Overlay `bg-black/40`, handle 36×4 rounded-full `bg-track`, top radius `rounded-t-2xl`. Vaul already uses the drawer curve. |
| `popover.tsx`, `hover-card.tsx` | `rounded-xl shadow-popover border-0`, origin-aware (`origin-[--radix-popover-content-transform-origin]`), enter `scale 0.96→1` + fade over 200ms. |
| `tooltip.tsx` | `rounded-md bg-foreground text-background text-caption px-2 py-1` (inverted, like opsloop kbd hints). 125ms enter, origin-aware. Set `TooltipProvider delayDuration={400} skipDelayDuration={300}` so neighbouring tooltips open instantly (Emil). |
| `dropdown-menu.tsx`, `context-menu.tsx`, `select.tsx` content | Container `rounded-lg p-1 shadow-popover border-0`; items `rounded-sm px-2 py-1.5 text-body`, highlight `bg-accent` (neutral). Separators use `--border`. Enter 200ms `ease-out` from the trigger origin; exit 150ms. |
| `command.tsx` | Input row `h-12 text-body-lg` with no bottom border (divider only if results show). Items `rounded-sm` with a neutral `aria-selected:bg-accent`. Group headings `text-caption uppercase tracking-[0.04em] text-muted-foreground`. |
| `tabs.tsx` | Two variants. `segmented` (default) = `rounded-lg p-1 bg-muted` with `rounded-sm` triggers and an active `bg-card shadow-border`. `underline` (drawer, settings sub-tabs) = 2px `bg-primary` indicator. Switching is instant (high frequency); the indicator only animates `translate` 200ms `ease-in-out` if we build a sliding indicator later. |
| `toggle-group.tsx`, `toggle.tsx` | Same look as `segmented` tabs. The active state is neutral (`bg-card shadow-border`), **not coral**. |
| `table.tsx` | Header `bg-surface-subtle text-label text-muted-foreground`, rows `h-11` with `hover:bg-accent/60` over 100ms, `tabular-nums` on numeric cells, and the sticky header keeps the divider border. |
| `skeleton.tsx` | `rounded-md bg-muted`. The pulse is replaced by a static tint under reduced motion. |
| `sonner.tsx` | Wrap the app in a `ThemeProvider` so `useTheme()` works. Toasts `rounded-xl shadow-popover`; error toasts and toasts with actions **persist until dismissed** (better-accessibility). |
| `avatar.tsx` | Image outline `outline-black/10 dark:outline-white/10`. The fallback uses neutral `bg-muted`, not coral (coral fallbacks everywhere compete with the primary CTA). |
| `sidebar.tsx` | Active item = `bg-card shadow-border text-foreground font-medium rounded-md` (the opsloop pill), inactive = `text-muted-foreground hover:bg-accent`. Group labels in `text-caption uppercase`. |
| `switch.tsx`, `checkbox.tsx`, `radio-group.tsx` | Checked uses `bg-primary-solid`; transition `background-color, transform` 150ms. The thumb moves with `ease-out`. |

### 3.3 New primitives (minimal; each has a Phase 3+ consumer)

| Primitive | File | API sketch | Replaces / used by |
|---|---|---|---|
| `StatCard` | `src/components/ui/stat-card.tsx` | `{ label, value, total?, hint?, series?: 1..5, href?, menu?, trend? }`. Renders the label (`text-title` 18/500), the value (`text-kpi` tabular), a hint row (`Of 125 total` · `24/125`) and a `SegmentedProgress`. When `href` is set the whole card is a link with an overlay `<a className="absolute inset-0 rounded-card">` and a descriptive `aria-label`, like opsloop. | Replaces `MetricCard.tsx` (delete it after migration; the only consumer is `Index.tsx`) |
| `SegmentedProgress` | `src/components/ui/segmented-progress.tsx` | `{ value, total, ticks=40, series, size='md'|'sm', label }` | StatCard, recruiter insights list, Hiring health |
| `SectionCard` | `src/components/ui/section-card.tsx` | `{ title, description?, actions?, children, padding='5'|'6' }`: a header row (title plus description on the left, actions such as a period select or an expand icon button on the right) and a body. Wraps `Card`. | All 12 dashboard widgets, Reports sections, Settings panels |
| `useReducedMotion` | `src/hooks/useReducedMotion.ts` | A live `matchMedia('(prefers-reduced-motion: reduce)')` subscription | libraries.dev wrappers (beam, metal and img do **not** handle reduced motion themselves), chart animation |
| `AiThinking` (Phase 13) | `src/components/ai/AiThinking.tsx` | `{ active, label, state, beamTarget? }`. Shows **nothing for the first 2s**, then `ThinkingOrb size={20}` plus the label in a `role="status"` live region. Lazy-loads `thinking-orbs`. | Replaces `Loader2` on AI waits only |

No `ChartCard`, because `SectionCard` covers it (three similar lines beat a premature abstraction). No `KpiGrid` either; plain Tailwind grids are enough.

### 3.4 libraries.dev effects: where each one fits

The author's decision rules are applied first:
- Waits **under 2s get nothing**.
- Waits of **2s or more** get a Thinking orb beside a text label.
- Waits **over 3s** also get a Border beam on the element doing the work.
- One effect per UI area, and never two effects on neighbouring elements.
- When two fit, prefer the cheaper one: orbs and beam are light; voice, avatars and gooey are moderate; metal and image are WebGL.

| # | Spot (file:line) | Wait / context | Library and options | Priority |
|---|---|---|---|---|
| 1 | Resume parse: `pages/Candidates.tsx:2214` ("Parsing … resume…"), `candidates/BulkResumeUploadDialog.tsx:395` ("AI Parsing…") | Long (Gemini parse, >3s) | **Thinking orb** `state="working"` `size={20}` beside the label, plus **Border beam** `size="md"` `active={parsing && !reduced}` `colorVariant="sunset"` (closest free palette to coral) `theme` from the app theme, on the upload dropzone card | High |
| 2 | Job-match analysis: `pages/Candidates.tsx:1706, 2083` | 2–10s | Orb `state="solving"` 20px inline. No beam (the target is a table row, and beams in lists are discouraged). | High |
| 3 | AI summary: `candidates/CandidateDetailDrawer.tsx:~1597` | >3s | Orb `state="composing"` 20px in the button label, plus beam `md` on the summary section card | High |
| 4 | Interview kit generation: `pipeline/InterviewKitPanel.tsx:86–106` | >3s | Orb `state="weaving"` (planning) plus beam `md` on the kit panel | Medium |
| 5 | Assessment generation: `assessments/GenerateAssessmentDialog.tsx:150` | >3s | Orb `state="composing"` plus beam `md` on the dialog body (not the dialog shell, which is already elevated) | Medium |
| 6 | ⌘K smart search: `GlobalSearchCommand.tsx:236–240` ("Understanding your search…") | Usually 1–3s | Orb `state="searching"` 20px replaces `Loader2`, shown only after 2s. Beam `size="line"` on the input row **only if measured p95 is over 3s**. | High |
| 7 | ⌘K mic: `GlobalSearchCommand.tsx:148–176`, `hooks/useSpeechRecognition.ts` | Voice | **Voice** `VoiceBeam` around the input row, `processing={isParsingIntent}` after speech ends. **Caveat:** Web Speech `SpeechRecognition` does not expose a `MediaStream`. Either open a parallel `useMicrophone()` from `voice-glow` (a second `getUserMedia`, same permission prompt in Chromium; test Safari) or pass a `level` getter from an `AnalyserNode`. Keep the text "Listening…" row and `aria-pressed`; drop `animate-pulse`. | Medium |
| 8 | Chitragupta reply pending: `ChitraWidget.tsx:~459` | 2s+ (LLM) | Orb `state="composing"` 20px in the pending bubble, labelled "Chitragupta is thinking…" | High |
| 9 | Chitragupta identity: `ChitraWidget.tsx:49–58` (`ChitraAvatar`), panel header ~392 | Agent avatar | **Option A (recommended):** keep the custom eye mark as the brand identity and use the orb for work states (#8). **Option B:** `BotAvatar type="mech"` (or `"ghost"`), `state={pending ? 'working' : 'default'}`, `size={32}` in the panel header only, with `paused` when Chitragupta is disabled. Never use both in the same header. **Decision needed (Q5).** | Optional |
| 10 | Bottom-right FAB stack: `PipelineRadar.tsx:344` + Chitragupta FAB `ChitraWidget.tsx:509` | Two separate FABs stacked | **Gooey** `Liquid` `effect` morph speed-dial: one FAB that splits into Radar / Chitragupta / Add candidate. Moderate cost (SVG filter). Only on `/hiring`. Items get `aria-expanded`, `tabIndex={open?0:-1}`, and reduced motion snaps. | Optional (Phase 15) |
| 11 | Metal | Selling CTAs / "New" badges | The staff ATS has no selling CTA. The candidate spot is a single **`MetalBadge` "New"** in `AnnouncementBar.tsx` release notes, or a careers hero `MetalText`. WebGL2, reads best on dark, and doesn't honour reduced motion (pass `paused` and `disableGlow`). **Default: skip.** | Skip / optional |
| 12 | Image (`img-fx`) | Photo and resume previews | **Not recommended.** The author says: "ordinary photo lazy-loading… a blur-up or plain skeleton is cheaper." It also needs the `three` peer (~20MB unpacked). Use skeleton plus image outline for candidate photos and resume thumbnails instead. | Skip |
| — | Border beam `pulse-inner` on "Add Candidate" | Static emphasis | **Skip.** The author says: "Static emphasis that never changes state. A plain border or shadow says the same thing." | Skip |

Integration rules (from the library references):
- Import each effect through a **lazy wrapper** in `src/components/fx/` (for example `const ThinkingOrb = lazy(() => import('thinking-orbs').then(m => ({ default: m.ThinkingOrb })))`) so none of it reaches the main bundle.
- Pass an explicit `theme` from `next-themes` `resolvedTheme` instead of `"auto"`. Orbs read the `.dark` class correctly, but beam, metal and voice default to dark and would look wrong on light pages.
- Size with the `size` prop, never with CSS. Orbs are tuned for 64/20, so stay within a few px. Avatars overscan 1.5×, so don't clip their parent.
- Decorative layers are `pointer-events:none` / `aria-hidden`. State lives on the real control (`aria-busy`, a visible label, a `role="status"` region).
- Reduced motion:
  - Orbs, avatars and voice already handle it.
  - Beam **rotate** types do not, so use `active={loading && !reduced}`. Pulse types hide themselves.
  - Metal and img need `paused` (img only while waiting, otherwise the image never reveals).

### 3.5 Motion and accessibility policy

1. **Opt-in motion.** Global base in `index.css`:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-property: opacity, color, background-color, border-color, box-shadow !important;
       scroll-behavior: auto !important;
     }
   }
   ```
   This keeps opacity and color feedback and removes movement (Emil and better-accessibility: "fewer and gentler, not zero"). Keyframe loaders that carry meaning, such as the Chitra eye, radar and orbs, render a still frame.
2. Every animated state change also has a **static cue** (color, icon or label). Motion is never the only feedback.
3. **No animation** on keyboard-initiated actions: the ⌘K open/close, shortcuts, and the board/list toggle.
4. Hover transforms are gated behind `@media (hover:hover) and (pointer:fine)` (Tailwind `[@media(hover:hover)]:hover:`).
5. **Focus:** `:focus-visible` only, with a 2px ring of `--ring` plus a 2px offset, checked against card, canvas and primary surfaces. Keep system colors in forced-colors mode (`forced-colors:outline`).
6. **Hit areas:** 24×24 minimum (WCAG 2.5.8), aiming for 40×40 on desktop and 44×44 on touch. Icon buttons under 40px extend with `before:absolute before:-inset-1`, and extended areas never overlap.
7. **Dialogs:** Radix already traps focus, restores it to the trigger and makes the background inert. Add `overscroll-contain` on scroll panes.
8. **Live regions:** AI waits use `role="status"`. Toasts are polite; only errors use `role="alert"`.
9. **Zoom:** layouts must work at 200% and reflow at 320px. Text containers use `min-h`, never a fixed `h`, except the StatCard, which switches to auto height at `sm` and below.
10. **A skip link** is the first focusable element in `AppShell`, and `<main id="main">` appears once per page (opsloop has one; we don't).

---

## 4. Page-by-page redesign specs (priority order)

### P1. Dashboard (`src/pages/Index.tsx`, `components/dashboard/*`)

The layout mirrors opsloop, mapped onto ATS data. **No new queries**: everything comes from `useDashboardMetrics` and the existing widget hooks. Anything that would need new data is marked *(data?)*.

```
┌ PageHeader: "Dashboard" (title-lg) · subtitle ─────────────── [This week | This month] ┐
├ StatCard ─────────┬ StatCard ─────────┬ StatCard ─────────┬ StatCard ─────────────────┤
│ Active candidates │ Interviews sched. │ Offers / Hires    │ Open positions filled     │
│ 124 · of 1,902    │ 18 · this week    │ 6 · of 11 target* │ 64% · 9 of 14             │
│ ||||||||·········· │ ||||··············│ ||||||············│ |||||||||·········        │
├ SectionCard "Hiring overview" (lg:col-span-2) ────────┬ SectionCard "Pipeline distribution" ┤
│ Applications per month, last 12 months                │ Candidates by stage (segmented bar  │
│ Bar chart; current month = chart-1, rest muted        │ + radio legend filters the list)    │
├ SectionCard "Recruiter performance" ──┬ SectionCard "Upcoming interviews" ┬ "Recruiter of the month" ┤
│ avatar · name · presence · 30/35 ▮▮▮  │ (existing widget, restyled)       │ from leaderboard #1      │
├ SectionCard "Action items" (Do list, existing) ──────────┬ "Jobs overview" (existing) ────────────┤
```

- **KPI mapping** (all from existing `metrics`):
  - Talent pool → total with `newThisPeriod` as the hint.
  - Active candidates → `activeCandidates` / `totalCandidates` ticks.
  - Open jobs → `openJobs`, hint `openPositions positions`, ticks = filled/openPositions *(data?)*.
  - Hires this period → `hiresThisPeriod`. A target line needs a configured target *(data?, otherwise hide the ticks and show the trend chip)*.
  - Series colors: chart-1 (coral) is used only on the hires KPI; the other three use chart-2/3/4, so coral keeps its meaning.
- **Hiring overview** = `SourcingTrend.tsx` converted from a line chart to a monthly bar chart (12 months). "Expand chart" is an icon button that opens a dialog with the full chart.
- **Pipeline distribution** = `InterviewStageFunnel.tsx` restyled as a segmented bar plus a legend radio group.
- **Recruiter performance** = `RecruiterLeaderboard.tsx` as an opsloop-style insights list. Presence ("Active now") would need last-seen data *(data?)*; without it, show "Last hire 2d ago" from existing data.
- **Recruiter of the month:** a new small card from leaderboard rank #1 (avatar with outline, name, role, hires, interviews, time-to-hire). *Product decision (Q9).*
- **Interviewer layout** keeps the two-column Upcoming + Stage funnel with the same skins.
- **First-load entrance:** stagger at 100ms (header → KPI row → first chart row), 300ms each, with the §2.7 enter recipe, **once per session** (sessionStorage flag). Never on period toggle; the period toggle only animates chart data.
- Mobile: KPI cards in 2 columns with a compact `SegmentedProgress sm`. The sticky period toggle stays but becomes a segmented control.

### P2. /hiring board and list (`Hiring.tsx`, `HiringJobPicker.tsx`, `pipeline/*`, `Pipeline.tsx`, `Candidates.tsx`)

- **Header row:** `PageHeader "Hiring"` on the left. On the right, a neutral segmented control "Board | List" (natural-case labels, icons 16px with 1.5 stroke next to 400-weight text), the **Health chip**, and the job picker as a combobox button with `shadow-border`. The page's only filled action is "Add candidate" in the top bar.
- **Do strip** (`PipelineActionQueue.tsx`): a horizontal row of compact `rounded-xl shadow-border` action cards (icon, count, verb), scrollable with a 16–32px peek of the next card (better-layout: hint at hidden content) and snap-x. Counts are tabular. A done state shows a check icon cross-fade (`--ease-icon`).
- **Health chip** (`PipelineHealthChip.tsx`): pill with a status dot plus **text** (Healthy / At risk / Stalled) plus a tiny `SegmentedProgress sm` (24 ticks). Clicking it opens `PipelineHealthPanel` as a popover, origin-aware.
- **Kanban column** (`Pipeline.tsx`, `DroppableColumn` classes only):
  - Well: `bg-surface-subtle rounded-xl p-1`, 320px width unchanged.
  - Header: stage dot (chart palette), `text-label`, count pill, and an overflow icon button with a 40px hit area.
  - The drop highlight keeps the existing `ring-primary/25`.
- **Kanban card** (`PipelineKanbanCards.tsx`):
  - `rounded-md bg-card shadow-border`, hover `shadow-border-hover` over 150ms.
  - While dragging: `shadow-popover` plus `scale(1.02)` (the drag lift is the one allowed scale up), and the source slot at opacity 0.4, as today.
  - Chips move to the `Badge` status variants (tokens instead of raw `slate`/`violet`/`blue`).
  - Avatars get the image outline.
  - The fit score uses the unified `ScoreRing` at 20px.
- **Radar FAB** (`PipelineRadar.tsx`): keep the `motion-safe` rings. Change `transition-all` to `transition-[transform,box-shadow]`, press 0.96, and `shadow-overlay`. It is optionally merged with the Chitra FAB via Gooey (Phase 15).
- **List view** (`Candidates.tsx` table section only): the new `table.tsx` skin, a sticky header, row hover at 100ms, the selected row as `bg-accent` plus a 2px `primary` inset on the leading edge, tabular score column, and AI states per §3.4 #1–2.

### P3. Candidate drawer (`CandidateDetailDrawer.tsx`, read only the relevant offsets)

- Sheet width is unchanged (the stacking offsets in `sheetClassName` are preserved); `rounded-l-2xl`, scrim `/30`, 300/200ms drawer curve.
- **Header:** avatar 48px with outline, name `text-title`, role and current stage as a badge, and icon actions (email, schedule, more), each with a 40px hit area and a tooltip.
- **Score strip** (lines ~1525–1530): four `ScoreRing` (shared component; delete the local `ScoreRingSmall`) in a `SectionCard` with vertical dividers, each with a label and a tabular value.
- Tabs use the `underline` variant and switch instantly.
- AI summary uses §3.4 #3.
- Sections are `SectionCard`s with 16px between them; collapsibles animate height only via Radix `--radix-collapsible-content-height` over 200ms `ease-out` (the existing accordion keyframes switch to the new curve).
- `InterviewFeedbackDialog.tsx`: `rounded-2xl`, sticky footer with a single `primary-solid` Submit (`btn-gradient` removed). Rating controls become a segmented control with a visible selected state (icon plus color).

### P4. ⌘K palette (`GlobalSearchCommand.tsx`, `ui/command.tsx`)

- **No open/close animation** (Emil: Raycast has none). Overlay `bg-black/40`, panel `rounded-2xl shadow-overlay`, width `sm:max-w-xl`, positioned 20vh from the top (not vertically centered, so it doesn't jump as results change).
- Input row: `h-12 text-body-lg`, search icon 20px with 1.5 stroke, mic button on the right (voice per §3.4 #7), and an `esc` kbd hint.
- Results: group headings as captions; items 44px tall with icon tile (32px, `rounded-md`, `bg-surface-subtle`), primary text, secondary meta, and a right-aligned `↵` kbd on the selected item. Selection = neutral `bg-accent` with **no transition** (keyboard driven).
- Smart search row: orb `searching` after 2s (§3.4 #6). The `Sparkles` icon becomes `text-chitra` via the token (currently raw `violet-500`).
- Empty state: recent searches plus suggested queries ("Frontend candidates interviewed this week") as chips.
- Header trigger (`Header.tsx`): a pill-shaped fake input, `w-64 h-9 rounded-md bg-surface-subtle shadow-border`, placeholder "Search candidates, jobs…", kbd `⌘K` in `text-caption` with `rounded-xs`.

### P5. Chitragupta widget and notification bell (`ChitraWidget.tsx`, `NotificationBell.tsx`)

- Tokenize every violet, orange and emerald class with the `chitra.*` tokens. That fixes the orange/emerald text contrast failures (§1.3) and gives dark mode for free.
- **Panel:** `w-[360px] rounded-2xl shadow-overlay`, no colored border. The header becomes a neutral `bg-card` with a hairline divider, instead of the solid violet block. Chitragupta's violet appears only in the eye mark, his message bubbles (`bg-chitra-bg`) and the send button, so violet means "Chitragupta" and nothing else.
- Open/close: 200ms `ease-out` from the FAB origin (`transform-origin: bottom right`, scale 0.96 + fade), exit 150ms. Replace `transition-all` with named properties.
- FAB: keep the blinking eye. Replace `animate-ping` with a single static unread dot (the ping is constant motion and has no reduced-motion guard). Press 0.96.
- Pending reply: orb `composing` (§3.4 #8). Optional bot avatar (§3.4 #9).
- Nudge / warning / praise cards: a leading 3px bar in the type token, the icon (Eye / AlertTriangle / Star), and a text label. The type never depends on color alone.
- **Bell:** the popover becomes `rounded-xl shadow-popover w-[380px]`; unread rows use `bg-accent/60` plus a primary dot (not a blue tint); Chitra rows use a `chitra` leading bar; `action_buttons` render as `size="sm" variant="outline"` buttons.

### P6. Reports and Analytics (`Reports.tsx`, `Analytics.tsx`, `reports/TimeVelocitySection.tsx`, `ui/chart.tsx`)

- Wrap every chart in a `SectionCard` with the title, a one-line description of what is measured, and a date-range select in the actions slot.
- `ui/chart.tsx`: a central recharts theme covering axis color, grid, tooltip card, bar radius and the `--chart-*` colors, so each page stops styling charts inline.
- Summary chips (lines ~462–1000): `Badge` status variants and the neutral `StatCard sm` instead of `bg-emerald-500/8 border-emerald-200` style chips.
- Line charts that compare periods keep the line style; monthly volume moves to bars. Pie charts become the segmented distribution bar (easier to read, accessible legend).
- Tables use the new `table.tsx` with tabular numerics and a CSV export button (existing behavior) in `variant="outline"`.

### P7. Calendar (`InterviewCalendar.tsx`, `calendar/*`)

- Month grid: hairline `--border` dividers (structural, so these stay borders); today = a `primary` 24px filled circle behind the date number; weekends on `bg-surface-subtle`.
- Event pills (`CalendarEventPill.tsx`): a 3px leading bar in the stage color plus neutral `bg-card shadow-border` and the time in tabular caption, instead of fully tinted raw-color fills.
- Week view: the current time line in `primary` with a 6px dot. Hour labels are captions.
- The view switch uses a segmented control; switching is instant.

### P8. Settings (`Settings.tsx`, only the TabsList region ~3630–3710 plus `settings/*`)

- At `lg` and above, replace the ~15 horizontally scrolling tabs with a **left section nav** (240px): grouped under captions (Organization: Business, Users, Teams, Vendors; Hiring: Scorecards, Assessments, Application questions, Red-flag rules; Data: Certifications, Colleges, Domains; System: Security, Compliance, Email, Announcements). It is the same `Tabs` component with `orientation="vertical"`, so **no routing change**.
- Below `lg`, keep a horizontal scroll with a peek cue.
- Each panel is a stack of `SectionCard`s: a label column (title plus description) on the left and controls on the right at `lg`. Save bars are sticky at the bottom of the panel with a single primary button.

### P9. Auth (`Auth.tsx`, `ResetPassword.tsx`, `components/auth/*`). Do not touch `useAuth.tsx`.

- Canvas: `bg-background` (neutral) with no gradient. The card is centered, `max-w-sm rounded-2xl shadow-border p-8`, with the logo, `text-title-lg` heading and a short description.
- Inputs use the new skin. A single full-width `primary-solid` submit keeps its original label with an inline spinner when pending (better-accessibility: keep submit enabled until the request starts).
- MFA/OTP input uses `input-otp` slots at `rounded-md` 44px. Errors use `aria-describedby`, and the first invalid field receives focus.
- An optional split layout at `lg` (form on the left, a neutral product illustration or tagline on the right) is **open question Q8**.

### P10. Careers and applicant portal (`Careers.tsx`, `Applicant*`, `components/applicant/*`, `CandidatePortal.tsx`)

- **Recommendation: the same tokens and primitives with a quieter density.** Use `text-body-lg`, 65ch measure, and generous section spacing (48–64px), and no staff chrome.
- Careers hero: `text-balance` headline at 40/1.1 (weight 600, −0.02em), a brand-colored search/filter bar, and job cards as `SectionCard`s with a location, type and posted-date meta row.
- The application form uses a single column with a sticky submit, file upload with a progress bar (determinate, so **no orb**), and a resume parse preview with the orb `working` only if parsing runs client-visible for 2s or more.
- ApplicantDashboard: status timeline with a leading-bar stage list and the same StatCard for "Applications / Interviews / Offers".
- Optional: one `MetalText` careers headline (§3.4 #11). **Default off.**
- SEO: no layout change that affects `jobPostingJsonLd`. Keep the h1 per page.

### P11. Mobile and PWA (`BottomNav.tsx`, `MoreMenuSheet.tsx`, `Header.tsx`, `PullToRefresh.tsx`)

- Bottom nav: the active tab gets a 32×24 pill (`bg-accent`) behind the icon, with the label at `text-caption font-medium`. There is no color-only cue, and the stroke stays 1.5 (the `stroke-[2.5]` swap goes away).
- More sheet: Vaul drawer with `rounded-t-2xl`, 44px rows and grouped captions.
- Header on mobile: logo, search icon button, bell and avatar; the "Add candidate" CTA moves into the Do strip or FAB on `/hiring` (so one filled action per view).
- All inputs and selects at `text-base` below `md`. Safe areas are already handled. The press scale applies to tab items.
- Test on a real iPhone (Emil: gestures and drawers need real devices): pull-to-refresh, sheet drag-to-dismiss, bottom-nav safe area.

---

## 5. Phased rollout

**Every phase runs the same checks** (per CLAUDE.md and AGENTS.md), in order:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run build` (compare the chunk sizes printed in the output against the previous phase)
4. `npm test`
5. A browser pass at 1440, 768 and 390px, in light mode (and dark once Phase 1e lands), with `prefers-reduced-motion: reduce` emulated (DevTools → Rendering), a keyboard-only walk of the changed surfaces, and animations replayed at 10% speed in the Animations panel (better-ui).
6. Check that Settings → Business brand color still recolors the primary, focus rings and sidebar.

Effort: **S** ≤ half a day, **M** ≈ 1 day, **L** 2–3 days. **[APPROVAL]** means CLAUDE.md requires a pause, because the phase adds a dependency, touches more than 5 files, or changes visuals globally.

| Phase | Scope | Files (≤5) | Effort | Risk | Gate |
|---|---|---|---|---|---|
| **0a Tokens (additive)** | Add all new CSS vars and Tailwind keys (§3.1). **Do not change existing values** and do not remove anything, so nothing changes visually. | `src/index.css`, `tailwind.config.ts` | S | Low | none |
| **0b Primitives** | `StatCard`, `SegmentedProgress`, `SectionCard`, `useReducedMotion`. Nothing consumes them yet. | 4 new files in `src/components/ui/`, `src/hooks/` | S | Low | none |
| **1a Token values** | Switch neutrals and fix `--accent`; add `--primary-solid`/`--primary-text` derivation plus tests; separate destructive from brand; remap radius (`sm` becomes 6px); self-host Inter and drop Plus Jakarta; global reduced-motion block | `index.css`, `tailwind.config.ts`, `lib/brandTheme.ts`, `test/brandTheme.test.ts`, `public/fonts/…` (asset) | M | Med (global look) | **[APPROVAL]** |
| **1b Core controls** | button (press 0.96 + `static`), card, badge, input/textarea | `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx` | M | Med | **[APPROVAL]** global visual |
| **1c Overlays** | dialog (+ no-animation prop), sheet timings, drawer, popover, tooltip | `dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `popover.tsx`, `tooltip.tsx` | M | Med | **[APPROVAL]** |
| **1d Menus and data** | dropdown, select, command, tabs (segmented + underline), table | `dropdown-menu.tsx`, `select.tsx`, `command.tsx`, `tabs.tsx`, `table.tsx` | M | Med | **[APPROVAL]** |
| **1e Dark mode** | `ThemeProvider` (next-themes, `attribute="class"`, `disableTransitionOnChange`); System/Light/Dark switch in the profile dialog; tune the `.dark` palette | `App.tsx`, `ProfileDialog.tsx`, `index.css`, `ui/sonner.tsx` | S–M | Med (unreviewed dark surfaces) | Decision Q1 |
| **2 Shell** | Sidebar pill active state and group labels; header ⌘K pill, one filled CTA (Calendar becomes ghost), skip link and `main` landmark; bottom-nav pill; PageHeader type scale | `AppShell.tsx`, `Header.tsx`, `BottomNav.tsx`, `PageHeader.tsx`, `MoreMenuSheet.tsx` | M | Med (daily muscle memory) | none |
| **3a Dashboard KPIs** | StatCard grid, period segmented control, once-per-session stagger; delete `MetricCard.tsx` | `pages/Index.tsx`, `MetricCard.tsx` (delete) | S | Low | none |
| **3b Dashboard widgets** | Monthly bar chart, distribution bar, recruiter insights list, SectionCard wrappers | `SourcingTrend.tsx`, `InterviewStageFunnel.tsx`, `RecruiterLeaderboard.tsx`, `UpcomingInterviews.tsx`, `ActionItems.tsx` | M | Low | none |
| **3c Recruiter of the month** | New card from leaderboard data, plus a `JobsOverview` reskin | new `dashboard/RecruiterSpotlight.tsx`, `JobsOverview.tsx`, `Index.tsx` | S | Low | Decision Q9 |
| **4a Hiring header** | Segmented Board/List, Do strip, Health chip, Radar FAB, job picker | `Hiring.tsx`, `HiringJobPicker.tsx`, `PipelineActionQueue.tsx`, `PipelineHealthChip.tsx`, `PipelineRadar.tsx` | M | Med | none |
| **4b Kanban** | Column chrome (classes only), cards, chips to Badge variants, unified ScoreRing | `Pipeline.tsx` (offset reads), `PipelineKanbanCards.tsx`, `ScoreRing.tsx`, `StatusBadge.tsx`, `CandidateCard.tsx` | M | Med (DnD must be untouched) | none |
| **4c List view** | Table section of Candidates | `Candidates.tsx` (offset reads) | M | Med (large file) | none |
| **5 Drawer and feedback** | Header, score strip, underline tabs, SectionCards, feedback dialog footer | `CandidateDetailDrawer.tsx`, `InterviewFeedbackDialog.tsx`, `ScheduleInterviewDialog.tsx`, `CancelInterviewDialog.tsx` | L | Med–High (largest files) | none |
| **6 ⌘K palette** | No-animation panel, layout, result items; `thinking-orbs` via `AiThinking`; `voice-glow` on the mic | `GlobalSearchCommand.tsx`, `hooks/useSpeechRecognition.ts`, new `components/ai/AiThinking.tsx`, new `components/fx/VoiceGlow.tsx`, `package.json` | M | Med (mic permission, Safari) | **[APPROVAL]** new deps |
| **7 Chitragupta** | Tokenize the widget and bell; neutral header; orb pending; optional bot avatar | `ChitraWidget.tsx`, `NotificationBell.tsx`, (`package.json` if bot-avatars) | M | Low–Med (Chitragupta rules untouched: UI only) | **[APPROVAL]** if bot-avatars; decision Q5 |
| **8 Reports** | Chart theme, SectionCards, chips to Badge | `ui/chart.tsx`, `Reports.tsx`, `Analytics.tsx`, `reports/TimeVelocitySection.tsx` | L | Low | none |
| **9 Calendar** | Grid, event pills, today and now line | `InterviewCalendar.tsx`, `calendar/*` (4) | M | Low | none |
| **10 Settings** | Vertical section nav at lg; SectionCard panels (TabsList region only) | `Settings.tsx` (offset), `settings/*` (2) | M | Med (4k-line file) | none |
| **11 Auth** | Neutral canvas, card, inputs, single submit | `Auth.tsx`, `ResetPassword.tsx`, `auth/*` (2) | S | Med (auth UX, not auth logic) | Explicit OK (auth surface) |
| **12 Applicant / careers** | Split into 12a (Careers, JobDetail, ApplicationForm) and 12b (ApplicantLogin, ApplicantDashboard, ApplicationDetail, CandidatePortal) | ≤5 each | M + M | Med (public, SEO) | Decision Q6 |
| **13 AI waiting states** | `AiThinking` plus `border-beam` at the §3.4 #1–5 spots | 13a: `Candidates.tsx`, `BulkResumeUploadDialog.tsx`, `CandidateDetailDrawer.tsx`; 13b: `InterviewKitPanel.tsx`, `GenerateAssessmentDialog.tsx`, `package.json` | M | Low | **[APPROVAL]** new dep |
| **14 Consistency sweep** | 646 raw palette classes to tokens; 32 `transition-all` to named properties; 172 `text-[Npx]` to the scale; retire `btn-gradient` (11 files), `card-elevated`, `surface-card border-0` overrides, and `shadow-md/lg` to the shadow tokens | Batches of ≤5 files per folder (about 15 PRs) | L | Low per batch | **[APPROVAL]** (>5 files total) |
| **15 Optional expressive** | Gooey FAB speed-dial on /hiring; optional MetalBadge "New" | `PipelineRadar.tsx`, `ChitraWidget.tsx`, new `fx/FabDial.tsx`, `AnnouncementBar.tsx`, `package.json` | M | Med (perf on WebKit SVG filters) | **[APPROVAL]** + decision Q3 |

**Order and dependencies:**
- 0a → 0b → 1a → 1b–1d (in parallel, any order) → 2 → 3 → 4 → 5.
- 6, 7 and 13 depend on 0b (`useReducedMotion`) and 1a (tokens).
- 8–12 can proceed after 1d.
- 14 runs last and is interleavable.
- 1e can land any time after 1a, but it doubles the visual QA for everything after it, so land it after Phase 5 unless dark mode is a priority.

**Rollback:** every phase is CSS/className/presentational only, with no schema, RLS, edge function or query changes, so each can be reverted with a single `git revert`.

---

## 6. Dependencies

### 6.1 To add (versions and sizes from `npm view` on 2026-09-26; gzip impact to be measured from `npm run build` output)

| Package | Version | License | Unpacked | Peers | Phase | Notes |
|---|---|---|---|---|---|---|
| `thinking-orbs` | 0.3.2 | MIT | 131 KB | react ≥18 | 6/7/13 | 2D canvas, no WebGL; handles reduced motion |
| `border-beam` | 1.4.1 | MIT | 199 KB | react, react-dom ≥18 | 13 (6 optional) | CSS layers + rAF; rotate types need a manual reduced-motion guard; free palettes only colorful/mono/ocean/sunset (no custom coral) |
| `voice-glow` | 0.2.1 | MIT | 148 KB | react, react-dom ≥18 | 6 | Needs a `MediaStream` or `level` getter, so it doesn't work directly with Web Speech (§3.4 #7) |
| `bot-avatars` | 0.1.1 | MIT | 156 KB | react ≥18 | 7 (optional) | 2D canvas; the `sleeping` state is Pro-only |
| `liquid-gooey` | 0.2.2 | MIT | 746 KB | react, react-dom ≥18 | 15 (optional) | SVG filters; CPU-rasterised on WebKit |
| `metal-fx` | 2.0.11 | MIT | 303 KB | react, react-dom ≥18 | 15 (optional) | WebGL2; Button and Badge types are shown as locked on the free detail page (check what the free package allows before relying on `MetalBadge`) |
| ~~`img-fx` + `three`~~ | 0.5.1 + 0.186.1 | MIT | 207 KB + **20.4 MB** | three ≥0.149 | — | **Not recommended** |
| ~~`motion`~~ | 13.4.4 | MIT | 759 KB | — | — | **Not needed.** CSS covers every recipe (better-ui has a no-library path). |
| Inter Variable woff2 | 4.x | OFL-1.1 | ~340 KB file (latin subset ~100 KB) | — | 1a | Either copy the woff2 into `public/fonts/` (no npm dependency) or use `@fontsource-variable/inter` (OFL). Self-hosting removes the render-blocking Google Fonts `@import`. |

- Install command, to run only after approval: `npm install thinking-orbs border-beam voice-glow`, plus optionally `bot-avatars liquid-gooey metal-fx`.
- Every effect is loaded through `React.lazy` wrappers in `src/components/fx/`, so the main entry chunk should not grow. Verify this in the build output per phase.
- **Do not** run `npx skills add …` or `npx libraries-dev skill --pro` from an agent. The skill says those commands are for the user to run.

### 6.2 Licensing and pricing

- **The seven npm packages are MIT.** They are free to ship in the private repo and the public OSS export.
- **Libraries Pro** (paid plan; pricing isn't shown on the skill page) unlocks the Studio (`libraries.dev/studio`) and the Pro skill (`npx libraries-dev skill --pro`). That covers extra options: palettes and custom colors (for example a coral beam), orb sizes other than 64/20 and ink colors, the bot `sleeping` state, cursor gravity, and shader/geometry "core" customization. Pro is **not required** for anything in this plan.

### 6.3 OSS export implications (`oss-export.exclude`)

- Free MIT packages and the code that uses them are fine in the public repo.
- If Pro is bought:
  - **Studio-exported code, Pro presets or "core customization" shader and geometry code must not go into shared `src/`**, because it would ship in the-talent-app export under Pro terms that are not ours to relicense.
  - Either keep Pro-tuned values out of the codebase, or put them in a private path (e.g. `src/fx-pro/`) that is added to `oss-export.exclude`, with the OSS build falling back to free options through a guarded import. The fallback adds complexity, so the recommendation is **free options only in shared code**.
  - The Pro **skill** installs into agent skill folders. `.claude/` and `.cursor/` are already excluded; if it writes anywhere else (for example `.agents/` or `skills/`), add that path to `oss-export.exclude` **before** the next `npm run export:oss`.
- The self-hosted Inter font (OFL) may ship publicly; keep its `OFL.txt` next to the font file.
- This plan doc contains no secrets or pricing and can be public. If you would rather keep internal decision records private, add `docs/UI_REDESIGN_PLAN.md` to `oss-export.exclude` (Q10).
- The brand stays tenant-configurable, and no SparxIT hex is hard-coded in new code (v1 guardrail 6). The OSS default brand keeps working.

---

## 7. Open questions and decisions

1. **Dark mode:** ship a user toggle (System / Light / Dark) now, or keep light-only? Dark tokens exist but can't be reached today. Default recommendation: **System default + toggle, landed after Phase 5.**
2. **How expressive?** Recommended: **restrained.** Orbs and beams only on real AI waits, voice on the mic, and nothing decorative on static UI. Alternative "expressive": add the Gooey FAB dial and a Metal "New" badge.
3. **Gooey FAB speed-dial** that merges the Radar and Chitragupta FABs on /hiring: yes or no?
4. **Libraries Pro:** buy it? It's only needed for a custom coral beam, more orb sizes, or the bot sleeping state. Recommendation: **no, for now.**
5. **Chitragupta identity:** keep the custom eye mark (recommended) or adopt `BotAvatar` in the panel header? The eye is existing brand equity; a bot avatar is more playful but generic.
6. **Applicant-facing pages** (careers, applicant portal, candidate portal): same tokens with a quieter density (recommended), a distinct candidate-facing tone, or leave them untouched?
7. **Brand contrast fix:** approve `--primary-solid` (fills darkened to pass 4.5:1, so the default coral fill becomes `2 65% 53%`, a barely visible shift), or keep the exact `#D64541` fill and accept 4.33:1 on button labels?
8. **Auth layout:** a centered card only, or a split layout with a product panel at `lg`?
9. **"Recruiter of the month"** card on the dashboard: do you want this recognition element (opsloop "Employee of the month" analogue), and should interviewers see it?
10. **Plan doc visibility:** add `docs/UI_REDESIGN_PLAN.md` to `oss-export.exclude`, or allow it in the public export?
11. **Typography:** confirm dropping Plus Jakarta Sans (v1 said keep it; better-typography says two similar sans faces read as a mistake), and confirm self-hosting Inter.
12. **Neutral canvas:** move from the current blue-grey `220 14% 97%` to opsloop-neutral `0 0% 97%`?
13. **Destructive hue:** OK to shift destructive to crimson `354 72% 44%` so it reads as distinct from the coral brand?
14. **Data that doesn't exist yet:** hires target, recruiter presence/last-seen, and positions-filled ratio. Hide those UI bits, or plan backend work later (a separate feature with its own migration review)?

---

## Appendix A: Skill rules quick reference (exact values)

| Rule | Value | Skill |
|---|---|---|
| Concentric radius | outer = inner + padding; independent above 24px padding | better-ui |
| Press feedback | `scale(0.96)`, never below 0.95, `static` prop to disable | better-ui (Emil: 0.95–0.98) |
| Icon swap | scale 0.25→1, opacity 0→1, blur 4px→0; CSS curve `cubic-bezier(0.2,0,0,1)`; spring `{type:"spring", duration:0.3, bounce:0}` if a motion library exists | better-ui |
| High-frequency feedback | ≤150ms, opacity/color only | better-ui |
| Enter stagger | ~100ms per semantic chunk (80ms per word for titles); list items 30–80ms | better-ui / Emil |
| Exit | small fixed translateY (−12px), 150ms, ease-out; shorter than enter (300ms) | better-ui |
| Shadow-as-border (light) | `0 0 0 1px /.06, 0 1px 2px -1px /.06, 0 2px 4px 0 /.04`; hover `.08/.08/.06` | better-ui surfaces |
| Shadow-as-border (dark) | `0 0 0 1px white/.08`; hover `/.13` | better-ui surfaces |
| Image outline | 1px, `black/10` light, `white/10` dark, offset −1px; never tinted | better-ui |
| Icon stroke | 1.5px beside 400 text, 2px beside 600 text | better-ui |
| Easing | `--ease-out (0.23,1,0.32,1)`, `--ease-in-out (0.77,0,0.175,1)`, `--ease-drawer (0.32,0.72,0,1)`; never ease-in for UI | Emil |
| Durations | press 100–160, tooltip 125–200, dropdown 150–250, modal/drawer 200–500; UI under 300 | Emil |
| Frequency | 100+/day (⌘K) = no animation | Emil |
| Popovers | origin-aware; modals centered; never from scale(0) (start at 0.95+) | Emil |
| Tooltips | delay first, instant for subsequent | Emil |
| Blur on crossfade | `blur(2px)`, keep under 20px | Emil |
| Type floors | UI 14px, captions 13px, rarely <12px; weight ≥400 below 18px; line-height ≥1.4 for 3+ lines; inputs 16px on mobile | better-typography |
| Wrapping | `text-wrap: balance` headings, `pretty` descriptions; `tabular-nums` on changing values | better-typography |
| Grouping | gap between groups ≥ 2× gap within (8 → 16+) | better-layout |
| Hit areas | 24×24 minimum; 44 touch / 40 desktop target | better-accessibility |
| Reduced motion | opt-in motion; replace movement with opacity crossfades | better-accessibility / Emil |
| Color | one color = one meaning (within 15° hue); one filled action per view; measure contrast on the rendered pair | better-colors |
| libraries.dev waits | <2s nothing; ≥2s orb + label; >3s + beam; one effect per area; prefer the cheaper | libraries-dev |
