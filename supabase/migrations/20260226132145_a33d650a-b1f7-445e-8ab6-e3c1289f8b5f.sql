-- Allow interviewers to update candidate_assessments for assigned candidates (override pass/fail)
CREATE POLICY "Interviewers can update assigned candidate_assessments"
ON public.candidate_assessments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_assessments.candidate_id
      AND ci.interviewer_user_id = auth.uid()
  )
);

-- Allow recruiters to update candidate_assessments for assigned jobs (override pass/fail)
CREATE POLICY "Recruiters can update candidate_assessments for assigned jobs"
ON public.candidate_assessments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE c.id = candidate_assessments.candidate_id
      AND jr.recruiter_user_id = auth.uid()
  )
);