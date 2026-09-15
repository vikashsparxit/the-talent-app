-- Admin/HR: email confirmation status from auth.users for Settings → User Roles.
-- Used to show "Confirm Email" only for unconfirmed accounts.

CREATE OR REPLACE FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email_confirmed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, (u.email_confirmed_at IS NOT NULL)
  FROM auth.users u
  WHERE public.is_admin_or_hr(auth.uid())
    AND u.id = ANY(_user_ids);
$$;

REVOKE ALL ON FUNCTION public.get_user_email_confirmation_status(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_email_confirmation_status(uuid[]) TO authenticated;
