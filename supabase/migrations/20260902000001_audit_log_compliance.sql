-- Slice B — append-only audit_log, compliance settings, sensitive-data consent columns
-- Present for super-admin review — do not apply automatically.

-- ── Append-only audit log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid        NOT NULL REFERENCES auth.users (id),
  action       text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  before_data  jsonb,
  after_data   jsonb,
  ip           inet
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id);

COMMENT ON TABLE public.audit_log IS
  'Append-only staff action log. No UPDATE or DELETE policies — rows are permanent.';

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admin, HR, and super-admin may read; no authenticated UPDATE/DELETE policies.
CREATE POLICY "Admin and HR read audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_super_admin = true
    )
  );

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action      text,
  _entity_type text,
  _entity_id   uuid,
  _before_data jsonb DEFAULT NULL,
  _after_data  jsonb DEFAULT NULL,
  _ip          inet DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id     uuid;
  _actor  uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(_actor, 'admin'::app_role)
    OR public.has_role(_actor, 'hr'::app_role)
    OR public.has_role(_actor, 'recruiter'::app_role)
    OR public.has_role(_actor, 'interviewer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Staff role required to write audit log';
  END IF;

  INSERT INTO public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, ip
  )
  VALUES (
    _actor, _action, _entity_type, _entity_id, _before_data, _after_data, _ip
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_audit_log(text, text, uuid, jsonb, jsonb, inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, uuid, jsonb, jsonb, inet) TO authenticated;

-- ── Compliance settings (system_config) ───────────────────────────────────────

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'compliance_settings',
  '{
    "privacy_policy_url": null,
    "terms_url": null,
    "grievance_officer_name": null,
    "grievance_officer_email": null
  }'::jsonb,
  'GDPR/DPDP compliance hooks: privacy URLs and grievance officer contact.'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'sso_settings',
  '{
    "enabled": false,
    "domain": null,
    "provider_id": null
  }'::jsonb,
  'SAML SSO UI config. IdP registration is via GoTrue admin API (see docs/DEVOPS_HANDOFF.md).'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Admin read compliance settings" ON public.system_config;
CREATE POLICY "Admin read compliance settings"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key IN ('compliance_settings', 'sso_settings')
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.is_super_admin = true
      )
    )
  );

DROP POLICY IF EXISTS "Admin update compliance settings" ON public.system_config;
CREATE POLICY "Admin update compliance settings"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key IN ('compliance_settings', 'sso_settings')
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.is_super_admin = true
      )
    )
  )
  WITH CHECK (
    config_key IN ('compliance_settings', 'sso_settings')
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.is_super_admin = true
      )
    )
  );

DROP POLICY IF EXISTS "Admin insert compliance settings" ON public.system_config;
CREATE POLICY "Admin insert compliance settings"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key IN ('compliance_settings', 'sso_settings')
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.is_super_admin = true
      )
    )
  );

-- Public read of compliance_settings for applicant footer (privacy URL + grievance officer only).
DROP POLICY IF EXISTS "Public read compliance footer settings" ON public.system_config;
CREATE POLICY "Public read compliance footer settings"
  ON public.system_config FOR SELECT
  TO anon, authenticated
  USING (config_key = 'compliance_settings');

-- ── Sensitive personal data consent (DPDP) ────────────────────────────────────

ALTER TABLE public.applicant_profiles
  ADD COLUMN IF NOT EXISTS sensitive_data_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitive_data_consent_source text;

COMMENT ON COLUMN public.applicant_profiles.sensitive_data_consent_at IS
  'Timestamp when applicant consented to collection of DOB, gender, marital status, blood group.';
COMMENT ON COLUMN public.applicant_profiles.sensitive_data_consent_source IS
  'Source of sensitive-data consent, e.g. applicant_profile_modal.';
