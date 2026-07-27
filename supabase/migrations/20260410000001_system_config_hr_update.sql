-- Allow HR role (in addition to admin) to update system_config.
-- The existing "Admin can update config" policy only checks has_role('admin'),
-- which silently blocks HR users. Replace it to include both roles.
DROP POLICY IF EXISTS "Admin can update config" ON public.system_config;

CREATE POLICY "Admin or HR can update config"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_hr(auth.uid()));

-- Also allow HR to insert (in case a config key doesn't exist yet).
DROP POLICY IF EXISTS "Admin can insert config" ON public.system_config;

CREATE POLICY "Admin or HR can insert config"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_hr(auth.uid()));
