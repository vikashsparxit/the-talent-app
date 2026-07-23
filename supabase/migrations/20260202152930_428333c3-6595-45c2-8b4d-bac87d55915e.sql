-- Create applicant_profiles table to link auth users to applicants
CREATE TABLE public.applicant_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    linkedin_url TEXT,
    resume_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.applicant_profiles ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is an applicant
CREATE OR REPLACE FUNCTION public.is_applicant(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.applicant_profiles
        WHERE user_id = _user_id
    )
$$;

-- RLS Policies for applicant_profiles
CREATE POLICY "Applicants can view own profile"
ON public.applicant_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Applicants can update own profile"
ON public.applicant_profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Applicants can insert own profile"
ON public.applicant_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin/HR can view all applicant profiles"
ON public.applicant_profiles
FOR SELECT
USING (is_admin_or_hr(auth.uid()));

-- Add RLS policies for job_applications to allow applicants to view their own
CREATE POLICY "Applicants can view own applications"
ON public.job_applications
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.applicant_profiles ap
        WHERE ap.user_id = auth.uid() AND ap.email = job_applications.applicant_email
    )
);

-- Add RLS policies for candidates to allow applicants to view their own candidate record
CREATE POLICY "Applicants can view own candidate record"
ON public.candidates
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.applicant_profiles ap
        WHERE ap.user_id = auth.uid() AND ap.email = candidates.email
    )
);

-- Allow applicants to update their own candidate profile info
CREATE POLICY "Applicants can update own candidate record"
ON public.candidates
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.applicant_profiles ap
        WHERE ap.user_id = auth.uid() AND ap.email = candidates.email
    )
);

-- Add RLS policies for candidate_assessments to allow applicants to view their own
CREATE POLICY "Applicants can view own assessments"
ON public.candidate_assessments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.candidates c
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE c.id = candidate_assessments.candidate_id AND ap.user_id = auth.uid()
    )
);

-- Allow applicants to update their own assessments (for taking exams)
CREATE POLICY "Applicants can update own assessments"
ON public.candidate_assessments
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.candidates c
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE c.id = candidate_assessments.candidate_id AND ap.user_id = auth.uid()
    )
);

-- Add RLS for candidate_responses - applicants can view and manage their own responses
CREATE POLICY "Applicants can view own responses"
ON public.candidate_responses
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.candidate_assessments ca
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()
    )
);

CREATE POLICY "Applicants can insert own responses"
ON public.candidate_responses
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.candidate_assessments ca
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()
    )
);

CREATE POLICY "Applicants can update own responses"
ON public.candidate_responses
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.candidate_assessments ca
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()
    )
);

-- Allow applicants to view assessment details for their assigned assessments
CREATE POLICY "Applicants can view assigned assessment metadata"
ON public.assessments
FOR SELECT
USING (
    is_admin_or_hr(auth.uid()) OR
    EXISTS (
        SELECT 1 FROM public.candidate_assessments ca
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE ca.assessment_id = assessments.id AND ap.user_id = auth.uid()
    )
);

-- Allow applicants to view sections of their assigned assessments
CREATE POLICY "Applicants can view assigned assessment sections"
ON public.assessment_sections
FOR SELECT
USING (
    is_admin_or_hr(auth.uid()) OR
    EXISTS (
        SELECT 1 FROM public.candidate_assessments ca
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE ca.assessment_id = assessment_sections.assessment_id AND ap.user_id = auth.uid()
    )
);

-- Allow applicants to view questions (excluding correct_answer) of their assigned assessments
CREATE POLICY "Applicants can view assigned assessment questions"
ON public.questions
FOR SELECT
USING (
    is_admin_or_hr(auth.uid()) OR
    EXISTS (
        SELECT 1 FROM public.assessment_sections s
        JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id
        JOIN public.candidates c ON c.id = ca.candidate_id
        JOIN public.applicant_profiles ap ON ap.email = c.email
        WHERE s.id = questions.section_id AND ap.user_id = auth.uid()
    )
);

-- Update timestamp trigger
CREATE TRIGGER update_applicant_profiles_updated_at
BEFORE UPDATE ON public.applicant_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();