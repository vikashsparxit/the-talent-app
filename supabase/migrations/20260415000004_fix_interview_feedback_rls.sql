-- ──────────────────────────────────────────────────────────────
-- Fix feedback submission failures for HR users and interviewers
--
-- Root cause:
--   1. HR role had no UPDATE policy on candidate_interviews at all.
--   2. The interviewer UPDATE policy only checked interviewer_user_id = auth.uid(),
--      but the SELECT policy (added in 20260226121648) also grants interviewers
--      access via candidate_interviewers. This mismatch meant interviewers could
--      *see* an interview card but couldn't *save* feedback on it if
--      interviewer_user_id was unset or pointed to someone else.
-- ──────────────────────────────────────────────────────────────

-- 1. Give HR the same blanket access as Admin
CREATE POLICY "HR can manage all interviews"
  ON public.candidate_interviews FOR ALL
  USING (public.has_role(auth.uid(), 'hr'::app_role));

-- 2. Widen the interviewer UPDATE policy to match the SELECT policy
--    (covers both direct interviewer_user_id assignment and candidate_interviewers membership)
DROP POLICY IF EXISTS "Interviewers can update assigned interviews" ON public.candidate_interviews;

CREATE POLICY "Interviewers can update interviews for assigned candidates"
  ON public.candidate_interviews FOR UPDATE
  USING (
    interviewer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );
