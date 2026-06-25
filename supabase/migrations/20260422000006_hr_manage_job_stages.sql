-- HR users could not add, rename, or delete pipeline stages because the
-- existing "Admin can manage job stages" policy only covers has_role('admin').
-- HR is a manager role and must be able to configure pipeline stages.

CREATE POLICY "HR can manage job stages"
ON public.job_interview_stages FOR ALL
USING (public.has_role(auth.uid(), 'hr'));
