-- Fix infinite RLS recursion between candidate_interview_panelists ↔ candidate_interviews.
--
-- Root cause: cross-table EXISTS subqueries in policies on both tables:
--   panelists SELECT → queries candidate_interviews → interviewer SELECT → queries panelists → ∞
--   interview_kits SELECT → queries candidate_interviews → same cycle
--
-- 20260615000001 added is_panelist_for_interview but left direct cross-table EXISTS on both sides.
-- Fix: SECURITY DEFINER helpers with SET LOCAL row_security = off for all cross-table checks.

-- ─── Helpers (bypass RLS for inner queries) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = _candidate_interview_id
      AND cip.interviewer_user_id = _user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.id = _candidate_interview_id
      AND ci.interviewer_user_id = _user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.id = _candidate_interview_id
      AND public.is_recruiter_for_job(_user_id, jis.job_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.candidate_interviewers cint ON cint.candidate_id = ci.candidate_id
    WHERE ci.id = _candidate_interview_id
      AND cint.interviewer_user_id = _user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_panelist_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_primary_interviewer_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recruiter_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_interviewer_for_interview(uuid, uuid) TO authenticated;

-- ─── candidate_interview_panelists: no direct candidate_interviews subqueries ─

DROP POLICY IF EXISTS "Users can view panelists for visible interviews" ON public.candidate_interview_panelists;
CREATE POLICY "Users can view panelists for visible interviews"
  ON public.candidate_interview_panelists FOR SELECT
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_admin_or_hr(auth.uid())
    OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
    OR public.is_primary_interviewer_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
    OR public.is_panelist_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
  );

DROP POLICY IF EXISTS "Admin HR recruiters manage panelists" ON public.candidate_interview_panelists;
CREATE POLICY "Admin HR recruiters manage panelists"
  ON public.candidate_interview_panelists FOR ALL
  USING (
    public.is_admin_or_hr(auth.uid())
    OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
  )
  WITH CHECK (
    public.is_admin_or_hr(auth.uid())
    OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
  );

-- ─── candidate_interviews: no direct panelists subqueries ─────────────────────

DROP POLICY IF EXISTS "Interviewers can view interviews for assigned candidates" ON public.candidate_interviews;
CREATE POLICY "Interviewers can view interviews for assigned candidates"
  ON public.candidate_interviews FOR SELECT
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_panelist_for_interview(auth.uid(), candidate_interviews.id)
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Interviewers can update assigned interviews" ON public.candidate_interviews;
CREATE POLICY "Interviewers can update assigned interviews"
  ON public.candidate_interviews FOR UPDATE
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_panelist_for_interview(auth.uid(), candidate_interviews.id)
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );

-- ─── interview_kits: no direct candidate_interviews / panelists subqueries ────

DROP POLICY IF EXISTS "Staff can view interview kits for visible interviews" ON public.interview_kits;
CREATE POLICY "Staff can view interview kits for visible interviews"
  ON public.interview_kits FOR SELECT
  USING (
    public.is_admin_or_hr(auth.uid())
    OR public.is_recruiter_for_interview(auth.uid(), interview_kits.candidate_interview_id)
    OR public.is_primary_interviewer_for_interview(auth.uid(), interview_kits.candidate_interview_id)
    OR public.is_panelist_for_interview(auth.uid(), interview_kits.candidate_interview_id)
    OR public.is_assigned_interviewer_for_interview(auth.uid(), interview_kits.candidate_interview_id)
  );

NOTIFY pgrst, 'reload schema';

-- ─── Verification (run manually after applying) ───────────────────────────────
--
-- 1. List current policies (should show no cross-table EXISTS between panelists ↔ interviews):
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('candidate_interview_panelists', 'candidate_interviews', 'interview_kits')
-- ORDER BY tablename, policyname;
--
-- 2. Confirm helpers exist and are granted:
--
-- SELECT proname, prosecdef
-- FROM pg_proc
-- WHERE proname IN (
--   'is_panelist_for_interview',
--   'is_primary_interviewer_for_interview',
--   'is_recruiter_for_interview',
--   'is_assigned_interviewer_for_interview'
-- );
--
-- 3. Smoke test as authenticated user (replace UUIDs):
--
-- SET request.jwt.claim.sub = '<user-uuid>';
-- SET ROLE authenticated;
-- SELECT count(*) FROM public.candidate_interview_panelists;
-- SELECT count(*) FROM public.candidate_interviews;
-- RESET ROLE;
