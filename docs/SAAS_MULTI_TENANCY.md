# SaaS Multi-Tenancy Plan — The Talent App

> **Status:** Planned — not started  
> **Audience:** Product, engineering, DevOps, super admin  
> **Last updated:** June 2026

This document is the authoritative plan for converting The Talent App (TTA) from a single-tenant deployment (SparxIT production + OSS self-host) into a **subdomain-based multi-tenant SaaS** at `*.thetalentapp.io`.

**Related docs:**

- [COMPLIANCE.md](./COMPLIANCE.md) — GDPR/DPDP, tenant vs deployer responsibilities, sub-processors
- [DEVOPS_HANDOFF.md](./DEVOPS_HANDOFF.md) — self-hosted infra, edge secrets, SES, cron
- [OSS_LAUNCH_PLAN.md](./OSS_LAUNCH_PLAN.md) — public OSS release (explicitly defers hosted SaaS)
- [DEPLOYMENT.md](./DEPLOYMENT.md) — dual-repo model (private `sparxtalent` / public `the-talent-app`)

---

## 1. Executive Summary & Scope Honesty

### What we are building

A hosted SaaS where each customer organization gets:

- Its own subdomain: `sparxit.thetalentapp.io`, `acme.thetalentapp.io`, etc.
- Isolated hiring data (candidates, jobs, assessments, interviews, config)
- Its own business branding, team, careers portal, and applicant experience
- Standard TTA roles (admin, HR, recruiter, interviewer) scoped to that org

SparxIT is **tenant #1**, not a special-cased fork. Same code path, same RLS rules, same onboarding — only the slug and branding differ.

### What this is not

- **Not a config toggle.** This is a platform rewrite touching schema, RLS, auth, routing, edge functions, email, storage, cron, and frontend data access.
- **Not OSS-breaking by default.** Self-hosters keep a `single-tenant` mode via `VITE_DEPLOYMENT_MODE=self_hosted` (see §10).
- **Not a quick win.** Realistic calendar estimate for a small team: **4–7 months** from kickoff to SparxIT cutover, assuming dedicated focus and no major scope creep.

### Success criteria

| Criterion | Definition |
|-----------|------------|
| **Isolation** | Tenant A cannot read/write Tenant B data via API, RPC, storage, or edge functions |
| **Parity** | SparxIT on `sparxit.thetalentapp.io` has feature parity with current production |
| **Onboarding** | New org can sign up, configure branding, invite staff, publish careers page |
| **OSS preserved** | `npm run export:oss` still produces a working single-tenant self-host |
| **Ops** | One frontend build, one Supabase project (phase 1), wildcard DNS |

---

## 2. Vision & Goals

### Product vision

**The Talent App SaaS** — open-source ATS you can self-host *or* run on managed infrastructure, with per-org subdomains and zero cross-tenant data leakage.

### Design principles

1. **SparxIT is not special-cased.** No `if (tenant === 'sparxit')` in business logic. Platform admin is a separate concept (`platform_admins`).
2. **Shared database, row-level isolation.** One Postgres cluster, `tenant_id` on every tenant-owned row, RLS enforced at the database — not only in the app.
3. **Subdomain = tenant context.** `acme.thetalentapp.io` resolves to tenant slug `acme` before any authenticated query runs.
4. **Applicants are tenant-scoped.** Same email may exist as applicant in multiple tenants; auth metadata and `applicant_profiles` are per-tenant.
5. **Chitragupta per tenant.** Escalations and nudges stay inside the tenant; platform ops use separate tooling.
6. **Dual-mode codebase.** SaaS and self-hosted share one repo; deployment mode selects behavior at build/runtime.

### Non-goals (v1 SaaS)

- Per-tenant custom domains (`careers.acme.com`) — defer to v2
- Per-tenant Supabase projects (database-per-tenant) — defer unless compliance forces it
- Billing / Stripe — plan hooks only; implement when pricing is decided
- Multi-region data residency — single region initially (document in compliance)

---

## 3. Current State Assessment

TTA today is a **single-tenant** app: one logical organization, one `system_config` namespace, one `PUBLIC_APP_URL`, global RLS helpers (`is_admin_or_hr`, role checks on `user_roles` without org scope).

### Architecture today

```
Browser → sparxtalent.thesparxitsolutions.com (or localhost)
       → Self-hosted Supabase (single project)
       → Postgres (no tenant_id)
       → Edge functions (service role, global config reads)
```

