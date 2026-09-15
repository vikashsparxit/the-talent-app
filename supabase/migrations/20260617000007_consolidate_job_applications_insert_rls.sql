-- Consolidate overlapping job_applications INSERT policies into one scoped policy.

DROP POLICY IF EXISTS "Public can submit applications" ON public.job_applications;
DROP POLICY IF EXISTS "Allow anon to submit applications" ON public.job_applications;
DROP POLICY IF EXISTS "Allow authenticated to submit applications" ON public.job_applications;

CREATE POLICY "Public can submit applications for open jobs"
 ON public.job_applications FOR INSERT
 TO anon, authenticated
 WITH CHECK (
 EXISTS (
 SELECT 1 FROM public.jobs j
 WHERE j.id = job_id
 AND j.status = 'open'::job_status
 )
 AND applicant_name IS NOT NULL AND length(trim(applicant_name)) > 0
 AND applicant_email IS NOT NULL AND length(trim(applicant_email)) > 0
 );

-- Drop stale assessment policies (superseded by 20260202140655; may still exist in prod).
DROP POLICY IF EXISTS "Candidates can update own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can create own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can update own responses" ON public.candidate_responses;
