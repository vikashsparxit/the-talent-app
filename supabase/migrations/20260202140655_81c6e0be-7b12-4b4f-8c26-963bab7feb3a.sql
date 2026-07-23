-- =====================================================
-- SECURITY FIX: Drop broken RLS policies that use USING(true)
-- =====================================================

-- Drop the broken candidate policies from migration 20260119092911
DROP POLICY IF EXISTS "Candidates can view own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can update own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can view assigned assessment" ON public.assessments;
DROP POLICY IF EXISTS "Candidates can view assigned sections" ON public.assessment_sections;
DROP POLICY IF EXISTS "Candidates can view assigned questions" ON public.questions;
DROP POLICY IF EXISTS "Candidates can create own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can view own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can update own responses" ON public.candidate_responses;

-- =====================================================
-- SECURITY FIX: Restrict jobs public policy to hide sensitive data
-- =====================================================

-- Drop the overly permissive public jobs policy
DROP POLICY IF EXISTS "Anyone can view open jobs" ON public.jobs;

-- Create new restrictive public jobs policy using security barrier view instead
-- For now, allow public to see open jobs but we'll handle field filtering in the view/query
CREATE POLICY "Public can view limited open job info" 
ON public.jobs FOR SELECT 
USING (status = 'open'::job_status);

-- =====================================================
-- SECURITY FIX: Revoke public execute on score calculation function
-- =====================================================

-- Revoke public access to the score calculation function
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM anon;

-- Grant only to postgres (for triggers)
GRANT EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) TO postgres;

-- =====================================================
-- Create a secure view for public job listings (without salary)
-- =====================================================

CREATE OR REPLACE VIEW public.public_job_listings AS
SELECT 
    id,
    title,
    description,
    department,
    location,
    job_type,
    experience_level,
    application_deadline,
    created_at,
    updated_at
    -- Intentionally excluding: salary_min, salary_max, salary_currency, required_skills, benefits, created_by
FROM public.jobs
WHERE status = 'open'::job_status;