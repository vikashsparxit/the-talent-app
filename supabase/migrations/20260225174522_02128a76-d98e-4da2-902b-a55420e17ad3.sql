
-- 1. Create job_recruiters junction table
CREATE TABLE public.job_recruiters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    recruiter_user_id uuid NOT NULL,
    assigned_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(job_id, recruiter_user_id)
);

ALTER TABLE public.job_recruiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage job_recruiters"
    ON public.job_recruiters FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Recruiters can view own assignments"
    ON public.job_recruiters FOR SELECT
    USING (recruiter_user_id = auth.uid());

-- 2. Create candidate_interviewers junction table
CREATE TABLE public.candidate_interviewers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    interviewer_user_id uuid NOT NULL,
    assigned_by uuid,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(candidate_id, interviewer_user_id)
);

ALTER TABLE public.candidate_interviewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage candidate_interviewers"
    ON public.candidate_interviewers FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Recruiters can manage interviewers for their jobs"
    ON public.candidate_interviewers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.candidates c
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE c.id = candidate_interviewers.candidate_id
            AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Interviewers can view own assignments"
    ON public.candidate_interviewers FOR SELECT
    USING (interviewer_user_id = auth.uid());

-- 3. Helper functions
CREATE OR REPLACE FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.job_recruiters
        WHERE recruiter_user_id = _user_id AND job_id = _job_id
    )
$$;

CREATE OR REPLACE FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.candidate_interviewers
        WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
    )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'hr', 'recruiter', 'interviewer')
    )
$$;

-- 4. RLS: Recruiters view assigned jobs
CREATE POLICY "Recruiters can view assigned jobs"
    ON public.jobs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.job_recruiters
            WHERE job_recruiters.job_id = jobs.id
            AND job_recruiters.recruiter_user_id = auth.uid()
        )
    );

-- 5. RLS: Recruiters manage candidates for assigned jobs
CREATE POLICY "Recruiters can view candidates for assigned jobs"
    ON public.candidates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.job_recruiters jr
            WHERE jr.job_id = candidates.job_id AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Recruiters can create candidates for assigned jobs"
    ON public.candidates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.job_recruiters jr
            WHERE jr.job_id = candidates.job_id AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Recruiters can update candidates for assigned jobs"
    ON public.candidates FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.job_recruiters jr
            WHERE jr.job_id = candidates.job_id AND jr.recruiter_user_id = auth.uid()
        )
    );

-- 6. RLS: Interviewers view assigned candidates
CREATE POLICY "Interviewers can view assigned candidates"
    ON public.candidates FOR SELECT
    USING (is_interviewer_for_candidate(auth.uid(), candidates.id));

-- 7. Recruiters/Interviewers view candidate_assessments
CREATE POLICY "Recruiters can view candidate_assessments for assigned jobs"
    ON public.candidate_assessments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.candidates c
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE c.id = candidate_assessments.candidate_id AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Interviewers can view assigned candidate_assessments"
    ON public.candidate_assessments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.candidate_interviewers ci
            WHERE ci.candidate_id = candidate_assessments.candidate_id AND ci.interviewer_user_id = auth.uid()
        )
    );

-- 8. Recruiters/Interviewers view/evaluate responses
CREATE POLICY "Recruiters can view responses for assigned jobs"
    ON public.candidate_responses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.candidate_assessments ca
            JOIN public.candidates c ON c.id = ca.candidate_id
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE ca.id = candidate_responses.candidate_assessment_id AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Recruiters can update responses for assigned jobs"
    ON public.candidate_responses FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.candidate_assessments ca
            JOIN public.candidates c ON c.id = ca.candidate_id
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE ca.id = candidate_responses.candidate_assessment_id AND jr.recruiter_user_id = auth.uid()
        )
    );

CREATE POLICY "Interviewers can view responses for assigned candidates"
    ON public.candidate_responses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.candidate_assessments ca
            JOIN public.candidate_interviewers ci ON ci.candidate_id = ca.candidate_id
            WHERE ca.id = candidate_responses.candidate_assessment_id AND ci.interviewer_user_id = auth.uid()
        )
    );

CREATE POLICY "Interviewers can update responses for assigned candidates"
    ON public.candidate_responses FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.candidate_assessments ca
            JOIN public.candidate_interviewers ci ON ci.candidate_id = ca.candidate_id
            WHERE ca.id = candidate_responses.candidate_assessment_id AND ci.interviewer_user_id = auth.uid()
        )
    );

-- 9. Recruiters manage prescreens for their candidates
CREATE POLICY "Recruiters can view prescreens for assigned jobs"
    ON public.candidate_prescreens FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.candidates c
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE c.id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
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
    );

CREATE POLICY "Recruiters can update prescreens for assigned jobs"
    ON public.candidate_prescreens FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.candidates c
            JOIN public.job_recruiters jr ON jr.job_id = c.job_id
            WHERE c.id = candidate_prescreens.candidate_id AND jr.recruiter_user_id = auth.uid()
        )
    );

-- 10. Indexes
CREATE INDEX idx_job_recruiters_user ON public.job_recruiters(recruiter_user_id);
CREATE INDEX idx_job_recruiters_job ON public.job_recruiters(job_id);
CREATE INDEX idx_candidate_interviewers_user ON public.candidate_interviewers(interviewer_user_id);
CREATE INDEX idx_candidate_interviewers_candidate ON public.candidate_interviewers(candidate_id);
