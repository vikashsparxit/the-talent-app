-- The "Recruiters can view user roles" policy added in 20260413000002 queries
-- user_roles inside an RLS policy ON user_roles, causing infinite recursion.
-- PostgreSQL throws an error on any user_roles SELECT, which makes fetchUserRole()
-- return null for everyone, redirecting all users to the applicant portal.
--
-- Fix: replace the raw EXISTS subquery with the existing has_role() SECURITY DEFINER
-- function, which bypasses RLS for its inner query and breaks the recursion.

DROP POLICY IF EXISTS "Recruiters can view user roles" ON public.user_roles;

CREATE POLICY "Recruiters can view user roles"
    ON public.user_roles
    FOR SELECT
    USING (public.has_role(auth.uid(), 'recruiter'));
