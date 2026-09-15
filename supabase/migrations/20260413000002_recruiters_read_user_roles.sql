-- Recruiters need to read user_roles to find users with the 'interviewer' role
-- when using the Assign Interviewers dialog. Without this they get an empty
-- dropdown because their SELECT on user_roles returns only their own row.

CREATE POLICY "Recruiters can view user roles"
    ON public.user_roles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'recruiter'
        )
    );
