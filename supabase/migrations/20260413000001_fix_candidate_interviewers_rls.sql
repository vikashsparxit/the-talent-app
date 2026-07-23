-- Fix candidate_interviewers RLS:
-- 1. HR role was excluded from the admin policy (has_role only checked 'admin')
-- 2. Recruiter policy used job_recruiters join which no longer reflects access scope
--    (recruiters now have full candidate access per 20260413000000)
--
-- New rules:
--   Admin/HR  → full manage on all candidates
--   Recruiter → full manage on all candidates (mirrors their candidate access)
--   Interviewer → SELECT own assignments only (unchanged)

DROP POLICY IF EXISTS "Admin can manage candidate_interviewers" ON public.candidate_interviewers;
DROP POLICY IF EXISTS "Recruiters can manage interviewers for their jobs" ON public.candidate_interviewers;

-- Admin and HR can manage interviewers for any candidate
CREATE POLICY "Admin and HR can manage candidate_interviewers"
    ON public.candidate_interviewers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'hr')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'hr')
        )
    );

-- Recruiters can manage interviewers for any candidate (full access matches candidate RLS)
CREATE POLICY "Recruiters can manage candidate_interviewers"
    ON public.candidate_interviewers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    );
