-- Add linkedin_url column to job_applications
ALTER TABLE public.job_applications 
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to resumes bucket (public applications)
CREATE POLICY "Anyone can upload resumes"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'resumes');

-- Allow anyone to view resumes (HR needs to see them)
CREATE POLICY "Anyone can view resumes"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'resumes');

-- Allow authenticated users to delete resumes (HR cleanup)
CREATE POLICY "Authenticated can delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes');