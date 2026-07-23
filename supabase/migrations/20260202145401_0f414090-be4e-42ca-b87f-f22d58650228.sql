-- Drop all existing INSERT policies
DROP POLICY IF EXISTS "Public can submit applications" ON public.job_applications;
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;
DROP POLICY IF EXISTS "Public can submit applications" ON public.job_applications;

-- Grant all necessary permissions explicitly
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT ON public.job_applications TO anon;
GRANT INSERT ON public.job_applications TO authenticated;

-- Grant SELECT on necessary columns for RETURNING clause
GRANT SELECT ON public.job_applications TO anon;
GRANT SELECT ON public.job_applications TO authenticated;

-- Create a PERMISSIVE policy explicitly for anon role
CREATE POLICY "Allow anon to submit applications" 
  ON public.job_applications 
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Create a PERMISSIVE policy explicitly for authenticated role  
CREATE POLICY "Allow authenticated to submit applications" 
  ON public.job_applications 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);