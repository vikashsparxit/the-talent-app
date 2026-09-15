
-- Allow interviewers to create interview records for candidates they are assigned to
CREATE POLICY "Interviewers can create interviews for assigned candidates"
ON public.candidate_interviews
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_interviews.candidate_id
    AND ci.interviewer_user_id = auth.uid()
  )
  AND interviewer_user_id = auth.uid()
);
