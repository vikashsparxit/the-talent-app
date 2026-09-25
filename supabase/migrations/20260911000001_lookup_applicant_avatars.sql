-- Staff-only lookup of applicant portal photos (email + avatar_url).
-- Avoids granting recruiters/interviewers SELECT on full applicant_profiles rows.

CREATE OR REPLACE FUNCTION public.lookup_applicant_avatars(p_emails text[])
RETURNS TABLE(email text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(ap.email)) AS email, ap.avatar_url
  FROM public.applicant_profiles ap
  WHERE public.is_staff_user(auth.uid())
    AND ap.avatar_url IS NOT NULL
    AND lower(trim(ap.email)) IN (
      SELECT lower(trim(e))
      FROM unnest(COALESCE(p_emails, ARRAY[]::text[])) AS e
      WHERE e IS NOT NULL AND btrim(e) <> ''
    );
$$;

REVOKE ALL ON FUNCTION public.lookup_applicant_avatars(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_applicant_avatars(text[]) TO authenticated;

COMMENT ON FUNCTION public.lookup_applicant_avatars(text[]) IS
  'Returns portal avatar URLs for the given emails. Staff only; does not expose other applicant_profiles columns.';
