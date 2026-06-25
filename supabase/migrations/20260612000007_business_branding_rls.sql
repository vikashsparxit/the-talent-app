-- Business branding: readable by all staff (header logo) + ensure config row exists

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'business_branding',
  '{"logo_desktop_url": null, "logo_mobile_url": null, "company_name": null}'::jsonb,
  'Tenant branding: company logos for header (desktop + mobile) and display name'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read lookup config" ON public.system_config;

CREATE POLICY "Authenticated can read lookup config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key IN (
      'cert_tiers',
      'tier1_colleges',
      'job_domains',
      'job_teams',
      'business_branding'
    )
  );

-- Allow any staff member to read branding (header is visible to all roles)
DROP POLICY IF EXISTS "Staff can read business branding" ON public.system_config;
CREATE POLICY "Staff can read business branding"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key = 'business_branding'
    AND public.is_staff_user(auth.uid())
  );

-- Only admin can change branding (Settings → Business tab)
DROP POLICY IF EXISTS "Admin can update business branding" ON public.system_config;
CREATE POLICY "Admin can update business branding"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key = 'business_branding'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    config_key = 'business_branding'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin can insert business branding" ON public.system_config;
CREATE POLICY "Admin can insert business branding"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key = 'business_branding'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Logo uploads: admin only (matches Settings → Business tab)
DROP POLICY IF EXISTS "Admin upload company assets" ON storage.objects;
CREATE POLICY "Admin upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin update company assets" ON storage.objects;
CREATE POLICY "Admin update company assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin delete company assets" ON storage.objects;
CREATE POLICY "Admin delete company assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );
