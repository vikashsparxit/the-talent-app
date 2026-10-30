-- Anonymous readers of public.jobs: public posting fields only.
--
-- The "Public and applicants can view open jobs" policy lets anon read open
-- jobs, and table-level SELECT exposed every column of them: salary range,
-- openings, assessment settings, status_note, created_by. The careers page
-- (usePublicJobs) and public_job_listings only use the columns granted below.
-- Partner integrations use the public-jobs edge function, which selects its
-- own columns with the service role and is unaffected.
--
-- Effect: anon `select=*` on jobs now fails; anon must name these columns.
-- Signed-in roles keep their existing access. Review before applying.

BEGIN;

REVOKE ALL ON TABLE public.jobs FROM anon;

GRANT SELECT (
  id,
  title,
  description,
  domain,
  department,
  location,
  job_type,
  experience_level,
  experience_years_range,
  required_skills,
  application_deadline,
  created_at,
  updated_at,
  status
) ON public.jobs TO anon;

COMMIT;