### Single-tenant gaps

| Area | Current state | SaaS gap |
|------|---------------|----------|
| **Data model** | ~35 tables; no `tenants` or `tenant_id` | Every tenant-owned table needs `tenant_id` + composite FKs |
| **Config** | `system_config` global key-value (`business_branding`, `email_settings`, `chitra_escalation_thresholds`, …) | Config must be per-tenant (row per tenant or `tenant_id` column) |
| **RBAC** | `profiles` + `user_roles`; `is_super_admin` on `profiles` (Vikash) | Roles scoped to `tenant_memberships`; platform admin separate |
| **Auth** | Open staff signup (`Auth.tsx`); applicant signup (`ApplicantLogin.tsx`) | Close open signup; tenant-scoped invites + tenant signup flow |
| **Routing** | Single origin; `/careers`, `/applicant/*` on same host | Subdomain determines tenant; careers on tenant subdomain |
| **RLS** | Role-based, not org-based | All policies predicate on `tenant_id` + membership |
| **Storage** | Buckets: `resumes`, `company-assets`, `avatars` — no path prefix | `{tenant_id}/...` object paths + policies |
| **Edge functions** | ~30 functions; service role; global `system_config` reads | Resolve tenant from JWT/header/subdomain; scope all queries |
| **Email** | `PUBLIC_APP_URL`, `business_branding`, SES from `thetalentapp.io` | Per-tenant from/reply-to; links use tenant subdomain |
| **Cron / Chitragupta** | Global `pg_cron` → edge; notifies `is_super_admin` | Per-tenant cron fan-out or tenant loop inside functions |
| **Applicant portal** | Global `/careers` lists all jobs | Tenant careers: only that tenant's published jobs |
| **OSS export** | Single-tenant assumptions throughout | `VITE_DEPLOYMENT_MODE` branch for self-host |

### What already helps (don't throw away)

- **`business_branding` in `system_config`** — already documented as "tenant branding"; becomes per-tenant config
- **Branded email layout** (`_shared/emailLayout.ts`) — loads logo/colors dynamically
- **Role-scoped UI** — admin/HR/recruiter/interviewer patterns map cleanly to per-tenant membership
- **RLS everywhere** — policies exist; they need `tenant_id` predicates, not greenfield security
- **Applicant vs staff split** — `useAuth`, `ApplicantAuthProvider`, route guards are a solid foundation

---

## 4. Recommended Tenancy Model

### Decision: Shared database + `tenant_id` + RLS

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Shared DB, row-level (`tenant_id`)** | ✅ **Recommended** | Best fit for Supabase RLS, one migration path, lowest ops cost at early scale |
| Database-per-tenant | ❌ v1 | Ops explosion (N Supabase projects), hard to run OSS parity |
| Schema-per-tenant | ❌ | Poor Supabase/PostgREST ergonomics |
| Siloed auth per tenant | ❌ | Supabase Auth is project-scoped; use app metadata + RLS instead |

### Tenant resolution order

1. **Subdomain** (production): `acme.thetalentapp.io` → slug `acme`
2. **Build-time override** (self-host): `VITE_TENANT_SLUG=default` or implicit single tenant
3. **JWT claim** (API): `app_metadata.tenant_id` set at login/signup — must match subdomain tenant
4. **Reject mismatch**: user authenticated for tenant A visiting tenant B subdomain → sign out + error

### Isolation guarantee

> **All tenant data access goes through RLS.** Edge functions using the service role must explicitly filter by `tenant_id` (or use a restricted RPC). Never rely on frontend filtering alone.

---

## 5. Data Model

### 5.1 New tables

```sql
-- Core tenant registry
CREATE TABLE public.tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,          -- subdomain: sparxit, acme
  display_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'active' -- active | suspended | provisioning
    CHECK (status IN ('active', 'suspended', 'provisioning')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Staff membership (replaces global user_roles for org scope)
CREATE TABLE public.tenant_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        app_role NOT NULL,               -- admin | hr | recruiter | interviewer
  is_active   boolean NOT NULL DEFAULT true,
  invited_by  uuid REFERENCES auth.users(id),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- Platform operators (SparxIT eng / super admin for SaaS ops)
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional: pending invites before auth user exists
CREATE TABLE public.tenant_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        app_role NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  invited_by  uuid NOT NULL REFERENCES auth.users(id),
  accepted_at timestamptz,
  UNIQUE (tenant_id, email)
);
```

