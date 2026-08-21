-- Drop and recreate the INSERT policy to allow anonymous users
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;

-- Create policy that explicitly allows anon and authenticated users to insert
CREATE POLICY "Anyone can submit applications" 
  ON public.job_applications 
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);