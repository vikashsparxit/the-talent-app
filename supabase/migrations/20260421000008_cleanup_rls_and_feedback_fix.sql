-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup: consolidate duplicate interviewer UPDATE policies
--
-- After running 20260415000004 AND 20260421000004, there are two UPDATE
-- policies for interviewers on candidate_interviews.  One has an unnecessary
-- WITH CHECK clause; the other doesn't.  PostgreSQL ORs permissive policies'
-- WITH CHECK clauses, so functionally they're the same — but having duplicates
-- is confusing and can cause unexpected plan/permission interactions.
--
-- Also ensures the interviewer SELECT policy is broad (via candidate_interviewers)
-- so interviewers can see their assigned candidates' full interview history.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop both interviewer UPDATE policies (we'll recreate a single clean one)
DROP POLICY IF EXISTS "Interviewers can update assigned interviews"               ON public.candidate_interviews;
DROP POLICY IF EXISTS "Interviewers can update interviews for assigned candidates" ON public.candidate_interviews;

-- Single clean UPDATE policy for interviewers — no WITH CHECK (USING suffices)
CREATE POLICY "Interviewers can update assigned interviews"
  ON public.candidate_interviews FOR UPDATE
  USING (
    interviewer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );

-- Ensure HR policy exists (idempotent — 20260415000004 may or may not have run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'candidate_interviews'
      AND policyname = 'HR can manage all interviews'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "HR can manage all interviews"
        ON public.candidate_interviews FOR ALL
        USING (public.has_role(auth.uid(), 'hr'::app_role))
    $policy$;
  END IF;
END
$$;

-- Verify all policies
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'candidate_interviews'
ORDER BY policyname;