### 5.2 `tenant_id` on existing tables

Add `tenant_id uuid NOT NULL REFERENCES tenants(id)` to all tenant-owned data. Grouped by domain:

| Group | Tables |
|-------|--------|
| **Jobs & applications** | `jobs`, `job_applications`, `job_recruiters`, `job_interview_stages`, `job_application_forms`, `job_application_responses` |
| **Candidates & pipeline** | `candidates`, `candidate_prescreens`, `candidate_tags`, `candidate_interviews`, `candidate_interviewers`, `candidate_interview_panelists`, `pipeline_analysis_cache` |
| **Assessments** | `assessments`, `assessment_sections`, `questions`, `assessment_templates`, `candidate_assessments`, `candidate_responses` |
| **Interviews & scorecards** | `interview_stage_templates`, `interview_kits`, `scorecard_templates`, `prescreen_question_bank` |
| **Staff & config** | `system_config` (see below), `announcements`, `vendors`, `notifications`, `chitra_escalations` |
| **Applicants** | `applicant_profiles` (per-tenant; same auth user may have rows in multiple tenants) |
| **Email** | `email_delivery_log` |
| **Lookup data** | Domains, teams, colleges, cert tiers — today in `system_config`; migrate to per-tenant rows or keyed config |

**`profiles` table:** Keep as **global user identity** (name, email, avatar). Remove hiring role from global scope — role lives on `tenant_memberships`. Deprecate `is_super_admin` on `profiles` in favor of `platform_admins` (with migration mapping Vikash → `platform_admins`).

**`user_roles` table:** Deprecate after migration to `tenant_memberships`. Drop once all RLS policies use membership helpers.

### 5.3 `system_config` migration strategy

**Option A (recommended):** Add `tenant_id` column; change unique constraint from `config_key` to `(tenant_id, config_key)`.

```sql
ALTER TABLE public.system_config
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- After backfill:
ALTER TABLE public.system_config
  ADD CONSTRAINT system_config_tenant_key_unique UNIQUE (tenant_id, config_key);
```

**Option B:** Move each config domain to dedicated per-tenant tables. More normalized but larger migration; only if config queries become hot-path bottlenecks.

### 5.4 Constraint & index changes

- **Composite FKs:** Child rows must reference parent in same tenant, e.g. `candidates(job_id)` → add check that `candidates.tenant_id = jobs.tenant_id` via composite FK or trigger.
- **Unique constraints:** Replace globals with tenant-scoped uniques:
  - `job_applications (job_id, applicant_email)` → `(tenant_id, job_id, applicant_email)`
  - `applicant_profiles (email)` → `(tenant_id, email)` or `(tenant_id, user_id)`
- **Indexes:** `CREATE INDEX ON <table> (tenant_id)` on every tenant table; composite indexes for common filters: `(tenant_id, status)`, `(tenant_id, created_at DESC)`.

### 5.5 RLS helper functions (new)

```sql
-- Returns tenant_id for current request (from JWT claim)
CREATE FUNCTION public.current_tenant_id() RETURNS uuid ...

-- True if auth.uid() is active member of tenant
CREATE FUNCTION public.is_tenant_member(p_tenant_id uuid) RETURNS boolean ...

-- True if member with role in (admin, hr, ...)
CREATE FUNCTION public.has_tenant_role(p_tenant_id uuid, p_roles app_role[]) RETURNS boolean ...

-- True if platform admin (SaaS ops)
CREATE FUNCTION public.is_platform_admin() RETURNS boolean ...
```

Replace `is_admin_or_hr(auth.uid())` with `has_tenant_role(current_tenant_id(), ARRAY['admin','hr']::app_role[])`.

---

## 6. Auth & Onboarding Flows

### 6.1 Close open signup (SaaS mode)

| Flow | Today | SaaS |
|------|-------|------|
| Staff `/auth` signup | Open registration | **Disabled** — invite or tenant-creation only |
| Applicant signup | Open on `/applicant/login` | Open **per tenant subdomain** only |
| Password reset | Global | Tenant-branded emails; links stay on tenant subdomain |

