
-- Allow all staff (recruiters, interviewers) to view profiles so they can see assignee names
CREATE POLICY "Staff can view all profiles"
ON public.profiles
FOR SELECT
USING (is_staff(auth.uid()));
