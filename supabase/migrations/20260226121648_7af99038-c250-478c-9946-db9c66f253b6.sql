
-- Update the interviewer SELECT policy on candidate_interviews
-- to allow viewing ALL interviews for candidates they are assigned to (via candidate_interviewers)
DROP POLICY "Interviewers can view and update assigned interviews" ON public.candidate_interviews;

CREATE POLICY "Interviewers can view interviews for assigned candidates"
ON public.candidate_interviews
FOR SELECT
USING (
  interviewer_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_interviews.candidate_id
    AND ci.interviewer_user_id = auth.uid()
  )
);