Implementation: `VITE_DEPLOYMENT_MODE=saas` hides staff signup UI; Supabase Auth settings disable public signup (invite-only for staff); edge hook validates tenant on invite acceptance.

### 6.2 New tenant signup (org creation)

```
1. User visits thetalentapp.io → "Start free trial" / "Create organization"
2. Form: company name, slug (acme), admin name, email, password
3. Edge function (service role):
   a. Validate slug (reserved list: www, api, admin, app, mail, …)
   b. INSERT tenants
   c. Create auth user + tenant_memberships (role=admin)
   d. Seed system_config defaults (branding, email toggles, chitra thresholds)
   e. Set app_metadata.tenant_id + tenant_slug on user
4. Redirect to https://acme.thetalentapp.io
```

**Rate limiting:** CAPTCHA + per-IP throttle on tenant creation endpoint.

### 6.3 Staff invite flow

```
1. Tenant admin → Settings → Users → Invite
2. INSERT tenant_invitations + send auth invite email (Send Email Hook)
3. Invitee clicks link → lands on {tenant}.thetalentapp.io/auth/accept
4. On accept: INSERT tenant_memberships, set JWT app_metadata.tenant_id
```

Existing `send-invitation-email` and `admin-confirm-user` functions merge into this flow.

### 6.4 Applicant auth (per tenant)

- Applicant signs up on `acme.thetalentapp.io/applicant/login`
- `applicant_profiles` row gets `tenant_id = acme`
- `user_metadata.is_applicant = true` + `app_metadata.tenant_id`
- Same email can apply to multiple tenants → separate `applicant_profiles` rows (or link table)

### 6.5 Platform admin vs tenant admin

| Capability | Tenant admin | Platform admin |
|------------|--------------|----------------|
| Manage users in org | ✅ | ❌ (unless impersonating — defer) |
| Suspend tenant | ❌ | ✅ |
| View cross-tenant data | ❌ | ✅ (support tooling only, audited) |
| Chitragupta config | ✅ (own tenant) | ❌ |
| Billing / plan | ❌ (v1) | ✅ (future) |

**Migrate Vikash:** `is_super_admin = true` → `platform_admins` row. Tenant-level "super user" within SparxIT org is `tenant_memberships.role = 'admin'`.

### 6.6 JWT / session shape

```json
{
  "app_metadata": {
    "tenant_id": "uuid",
    "tenant_slug": "sparxit"
  },
  "user_metadata": {
    "is_applicant": false,
    "full_name": "..."
  }
}
```

Postgres RLS reads `tenant_id` from JWT via `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`.

---

## 7. Subdomain Routing & Infrastructure

### 7.1 DNS

```
*.thetalentapp.io     CNAME → SaaS frontend (Vercel/Cloudflare Pages/same host as today)
thetalentapp.io       Marketing / tenant signup
api.thetalentapp.io   Optional: API gateway (if splitting later)
```

**Wildcard TLS:** Cloudflare or platform-managed cert for `*.thetalentapp.io`.

**Reserved slugs:** `www`, `api`, `admin`, `app`, `mail`, `status`, `docs`, `help`, `sparxit` (allowed — SparxIT tenant), `demo`, `test`.

### 7.2 Frontend: single build

```typescript
// src/lib/tenant.ts
export function resolveTenantSlug(): string {
  if (import.meta.env.VITE_DEPLOYMENT_MODE === 'self_hosted') {
    return import.meta.env.VITE_TENANT_SLUG ?? 'default';
  }
  const host = window.location.hostname;
  // acme.thetalentapp.io → acme
  // localhost → VITE_DEV_TENANT_SLUG
}
```

- **One build artifact** deployed everywhere
- Tenant context injected into React context (`TenantProvider`) before data hooks run
- All Supabase queries include implicit tenant filter (RLS handles DB; hooks pass slug for edge calls)

### 7.3 Supabase strategy

| Phase | Approach |
|-------|----------|
| **SaaS v1** | Single Supabase Cloud project (or managed self-hosted cluster) for all tenants |
| **Scale / enterprise** | Optional dedicated project per large customer — not in v1 |

**Connection:** All tenants share `VITE_SUPABASE_URL` + anon key. Isolation is RLS, not network.

**Auth redirect URLs:** Add wildcard `https://*.thetalentapp.io/**` to Supabase Auth allowed URLs.

### 7.4 Local development

