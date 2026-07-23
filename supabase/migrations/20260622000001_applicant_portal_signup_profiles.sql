-- Applicant portal signups set auth raw_user_meta_data.portal = 'applicant', but applicant_profiles
-- was only created client-side after session (ensureApplicantProfile). Unconfirmed or duplicate
-- signups left orphan auth.users + profiles rows with no applicant_profiles — they showed in
-- Settings → Staff → Pending Approval because the pending filter only checked applicant_profiles.

-- 1) Create applicant_profiles at signup when portal metadata is present
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email);

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, _full_name, NEW.email);

  IF COALESCE(NEW.raw_user_meta_data ->> 'portal', '') = 'applicant' THEN
    INSERT INTO public.applicant_profiles (user_id, email, full_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(_full_name, split_part(COALESCE(NEW.email, ''), '@', 1), 'Applicant')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Backfill orphan applicant-portal auth users (e.g. duplicate typo signups)
INSERT INTO public.applicant_profiles (user_id, email, full_name)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    split_part(COALESCE(u.email, ''), '@', 1),
    'Applicant'
  )
FROM auth.users u
WHERE COALESCE(u.raw_user_meta_data ->> 'portal', '') = 'applicant'
  AND NOT EXISTS (
    SELECT 1 FROM public.applicant_profiles ap WHERE ap.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;

-- 3) Admin/HR RPC: portal auth users for Settings pending filter (metadata source of truth)
CREATE OR REPLACE FUNCTION public.get_applicant_portal_auth_users()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE COALESCE(u.raw_user_meta_data ->> 'portal', '') = 'applicant'
    AND public.is_admin_or_hr(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_applicant_portal_auth_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_applicant_portal_auth_users() TO authenticated;

-- 4) Backfill applicant_profiles from job application emails (orphan profiles, no portal metadata)
INSERT INTO public.applicant_profiles (user_id, email, full_name)
SELECT DISTINCT ON (lower(trim(p.email)))
  p.user_id,
  trim(p.email),
  COALESCE(NULLIF(trim(p.full_name), ''), trim(p.email))
FROM public.profiles p
INNER JOIN public.job_applications ja
  ON lower(trim(ja.applicant_email)) = lower(trim(p.email))
WHERE trim(COALESCE(p.email, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.applicant_profiles ap
    WHERE ap.user_id = p.user_id
       OR lower(trim(ap.email)) = lower(trim(p.email))
  )
ORDER BY lower(trim(p.email)), p.user_id
ON CONFLICT (user_id) DO NOTHING;

-- 5) Admin/HR: register orphan profile as applicant (Settings → Pending → Applicant portal button)
CREATE OR REPLACE FUNCTION public.register_profile_as_applicant(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  existing_user_id uuid;
BEGIN
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT user_id, email, full_name INTO p
  FROM public.profiles
  WHERE user_id = _target_user_id;

  IF p IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p.email IS NULL OR trim(p.email) = '' THEN
    RAISE EXCEPTION 'Profile has no email';
  END IF;

  SELECT user_id INTO existing_user_id
  FROM public.applicant_profiles
  WHERE lower(trim(email)) = lower(trim(p.email))
    AND user_id != _target_user_id
  LIMIT 1;

  IF existing_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Applicant profile already exists for this email on another account';
  END IF;

  INSERT INTO public.applicant_profiles (user_id, email, full_name)
  VALUES (
    _target_user_id,
    trim(p.email),
    COALESCE(NULLIF(trim(p.full_name), ''), trim(p.email))
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_profile_as_applicant(uuid) TO authenticated;
