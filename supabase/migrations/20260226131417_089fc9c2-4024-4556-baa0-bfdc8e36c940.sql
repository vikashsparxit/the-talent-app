
-- 1. Allow interviewers to INSERT responses for assigned candidates
CREATE POLICY "Interviewers can insert responses for assigned candidates"
ON public.candidate_responses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM candidate_assessments ca
    JOIN candidate_interviewers ci ON ci.candidate_id = ca.candidate_id
    WHERE ca.id = candidate_responses.candidate_assessment_id
      AND ci.interviewer_user_id = auth.uid()
  )
);

-- 2. Allow recruiters to INSERT responses for assigned jobs
CREATE POLICY "Recruiters can insert responses for assigned jobs"
ON public.candidate_responses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM candidate_assessments ca
    JOIN candidates c ON c.id = ca.candidate_id
    JOIN job_recruiters jr ON jr.job_id = c.job_id
    WHERE ca.id = candidate_responses.candidate_assessment_id
      AND jr.recruiter_user_id = auth.uid()
  )
);

-- 3. Grant EXECUTE on calculate_assessment_total_score to authenticated users
-- (the function is SECURITY DEFINER so it runs with owner privileges safely)
GRANT EXECUTE ON FUNCTION public.calculate_assessment_total_score(uuid) TO authenticated;
