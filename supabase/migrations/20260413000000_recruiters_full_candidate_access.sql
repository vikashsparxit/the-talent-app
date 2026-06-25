-- Recruiters should have access to the full candidate database.
-- Previously, recruiters were restricted to only seeing candidates for jobs
-- they were explicitly assigned to in job_recruiters. This meant:
--   1. Candidates uploaded without a job_id were invisible to all recruiters.
--   2. HR-uploaded CVs were invisible unless the recruiter was on that job.
--   3. Recruiter INSERT was blocked for candidates without a job assignment.
--
-- Fix: grant recruiters full SELECT/INSERT/UPDATE on candidates and
-- related tables. The uploaded_by / job_recruiters.is_primary columns
-- remain in place for attribution only.

-- ── candidates ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Recruiters can view candidates for assigned jobs" ON public.candidates;
DROP POLICY IF EXISTS "Recruiters can create candidates for assigned jobs" ON public.candidates;
DROP POLICY IF EXISTS "Recruiters can update candidates for assigned jobs" ON public.candidates;

CREATE POLICY "Recruiters can view all candidates"
    ON public.candidates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    );

CREATE POLICY "Recruiters can create candidates"
    ON public.candidates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    );

CREATE POLICY "Recruiters can update candidates"
    ON public.candidates FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    );

-- ── candidate_assessments ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Recruiters can view candidate_assessments for assigned jobs" ON public.candidate_assessments;

CREATE POLICY "Recruiters can view all candidate_assessments"
    ON public.candidate_assessments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'recruiter'
        )
    );

-- Allow recruiters to assign/manage assessments for any candidate
DROP POLICY IF EXISTS "Recruiters can manage candidate_assessments" ON public.candidate_assessments;

CREATE POLICY "Recruiters can manage candidate_assessments"
    ON public.candidate_assessments FOR ALL
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
