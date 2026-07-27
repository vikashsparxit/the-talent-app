
-- Fix RLS policies on applicant_profiles: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Applicants can view own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Applicants can insert own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Applicants can update own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Admin/HR can view all applicant profiles" ON public.applicant_profiles;

CREATE POLICY "Applicants can view own profile"
  ON public.applicant_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Applicants can insert own profile"
  ON public.applicant_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Applicants can update own profile"
  ON public.applicant_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admin/HR can view all applicant profiles"
  ON public.applicant_profiles FOR SELECT
  USING (is_admin_or_hr(auth.uid()));
