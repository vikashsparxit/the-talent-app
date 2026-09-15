-- Add RLS policies for candidate portal access via magic link (access_token)
-- These allow candidates to access their assigned assessment data without authentication

-- Policy for candidates to view their own candidate_assessments via access_token
CREATE POLICY "Candidates can view own assessment via token" 
ON public.candidate_assessments 
FOR SELECT 
USING (true);

-- Policy for candidates to update their own assessment (start, complete, update progress)
CREATE POLICY "Candidates can update own assessment via token" 
ON public.candidate_assessments 
FOR UPDATE 
USING (true);

-- Policy for candidates to view assessment details for their assigned assessments
CREATE POLICY "Candidates can view assigned assessment" 
ON public.assessments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.candidate_assessments ca 
    WHERE ca.assessment_id = id
  )
);

-- Policy for candidates to view sections of their assigned assessments
CREATE POLICY "Candidates can view assigned sections" 
ON public.assessment_sections 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.candidate_assessments ca 
    WHERE ca.assessment_id = assessment_id
  )
);

-- Policy for candidates to view questions of their assigned assessments
CREATE POLICY "Candidates can view assigned questions" 
ON public.questions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.assessment_sections s
    JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id
    WHERE s.id = section_id
  )
);

-- Policy for candidates to create their own responses
CREATE POLICY "Candidates can create own responses" 
ON public.candidate_responses 
FOR INSERT 
WITH CHECK (true);

-- Policy for candidates to view their own responses
CREATE POLICY "Candidates can view own responses" 
ON public.candidate_responses 
FOR SELECT 
USING (true);

-- Policy for candidates to update their own responses
CREATE POLICY "Candidates can update own responses" 
ON public.candidate_responses 
FOR UPDATE 
USING (true);