```
# /etc/hosts
127.0.0.1 sparxit.localhost acme.localhost

# .env.dev
VITE_DEPLOYMENT_MODE=saas
VITE_DEV_TENANT_SLUG=sparxit
```

Vite dev server reads subdomain from host header.

### 7.5 SparxIT production transition

| Current | Target |
|---------|--------|
| `sparxtalent.thesparxitsolutions.com` | `sparxit.thetalentapp.io` (primary) |
| Self-hosted Supabase at `spxtalent-db.clientwork.xyz` | Supabase SaaS project OR same DB with tenant row |

Keep old URL as **301 redirect** during transition window (see §11).

---

## 8. Applicant / Careers Portal per Tenant

### Routes (tenant subdomain)

| Path | Purpose |
|------|---------|
| `/careers` | Published jobs for **this tenant only** |
| `/careers/:jobId` | Job detail + apply |
| `/applicant/login` | Applicant auth (tenant-scoped) |
| `/applicant/*` | Dashboard, applications, exam portal |

### Data rules

- `jobs` query: `WHERE tenant_id = :current AND status = 'published'` (or equivalent)
- Careers branding from tenant's `business_branding` config
- Application creates `job_applications` + `candidates` with correct `tenant_id`
- Exam portal tokens (`candidate_assessments`) validated against tenant

### Cross-tenant applicant identity

| Scenario | Behavior |
|----------|----------|
| Same person applies to SparxIT and Acme | Two `applicant_profiles`, two auth sessions or tenant switcher (defer switcher — separate logins per subdomain is fine) |
| Staff user in two tenants | Two `tenant_memberships`; login picks tenant from subdomain |

---

## 9. Edge Functions, Email, Storage, Chitragupta

### 9.1 Edge functions (~30)

**Pattern for every function:**

1. Accept `X-Tenant-Slug` or read from JWT
2. Resolve `tenant_id` from `tenants` table
3. All DB reads/writes include `.eq('tenant_id', tenantId)`
4. Service-role functions: **never** query without tenant filter

**Shared module:** `supabase/functions/_shared/tenant.ts`

```typescript
export async function resolveTenant(supabase, slug: string): Promise<Tenant>
export function requireTenantId(meta: UserMetadata): string
```

**High-touch functions:**

| Function | Tenant-aware change |
|----------|---------------------|
| `send-auth-email` | Branding + links from tenant config; redirect to `{slug}.thetalentapp.io` |
| `send-applicant-email`, `send-staff-email`, `send-hire-email` | Per-tenant from address, `PUBLIC_APP_URL` → `https://{slug}.thetalentapp.io` |
| `candidate-portal` | Validate assessment token within tenant |
| `chitra-engine`, `chitra-kra234`, `chitra-daily-brief`, `chitra-weekly-report` | Loop tenants or accept `tenant_id` param from cron |
| `parse-resume`, `analyze-candidate`, `generate-assessment`, … | Scope candidate/job reads by tenant |
| `product-insight` | Platform admin only; never cross-tenant in customer-facing paths |

### 9.2 Email (AWS SES)

| Setting | Scope |
|---------|-------|
| `email_settings.from_address` | Per-tenant in `system_config` |
| Domain verification | `thetalentapp.io` verified once; send as `system@thetalentapp.io` or tenant-specific if they verify subdomain (v2) |
| Link base URL | `https://{slug}.thetalentapp.io` — replace single `PUBLIC_APP_URL` |

**SaaS default:** Platform sends from `noreply@thetalentapp.io` with tenant display name until custom domain verification ships.

### 9.3 Storage

| Bucket | Path convention | Policy |
|--------|-----------------|--------|
| `resumes` | `{tenant_id}/{candidate_id}/...` | RLS via storage policy on path prefix |
| `company-assets` | `{tenant_id}/logo-...` | Public read per tenant prefix |
| `avatars` | `{tenant_id}/{user_id}/...` | Member read/write own tenant |

Migrate existing objects during SparxIT cutover (copy to prefixed paths).

### 9.4 Chitragupta per tenant

- `chitra_escalations`, `notifications` → `tenant_id`
- Cron: `chitra-engine` runs hourly → **for each active tenant**, evaluate KRAs with that tenant's thresholds from `system_config`
- Escalation notify: tenant admins/HR, not global `is_super_admin`
- **Product insight / weekly report to Vikash:** platform-level cron, separate from tenant Chitragupta

