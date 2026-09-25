-- Recruiter prescreen policies checked candidates.job_id only, which fails when
-- a candidate is in the pipeline via candidate_interviews but has a different
-- (or null) direct job_id. Expand to also allow access via pipeline job association.

DROP POLICY IF EXISTS "Recruiters can view prescreens for assigned jobs" ON public.candidate_prescreens;
DROP POLICY IF EXISTS "Recruiters can create prescreens for assigned jobs" ON public.candidate_prescreens;
DROP POLICY IF EXISTS "Recruiters can update prescreens for assigned jobs" ON public.candidate_prescreens;

CREATE POLICY "Recruiters can view prescreens for assigned jobs"
ON public.candidate_prescreens FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE c.id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
    WHERE ci.candidate_id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can create prescreens for assigned jobs"
ON public.candidate_prescreens FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE c.id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
    WHERE ci.candidate_id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can update prescreens for assigned jobs"
ON public.candidate_prescreens FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.job_recruiters jr ON jr.job_id = c.job_id
    WHERE c.id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
    WHERE ci.candidate_id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
  )
);
