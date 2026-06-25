-- HR users had no RLS policy on job_recruiters, so they could not:
--   • see which recruiters are assigned to a job (SELECT blocked → empty column)
--   • assign a recruiter to a job (INSERT blocked)
--   • remove or change the primary recruiter (DELETE/UPDATE blocked)
--
-- HR is the leader of the recruitment function and needs full control
-- over recruiter assignment, matching the admin capability.

CREATE POLICY "HR can manage job_recruiters"
ON public.job_recruiters FOR ALL
USING (public.has_role(auth.uid(), 'hr'));