---

## 10. OSS vs SaaS Dual-Mode

### Environment flag

```bash
# SaaS production build
VITE_DEPLOYMENT_MODE=saas

# OSS self-host (default)
VITE_DEPLOYMENT_MODE=self_hosted
VITE_TENANT_SLUG=default   # implicit single tenant
```

### Behavior matrix

| Feature | `self_hosted` | `saas` |
|---------|---------------|--------|
| Tenant resolution | Fixed slug / none | Subdomain |
| Staff open signup | Allowed (today) | Disabled |
| `tenants` table | One row seeded at migration | Many rows |
| RLS | `tenant_id` always = default tenant | Full subdomain + JWT |
| Marketing site | N/A | `thetalentapp.io` |
| Platform admin UI | Hidden | Internal only |

### OSS export considerations

- Export must compile and run with `VITE_DEPLOYMENT_MODE=self_hosted`
- Migrations include `tenants` table + seed `default` tenant for self-hosters
- Document in `docs/guides/oss-self-host.md`: "SaaS mode is not available in self-host; single org only"
- Do **not** export SaaS-only ops tools (platform admin panel) unless gated

---

## 11. SparxIT Migration Path (10-Step Cutover)

SparxIT is the first production tenant — migration must be zero data loss and reversible until cutover.

| Step | Action | Owner |
|------|--------|-------|
| **1** | Create `tenants` row: `slug=sparxit`, `display_name=SparxIT` | Eng |
| **2** | Add `tenant_id` columns (nullable), deploy migration | Eng |
| **3** | Backfill all rows with SparxIT `tenant_id` | Eng (SQL script) |
| **4** | Migrate `profiles`/`user_roles` → `tenant_memberships` | Eng |
| **5** | Map Vikash `is_super_admin` → `platform_admins` | Eng |
| **6** | Rewrite RLS policies with `tenant_id`; QA isolation on staging | Eng + QA |
| **7** | Deploy edge function + storage path updates to staging | DevOps |
| **8** | DNS: `sparxit.thetalentapp.io` → staging → prod; smoke test | DevOps |
| **9** | Storage object migration to `{tenant_id}/` prefixes | DevOps |
| **10** | Cutover: 301 `sparxtalent.thesparxitsolutions.com` → `sparxit.thetalentapp.io`; freeze old DB writes | DevOps + Eng |

**Rollback plan:** Keep old single-tenant DB snapshot for 30 days; redirect can revert to old URL if critical regression.

**Communication:** Notify SparxIT staff 1 week before URL change; update bookmarks, email templates, SES `PUBLIC_APP_URL`.

---

## 12. Phased Roadmap (Phases 0–9)

Effort: **S** = 1–2 weeks, **M** = 2–4 weeks, **L** = 4–8 weeks (one focused engineer; parallel work reduces calendar time).

### Phase 0 — Design lock & spikes

| Item | Effort | Output |
|------|--------|--------|
| Stakeholder review of this doc | S | Signed scope + open decisions (§14) |
| RLS spike: one table (`jobs`) + `tenant_id` on staging | S | Proof that PostgREST + JWT claim works |
| Subdomain dev ergonomics spike | S | `*.localhost` tenant resolution |
| Auth spike: invite-only staff signup | S | Documented flow |

**Dependencies:** None  
**Exit criteria:** Team agrees on shared-DB model; spikes green

---

### Phase 1 — Schema foundation

| Item | Effort |
|------|--------|
| `tenants`, `tenant_memberships`, `platform_admins`, `tenant_invitations` | M |
| `tenant_id` on all tenant tables (nullable) | M |
| `system_config` → per-tenant unique keys | S |
| Seed `default` tenant for self-host; `sparxit` for prod backfill scripts | S |

**Dependencies:** Phase 0  
**Exit criteria:** Migrations apply cleanly on empty + prod snapshot clone

---

### Phase 2 — RLS rewrite

| Item | Effort |
|------|--------|
| New helper functions (`current_tenant_id`, `has_tenant_role`, …) | M |
| Rewrite all table policies (estimate: 80+ policies) | L |
| Rewrite RPCs (`get_scheduled_interviews`, `search_candidates`, …) | M |
| Storage policies with path prefix | M |
| Security review + isolation test suite | M |

**Dependencies:** Phase 1  
**Exit criteria:** Automated tests prove tenant A cannot read tenant B data

