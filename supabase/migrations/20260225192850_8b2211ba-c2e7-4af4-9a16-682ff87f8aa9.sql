
-- Enums for interview pipeline
CREATE TYPE public.interview_verdict AS ENUM ('proceeded', 'rejected', 'hold', 'no_show');
CREATE TYPE public.interview_mode AS ENUM ('in_person', 'video', 'phone');

-- Reusable interview stage templates (e.g., "Standard Tech Hiring")
CREATE TABLE public.interview_stage_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    stages jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name: "Screening", order: 1}, {name: "Tech Round 1", order: 2}, ...]
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_stage_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage stage templates"
    ON public.interview_stage_templates FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view stage templates"
    ON public.interview_stage_templates FOR SELECT
    USING (public.is_staff(auth.uid()));

-- Job-specific interview stages (which rounds does this job use)
CREATE TABLE public.job_interview_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    stage_name text NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    is_eliminatory boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(job_id, stage_name)
);

CREATE INDEX idx_job_interview_stages_job ON public.job_interview_stages(job_id);

ALTER TABLE public.job_interview_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage job stages"
    ON public.job_interview_stages FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Recruiters can manage stages for assigned jobs"
    ON public.job_interview_stages FOR ALL
    USING (public.is_recruiter_for_job(auth.uid(), job_id));

CREATE POLICY "Staff can view job stages"
    ON public.job_interview_stages FOR SELECT
    USING (public.is_staff(auth.uid()));

-- Candidate interviews: one row per candidate × stage
CREATE TABLE public.candidate_interviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    job_interview_stage_id uuid NOT NULL REFERENCES public.job_interview_stages(id) ON DELETE CASCADE,
    interviewer_user_id uuid,
    verdict interview_verdict,
    overall_score smallint CHECK (overall_score IS NULL OR (overall_score >= 1 AND overall_score <= 10)),
    rating_categories jsonb DEFAULT '{}'::jsonb,  -- {technical: 1-5, communication: 1-5, problem_solving: 1-5, culture_fit: 1-5}
    feedback text,
    interview_mode interview_mode,
    scheduled_at timestamptz,
    completed_at timestamptz,
    advanced_by uuid,  -- recruiter who advanced the candidate
    advanced_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(candidate_id, job_interview_stage_id)
);

CREATE INDEX idx_candidate_interviews_candidate ON public.candidate_interviews(candidate_id);
CREATE INDEX idx_candidate_interviews_stage ON public.candidate_interviews(job_interview_stage_id);
CREATE INDEX idx_candidate_interviews_interviewer ON public.candidate_interviews(interviewer_user_id);

ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all interviews"
    ON public.candidate_interviews FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Recruiters can manage interviews for assigned jobs"
    ON public.candidate_interviews FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.job_interview_stages jis
        JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
        WHERE jis.id = candidate_interviews.job_interview_stage_id
        AND jr.recruiter_user_id = auth.uid()
    ));

CREATE POLICY "Interviewers can view and update assigned interviews"
    ON public.candidate_interviews FOR SELECT
    USING (interviewer_user_id = auth.uid());

CREATE POLICY "Interviewers can update assigned interviews"
    ON public.candidate_interviews FOR UPDATE
    USING (interviewer_user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_interview_stage_templates_updated_at
    BEFORE UPDATE ON public.interview_stage_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_interview_stages_updated_at
    BEFORE UPDATE ON public.job_interview_stages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_interviews_updated_at
    BEFORE UPDATE ON public.candidate_interviews
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
