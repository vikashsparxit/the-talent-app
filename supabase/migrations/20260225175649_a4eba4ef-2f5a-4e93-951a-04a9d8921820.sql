
-- Task 5: Fill RLS gaps for recruiters

-- 1. Recruiters can view job_applications for their assigned jobs
CREATE POLICY "Recruiters can view applications for assigned jobs"
ON public.job_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_recruiters jr
    WHERE jr.job_id = job_applications.job_id
    AND jr.recruiter_user_id = auth.uid()
  )
);

-- 2. Recruiters can update job_applications for their assigned jobs
CREATE POLICY "Recruiters can update applications for assigned jobs"
ON public.job_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.job_recruiters jr
    WHERE jr.job_id = job_applications.job_id
    AND jr.recruiter_user_id = auth.uid()
  )
);

-- 3. Recruiters can create candidate_assessments for candidates in their assigned jobs
CREATE POLICY "Recruiters can create candidate_assessments for assigned jobs"
ON public.candidate_assessments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE c.id = candidate_assessments.candidate_id
    AND jr.recruiter_user_id = auth.uid()
  )
);

-- 4. Recruiters can view assessments (read-only, needed to assign them)
CREATE POLICY "Recruiters can view active assessments"
ON public.assessments
FOR SELECT
USING (is_staff(auth.uid()));

-- 5. Recruiters can view assessment sections for assessments they can see
CREATE POLICY "Recruiters can view assessment sections"
ON public.assessment_sections
FOR SELECT
USING (is_staff(auth.uid()));

-- 6. Interviewers can view assessment sections for assigned candidates
CREATE POLICY "Interviewers can view sections for assigned candidates"
ON public.assessment_sections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.candidate_assessments ca
    JOIN public.candidate_interviewers ci ON ci.candidate_id = ca.candidate_id
    WHERE ca.assessment_id = assessment_sections.assessment_id
    AND ci.interviewer_user_id = auth.uid()
  )
);

-- 7. Interviewers can view questions for assigned candidates
CREATE POLICY "Interviewers can view questions for assigned candidates"
ON public.questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assessment_sections s
    JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id
    JOIN public.candidate_interviewers ci ON ci.candidate_id = ca.candidate_id
    WHERE s.id = questions.section_id
    AND ci.interviewer_user_id = auth.uid()
  )
);

-- 8. Recruiters can view questions (needed for evaluations)
CREATE POLICY "Recruiters can view questions for assigned jobs"
ON public.questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assessment_sections s
    JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id
    JOIN public.candidates c ON c.id = ca.candidate_id
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE s.id = questions.section_id
    AND jr.recruiter_user_id = auth.uid()
  )
);

-- 9. Interviewers can view candidate_assessments for assigned candidates (already exists, skip)
-- 10. Interviewers can view candidate_prescreens for assigned candidates
CREATE POLICY "Interviewers can view prescreens for assigned candidates"
ON public.candidate_prescreens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.candidate_interviewers ci
    WHERE ci.candidate_id = candidate_prescreens.candidate_id
    AND ci.interviewer_user_id = auth.uid()
  )
);
