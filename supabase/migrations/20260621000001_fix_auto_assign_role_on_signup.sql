-- Stop auto-assigning interviewer on signup. Only the first user ever gets admin.
-- Applicants and pending staff have no user_roles row until an admin assigns one.
--
-- ONE-TIME CLEANUP below removes legacy interviewer rows for applicant-only users
-- (auto-assigned before this fix). Super admin should review the DELETE impact
-- before applying this migration in production.

CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'admin');
    END IF;
    RETURN NEW;
END;
$$;

-- Remove interviewer role from users who only have applicant portal access
-- (no genuine staff interviewer flag). Review row count in staging before prod.
DELETE FROM user_roles ur
USING applicant_profiles ap
WHERE ur.user_id = ap.user_id
  AND ur.role = 'interviewer'
  AND COALESCE((SELECT can_conduct_interviews FROM profiles p WHERE p.user_id = ur.user_id), false) = false;
