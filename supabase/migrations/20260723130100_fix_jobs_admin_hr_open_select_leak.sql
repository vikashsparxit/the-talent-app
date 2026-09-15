-- Fix: "Admin/HR can view all jobs" incorrectly allowed ANY authenticated user
-- to SELECT all open jobs via `OR status = 'open'`. That leaked every open job
-- tab to interviewers (and recruiters) despite assigned-job policies.
-- Public/applicant open listings remain on "Public and applicants can view open jobs".

DROP POLICY IF EXISTS "Admin/HR can view all jobs" ON public.jobs;
CREATE POLICY "Admin/HR can view all jobs"
  ON public.jobs FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));
