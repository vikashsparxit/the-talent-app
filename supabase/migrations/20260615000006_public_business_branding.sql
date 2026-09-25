-- Public careers page: allow anonymous read of business_branding only (logo + company name).
-- company-assets bucket is already public-read for logo URLs.

DROP POLICY IF EXISTS "Anon can read business branding" ON public.system_config;

CREATE POLICY "Anon can read business branding"
  ON public.system_config FOR SELECT
  TO anon
  USING (config_key = 'business_branding');
