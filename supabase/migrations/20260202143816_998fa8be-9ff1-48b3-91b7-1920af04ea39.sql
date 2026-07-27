-- Grant explicit permissions and recreate policy
GRANT INSERT ON public.job_applications TO anon;
GRANT INSERT ON public.job_applications TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Recreate with broader scope
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;

CREATE POLICY "Public can submit applications" 
  ON public.job_applications 
  FOR INSERT 
  WITH CHECK (true);