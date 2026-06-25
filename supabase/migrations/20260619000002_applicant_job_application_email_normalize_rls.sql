-- Case-insensitive applicant email matching for recruiter-synced job_applications.
-- Lets portal applicants view/update applications created via sync_job_application_from_candidate.

CREATE OR REPLACE FUNCTION public.applicant_owns_job_application(_application_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.applicant_profiles ap ON lower(trim(ap.email)) = lower(trim(ja.applicant_email))
    WHERE ja.id = _application_id AND ap.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Applicants can view own applications" ON public.job_applications;

CREATE POLICY "Applicants can view own applications"
ON public.job_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = auth.uid()
      AND lower(trim(ap.email)) = lower(trim(job_applications.applicant_email))
  )
);

DROP POLICY IF EXISTS "Applicants can update own applications" ON public.job_applications;

CREATE POLICY "Applicants can update own applications"
ON public.job_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = auth.uid()
      AND lower(trim(ap.email)) = lower(trim(job_applications.applicant_email))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = auth.uid()
      AND lower(trim(ap.email)) = lower(trim(job_applications.applicant_email))
  )
);

DROP POLICY IF EXISTS "Applicants can view own candidate record" ON public.candidates;

CREATE POLICY "Applicants can view own candidate record"
ON public.candidates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = auth.uid()
      AND lower(trim(ap.email)) = lower(trim(candidates.email))
  )
);

DROP POLICY IF EXISTS "Applicants can update own candidate record" ON public.candidates;

CREATE POLICY "Applicants can update own candidate record"
ON public.candidates
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = auth.uid()
      AND lower(trim(ap.email)) = lower(trim(candidates.email))
  )
);
