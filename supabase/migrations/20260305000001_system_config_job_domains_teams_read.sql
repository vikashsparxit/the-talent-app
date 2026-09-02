-- Extend read access so Job Domains and Teams config are visible to authenticated users
-- (same RLS fix as cert_tiers/tier1_colleges).
DROP POLICY IF EXISTS "Authenticated can read lookup config" ON public.system_config;

CREATE POLICY "Authenticated can read lookup config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (config_key IN ('cert_tiers', 'tier1_colleges', 'job_domains', 'job_teams'));
