-- Security hardening: system_config anon leak + private storage buckets

-- ── 1. system_config: remove anon read-all ───────────────────────────────────

DROP POLICY IF EXISTS "Anon can read config for edge functions" ON public.system_config;

-- ── 2. Staff helper for storage policies ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_staff_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'recruiter', 'interviewer')
  );
$$;

-- ── 3. resumes bucket: private, scoped access ────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "Anyone can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view resumes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete resumes" ON storage.objects;

CREATE POLICY "Anon and authenticated can upload resumes"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "Staff can read resumes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_staff_user(auth.uid())
  );

CREATE POLICY "Applicants can read own resume"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1
      FROM public.candidates c
      WHERE c.email = (auth.jwt() ->> 'email')
        AND (
          c.resume_url LIKE '%/' || storage.objects.name
          OR c.resume_url = storage.objects.name
        )
    )
  );

CREATE POLICY "Staff can delete resumes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_staff_user(auth.uid())
  );

-- ── 4. interview-artifacts bucket: private ───────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'interview-artifacts';

DROP POLICY IF EXISTS "Authenticated users can read interview artifacts" ON storage.objects;

CREATE POLICY "Staff can read interview artifacts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'interview-artifacts'
    AND public.is_staff_user(auth.uid())
  );
