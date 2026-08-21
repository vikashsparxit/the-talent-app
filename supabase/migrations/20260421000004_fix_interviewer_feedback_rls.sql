-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Add UPDATE RLS policy for interviewers on candidate_interviews
--
-- The original "Interviewers can view and update assigned interviews" policy
-- was dropped in migration 20260226121648 and only a SELECT policy was added
-- in its place. No UPDATE policy was ever re-created, so interviewer feedback
-- submissions silently fail (RLS blocks the UPDATE, returns 0 rows affected).
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old policy if it somehow still exists (idempotency)
DROP POLICY IF EXISTS "Interviewers can update assigned interviews" ON public.candidate_interviews;

-- Allow interviewers to update interviews that are assigned to them
CREATE POLICY "Interviewers can update assigned interviews"
ON public.candidate_interviews
FOR UPDATE
USING (
  interviewer_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_interviews.candidate_id
    AND ci.interviewer_user_id = auth.uid()
  )
)
WITH CHECK (
  interviewer_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_interviews.candidate_id
    AND ci.interviewer_user_id = auth.uid()
  )
);

-- Verify
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'candidate_interviews'
ORDER BY policyname;
