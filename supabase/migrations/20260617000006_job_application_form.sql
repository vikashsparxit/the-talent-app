-- Digital job application pre-screen form (question bank + per-application responses)

CREATE TABLE public.prescreen_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key TEXT NOT NULL UNIQUE,
  question_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_hint INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.job_application_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_application_id UUID NOT NULL UNIQUE REFERENCES public.job_applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted')),
  assigned_question_keys TEXT[] NOT NULL DEFAULT '{}',
  employment_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  filled_by_recruiter BOOLEAN NOT NULL DEFAULT false,
  filled_by_user_id UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.job_application_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.job_application_forms(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, question_key)
);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS require_digital_application_form BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.jobs.require_digital_application_form IS 'When true, applicants must complete the digital job application form before interviews';

-- Seed question bank ({{company_name}} substituted at display time)
INSERT INTO public.prescreen_question_bank (question_key, question_text, sort_hint) VALUES
  ('about_yourself', 'Write a brief about yourself', 1),
  ('typical_day', 'What does a typical day look like in your current job role?', 2),
  ('success_qualities', 'What qualities and attributes does someone need to be successful in your current job role?', 3),
  ('greatest_achievement', 'Describe your greatest achievement till yet', 4),
  ('growth_vision', 'How would you want to grow in {{company_name}}? and How would you achieve that vision?', 5),
  ('interest_in_company', 'What interested you in interviewing or working here in {{company_name}}?', 6),
  ('biggest_challenge', 'What do you think would be the biggest challenge if you got this job?', 7),
  ('next_career_move', 'What are you looking for in your next career move? / Describe the workplace where you''ll be the most happy and productive?', 8),
  ('on_time_vs_perfect', 'What''s more important: Delivering a project on time and "good enough" or delaying until it''s perfect?', 9);

-- RLS
ALTER TABLE public.prescreen_question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_application_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_application_responses ENABLE ROW LEVEL SECURITY;

-- Question bank: active questions readable by all authenticated + anon (careers/portal)
CREATE POLICY "Anyone can read active question bank"
ON public.prescreen_question_bank FOR SELECT
USING (is_active = true);

CREATE POLICY "Admin/HR can manage question bank"
ON public.prescreen_question_bank FOR ALL
USING (is_admin_or_hr(auth.uid()))
WITH CHECK (is_admin_or_hr(auth.uid()));

-- Helper: applicant owns the linked job application
CREATE OR REPLACE FUNCTION public.applicant_owns_job_application(_application_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.applicant_profiles ap ON ap.email = ja.applicant_email
    WHERE ja.id = _application_id AND ap.user_id = auth.uid()
  );
$$;

-- Helper: staff can access form via job assignment
CREATE OR REPLACE FUNCTION public.staff_can_access_job_application(_application_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.job_applications ja
      JOIN public.job_recruiters jr ON jr.job_id = ja.job_id
      WHERE ja.id = _application_id AND jr.recruiter_user_id = auth.uid()
    );
$$;

-- job_application_forms policies
CREATE POLICY "Applicants can view own application forms"
ON public.job_application_forms FOR SELECT
USING (public.applicant_owns_job_application(job_application_id));

CREATE POLICY "Applicants can insert own application forms"
ON public.job_application_forms FOR INSERT
WITH CHECK (public.applicant_owns_job_application(job_application_id));

CREATE POLICY "Applicants can update own pending application forms"
ON public.job_application_forms FOR UPDATE
USING (
  public.applicant_owns_job_application(job_application_id)
  AND status = 'pending'
);

CREATE POLICY "Staff can view application forms for assigned jobs"
ON public.job_application_forms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.id = job_application_forms.job_application_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

CREATE POLICY "Staff can insert application forms for assigned jobs"
ON public.job_application_forms FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.id = job_application_forms.job_application_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

CREATE POLICY "Staff can update application forms for assigned jobs"
ON public.job_application_forms FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.id = job_application_forms.job_application_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

-- job_application_responses policies
CREATE POLICY "Applicants can view own application responses"
ON public.job_application_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    WHERE jaf.id = job_application_responses.form_id
      AND public.applicant_owns_job_application(jaf.job_application_id)
  )
);

CREATE POLICY "Applicants can insert own application responses"
ON public.job_application_responses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    WHERE jaf.id = job_application_responses.form_id
      AND public.applicant_owns_job_application(jaf.job_application_id)
      AND jaf.status = 'pending'
  )
);

CREATE POLICY "Applicants can update own application responses"
ON public.job_application_responses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    WHERE jaf.id = job_application_responses.form_id
      AND public.applicant_owns_job_application(jaf.job_application_id)
      AND jaf.status = 'pending'
  )
);

CREATE POLICY "Staff can view application responses for assigned jobs"
ON public.job_application_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    JOIN public.job_applications ja ON ja.id = jaf.job_application_id
    WHERE jaf.id = job_application_responses.form_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

CREATE POLICY "Staff can insert application responses for assigned jobs"
ON public.job_application_responses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    JOIN public.job_applications ja ON ja.id = jaf.job_application_id
    WHERE jaf.id = job_application_responses.form_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

CREATE POLICY "Staff can update application responses for assigned jobs"
ON public.job_application_responses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.job_application_forms jaf
    JOIN public.job_applications ja ON ja.id = jaf.job_application_id
    WHERE jaf.id = job_application_responses.form_id
      AND public.staff_can_access_job_application(ja.id)
  )
);

CREATE TRIGGER update_job_application_forms_updated_at
BEFORE UPDATE ON public.job_application_forms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_application_responses_updated_at
BEFORE UPDATE ON public.job_application_responses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_job_application_forms_status ON public.job_application_forms(status);
CREATE INDEX idx_job_application_forms_job_application_id ON public.job_application_forms(job_application_id);
CREATE INDEX idx_job_application_responses_form_id ON public.job_application_responses(form_id);

GRANT SELECT ON public.prescreen_question_bank TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_application_forms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_application_responses TO authenticated;
