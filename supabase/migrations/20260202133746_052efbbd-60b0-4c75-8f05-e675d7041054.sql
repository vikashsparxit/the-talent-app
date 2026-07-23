-- Create job status enum
CREATE TYPE public.job_status AS ENUM ('draft', 'open', 'paused', 'closed');

-- Create job type enum
CREATE TYPE public.job_type AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'freelance');

-- Create experience level enum
CREATE TYPE public.experience_level AS ENUM ('entry', 'mid', 'senior', 'lead', 'executive');

-- Create jobs table
CREATE TABLE public.jobs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    department TEXT,
    location TEXT,
    job_type public.job_type NOT NULL DEFAULT 'full_time',
    experience_level public.experience_level,
    salary_min NUMERIC,
    salary_max NUMERIC,
    salary_currency TEXT DEFAULT 'USD',
    required_skills JSONB DEFAULT '[]'::jsonb,
    benefits JSONB DEFAULT '[]'::jsonb,
    application_deadline TIMESTAMP WITH TIME ZONE,
    status public.job_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add job_id to candidates table
ALTER TABLE public.candidates 
ADD COLUMN job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

-- Create job applications table (for public applications)
CREATE TABLE public.job_applications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
    applicant_name TEXT NOT NULL,
    applicant_email TEXT NOT NULL,
    applicant_phone TEXT,
    resume_url TEXT,
    cover_letter TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Jobs RLS policies
CREATE POLICY "Admin/HR can create jobs" 
ON public.jobs 
FOR INSERT 
WITH CHECK (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all jobs" 
ON public.jobs 
FOR SELECT 
USING (is_admin_or_hr(auth.uid()) OR status = 'open');

CREATE POLICY "Admin/HR can update jobs" 
ON public.jobs 
FOR UPDATE 
USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete jobs" 
ON public.jobs 
FOR DELETE 
USING (is_admin_or_hr(auth.uid()));

-- Public can view open jobs (anonymous access)
CREATE POLICY "Anyone can view open jobs" 
ON public.jobs 
FOR SELECT 
TO anon
USING (status = 'open');

-- Job applications RLS policies
CREATE POLICY "Admin/HR can view all applications" 
ON public.job_applications 
FOR SELECT 
USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update applications" 
ON public.job_applications 
FOR UPDATE 
USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete applications" 
ON public.job_applications 
FOR DELETE 
USING (is_admin_or_hr(auth.uid()));

-- Anyone can submit applications (anonymous access)
CREATE POLICY "Anyone can submit applications" 
ON public.job_applications 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Create updated_at triggers
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster job queries
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_department ON public.jobs(department);
CREATE INDEX idx_job_applications_job_id ON public.job_applications(job_id);
CREATE INDEX idx_candidates_job_id ON public.candidates(job_id);