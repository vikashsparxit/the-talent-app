-- Slice A3 — external_refs + candidate.source documentation
-- Present for super-admin review — do not apply automatically.
-- Does NOT rewrite existing candidates.source free-text values.

-- ── Polymorphic external IDs (idempotent ingest) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.external_refs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  entity_type   text        NOT NULL
    CHECK (entity_type IN ('candidate', 'job', 'application', 'interview')),
  entity_id     uuid        NOT NULL,
  provider      text        NOT NULL,
  external_id   text        NOT NULL,
  external_url  text,
  synced_at     timestamptz,
  UNIQUE (provider, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_refs_entity
  ON public.external_refs (entity_type, entity_id);

COMMENT ON TABLE public.external_refs IS
  'Maps TTA entities to external system IDs. UNIQUE (provider, entity_type, external_id) is the idempotency key for inbound connectors.';

ALTER TABLE public.external_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read external_refs"
  ON public.external_refs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'recruiter'::app_role)
  );

CREATE POLICY "Staff insert external_refs"
  ON public.external_refs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'recruiter'::app_role)
  );

CREATE POLICY "Staff update external_refs"
  ON public.external_refs FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'recruiter'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'recruiter'::app_role)
  );

-- Service role bypasses RLS. No DELETE policy for authenticated — refs are kept.

-- ── Source column stays free-text; document canonical keys only ──────────────
-- Canonical keys (UI labels in src/lib/candidateSources.ts):
--   manual, portal, naukri, linkedin, referral, indeed, talent_email,
--   job_application (alias of portal), bulk_resume, csv_import
-- Existing non-canonical values are preserved and displayed as-is.

COMMENT ON COLUMN public.candidates.source IS
  'Free-text intake channel. Canonical keys: manual, portal, naukri, linkedin, referral, indeed, talent_email, job_application, bulk_resume, csv_import. Unknown values are preserved.';
