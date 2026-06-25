-- Fix applicant job application form submit (403 on PATCH).
-- UPDATE policy required status = 'pending' for both USING and implicit WITH CHECK,
-- so setting status = 'submitted' on submit violated RLS.

DROP POLICY IF EXISTS "Applicants can update own pending application forms" ON public.job_application_forms;

CREATE POLICY "Applicants can update own pending application forms"
ON public.job_application_forms FOR UPDATE
USING (
  public.applicant_owns_job_application(job_application_id)
  AND status = 'pending'
)
WITH CHECK (
  public.applicant_owns_job_application(job_application_id)
  AND status IN ('pending', 'submitted')
);
