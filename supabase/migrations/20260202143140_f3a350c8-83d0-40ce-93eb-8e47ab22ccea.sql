-- Fix the job_applications INSERT policy - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;

CREATE POLICY "Anyone can submit applications" 
  ON public.job_applications 
  FOR INSERT 
  TO public
  WITH CHECK (true);