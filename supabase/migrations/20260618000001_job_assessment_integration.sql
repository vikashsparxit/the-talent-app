-- Job-linked assessments: per-job config, assignment enrichment, consent, AI source tracking

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS assessment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_assessment_id UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assessment_config JSONB NOT NULL DEFAULT '{
    "deadline_days": 7,
    "pass_threshold_override": null,
    "notify_recruiter_on_complete": true,
    "require_pass_before_interview": true
  }'::jsonb;

COMMENT ON COLUMN public.jobs.assessment_enabled IS 'When true, job uses linked assessment in hiring workflow';
COMMENT ON COLUMN public.jobs.default_assessment_id IS 'Default assessment assigned manually or as job template';
COMMENT ON COLUMN public.jobs.assessment_config IS 'deadline_days, pass_threshold_override, notify_recruiter_on_complete, require_pass_before_interview';

ALTER TABLE public.candidate_assessments
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_via TEXT CHECK (assigned_via IN ('manual', 'job_default', 'auto_stage')),
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_source TEXT;

COMMENT ON COLUMN public.candidate_assessments.consent_source IS 'e.g. exam_portal_magic_link, exam_portal_applicant';

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS source_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_jobs_default_assessment_id ON public.jobs(default_assessment_id) WHERE default_assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_assessment_enabled ON public.jobs(assessment_enabled) WHERE assessment_enabled = true;
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_job_id ON public.candidate_assessments(job_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_candidate_job ON public.candidate_assessments(candidate_id, job_id);
CREATE INDEX IF NOT EXISTS idx_assessments_source_job_id ON public.assessments(source_job_id) WHERE source_job_id IS NOT NULL;
