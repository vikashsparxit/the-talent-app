-- Allow any authenticated user to read public lookup config (cert_tiers, tier1_colleges).
-- Fixes RLS blocking when is_admin_or_hr(auth.uid()) is false (e.g. proxy not forwarding JWT).
-- Insert/update/delete remain admin-only via existing policies.
CREATE POLICY "Authenticated can read lookup config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (config_key IN ('cert_tiers', 'tier1_colleges'));