---

### Phase 3 — Auth & onboarding

| Item | Effort |
|------|--------|
| Tenant creation edge function + signup UI on marketing site | M |
| Staff invite flow + disable open signup (SaaS mode) | M |
| JWT `app_metadata.tenant_id` on login/invite/accept | M |
| Applicant auth tenant-scoping | M |
| `useAuth` / `TenantProvider` refactor | M |

**Dependencies:** Phase 2  
**Exit criteria:** New org can be created end-to-end on staging

---

### Phase 4 — Frontend tenant context

| Item | Effort |
|------|--------|
| `resolveTenantSlug()`, `TenantProvider`, query hook updates | L |
| Careers + applicant portal tenant filtering | M |
| Settings, pipeline, all data pages — verify RLS + UX | L |
| `VITE_DEPLOYMENT_MODE` branching | S |

**Dependencies:** Phase 3  
**Exit criteria:** Two tenants on staging with isolated data, full hiring flow

---

### Phase 5 — Edge functions & email

| Item | Effort |
|------|--------|
| `_shared/tenant.ts`; update all ~30 functions | L |
| Per-tenant email links and branding | M |
| SES / `PUBLIC_APP_URL` strategy for subdomains | S |
| DB webhooks (`internal_webhook_config`) tenant-aware | M |

**Dependencies:** Phase 4  
**Exit criteria:** Transactional emails link to correct subdomain; Chitragupta emails scoped

---

### Phase 6 — Chitragupta & cron

| Item | Effort |
|------|--------|
| Per-tenant cron fan-out in `chitra-engine` | M |
| `chitra_escalations` + notifications tenant-scoped | S |
| Platform admin reporting (cross-tenant) isolated from tenant UI | S |

**Dependencies:** Phase 5  
**Exit criteria:** Escalations on staging tenant do not notify other tenants

---

### Phase 7 — SparxIT data migration

| Item | Effort |
|------|--------|
| Backfill production snapshot on staging | M |
| Storage path migration scripts | M |
| `tenant_memberships` from current users | M |
| Parallel run / read-only validation | M |

**Dependencies:** Phase 6  
**Exit criteria:** SparxIT data fully tenant-tagged; parity test pass

---

### Phase 8 — Infrastructure & cutover

| Item | Effort |
|------|--------|
| Wildcard DNS + TLS for `*.thetalentapp.io` | S |
| Supabase Auth redirect URL wildcards | S |
| `sparxit.thetalentapp.io` production deploy | M |
| 301 from legacy SparxIT URL | S |
| Monitoring, error tracking per tenant | M |

**Dependencies:** Phase 7  
**Exit criteria:** SparxIT production on subdomain; legacy URL redirects

---

### Phase 9 — SaaS GA & OSS validation

| Item | Effort |
|------|--------|
| Second pilot tenant (dogfood or friendly customer) | M |
| OSS self-host regression with `default` tenant | M |
| Update `docs/guides/oss-self-host.md`, README, DEVOPS_HANDOFF | S |
| Compliance review ([COMPLIANCE.md](./COMPLIANCE.md)) for multi-tenant processor roles | M |

**Dependencies:** Phase 8  
**Exit criteria:** Public SaaS signup (if product-ready); OSS export still works

---

### Timeline summary

| Phase | Cumulative (indicative) |
|-------|-------------------------|
| 0–2 | Month 1–2 |
| 3–4 | Month 2–4 |
| 5–6 | Month 3–5 |
| 7–8 | Month 5–6 |
| 9 | Month 6–7 |

---

## 13. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **RLS gap → cross-tenant leak** | Critical | Mandatory isolation test suite; security review before Phase 8; never ship service-role queries without `tenant_id` |
| **JWT tenant claim spoofing** | Critical | RLS uses `auth.jwt()` server-side; subdomain + claim mismatch → force logout; no client-writable `tenant_id` |
| **Migration data corruption** | High | Clone prod → staging backfill; checksum row counts; reversible cutover window |
| **Applicant email across tenants** | Medium | Unique `(tenant_id, email)` not global; document UX |
| **Cron cost at scale** | Medium | Per-tenant loop with batching; later: job queue per tenant |
| **OSS regression** | Medium | CI build both modes; self-host smoke test in Phase 9 |
| **Scope creep (custom domains, billing)** | Medium | Explicit non-goals for v1; §14 decision checklist |
| **SparxIT URL change disruption** | Medium | 301 redirect, staff comms, 2-week parallel run |
| **Supabase Auth invite limits** | Low | Monitor rate limits; queue invites |
| **Gemini key sharing across tenants** | Medium | Platform key for v1; per-tenant keys → deferred ([ROADMAP](../ROADMAP.md) Gemini self-service item) |

---

## 14. Open Product Decisions (Stakeholder Checklist)

Use this checklist in a planning meeting before Phase 1 starts.

### Tenant & signup

- [ ] **Slug rules:** Min/max length, allowed characters, reserved list finalization
- [ ] **Self-service signup:** Open to anyone vs approval queue vs invite-only SaaS
- [ ] **Free trial:** Time-boxed, feature-limited, or freemium?
- [ ] **Tenant deletion:** Hard delete vs soft suspend; data retention period

### Auth & users

- [ ] **One email, multiple tenants (staff):** Separate logins per subdomain vs tenant picker after login
- [ ] **SSO (SAML/OIDC):** v1 or v2?
- [ ] **Platform admin impersonation:** Allow support "login as" with audit log?

### Applicant experience

- [ ] **Global applicant account:** Can one login apply across tenants? (Recommend: no for v1)
- [ ] **Careers SEO:** Index `acme.thetalentapp.io/careers` or noindex until custom domain?

### Infrastructure & compliance

- [ ] **Hosting region:** Single region (which?) for GDPR/DPDP posture
- [ ] **Supabase Cloud vs managed self-hosted** for SaaS control plane
- [ ] **Backup / DR:** RPO/RTO per tenant; export API for enterprise
- [ ] **Data processing agreement:** The Talent App as processor; tenant as controller — template ready?

### Commercial

- [ ] **Pricing model:** Per seat, per active job, flat org fee
- [ ] **Billing integration:** Stripe Billing timing
- [ ] **SparxIT legacy URL:** Sunset date for `sparxtalent.thesparxitsolutions.com`

### AI & email

- [ ] **Shared Gemini key vs BYOK** for SaaS tenants at launch
- [ ] **Email from domain:** Platform `noreply@thetalentapp.io` only vs tenant-verified domains in v1

---

## 15. Appendix

### A. Tables requiring `tenant_id` (checklist)

- [ ] `jobs`, `job_applications`, `job_recruiters`, `job_interview_stages`
- [ ] `job_application_forms`, `job_application_responses`, `prescreen_question_bank`
- [ ] `candidates`, `candidate_prescreens`, `candidate_tags`
- [ ] `candidate_interviews`, `candidate_interviewers`, `candidate_interview_panelists`
- [ ] `assessments`, `assessment_sections`, `questions`, `assessment_templates`
- [ ] `candidate_assessments`, `candidate_responses`
- [ ] `interview_stage_templates`, `interview_kits`, `scorecard_templates`
- [ ] `applicant_profiles`
- [ ] `system_config`, `announcements`, `vendors`
- [ ] `notifications`, `chitra_escalations`
- [ ] `email_delivery_log`, `pipeline_analysis_cache`

### B. Files likely to change (high level)

| Layer | Examples |
|-------|----------|
| Migrations | New `202607*_saas_tenants.sql`, `*_tenant_id_backfill.sql`, `*_rls_tenant_scope.sql` |
| Frontend | `useAuth.tsx`, `App.tsx`, `Careers.tsx`, `Settings.tsx`, `useSystemConfig.tsx`, new `useTenant.tsx` |
| Edge | All `supabase/functions/*/index.ts`, new `_shared/tenant.ts` |
| Config | `.env.example`, `docs/DEVOPS_HANDOFF.md`, `docs/guides/oss-self-host.md` |
| CI | Matrix build: `self_hosted` + `saas` |

### C. Glossary

| Term | Meaning |
|------|---------|
| **Tenant** | Customer organization (SparxIT, Acme Corp) |
| **Slug** | Subdomain label (`sparxit` in `sparxit.thetalentapp.io`) |
| **Platform admin** | TTA operator with cross-tenant ops access |
| **Tenant admin** | Org-level admin role within one tenant |
| **Deployment mode** | `saas` vs `self_hosted` build/runtime flag |

---

*This plan does not authorize production migrations. All schema changes require super admin review and explicit approval before apply.*
