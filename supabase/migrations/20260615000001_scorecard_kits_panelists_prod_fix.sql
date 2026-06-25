-- Idempotent prod completion for 20260614000002 + panelists RLS recursion fix.
-- Safe to re-run if scorecard_templates already exists or migration failed partway.

-- ─── Helper: break panelists SELECT recursion (same pattern as has_role / is_recruiter_for_job) ───

CREATE OR REPLACE FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = _candidate_interview_id
      AND cip.interviewer_user_id = _user_id
  )
$$;

-- ─── scorecard_templates (skip CREATE if exists) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorecard_templates_stage_key
  ON public.scorecard_templates(stage_key);

ALTER TABLE public.scorecard_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view scorecard templates" ON public.scorecard_templates;
CREATE POLICY "Staff can view scorecard templates"
  ON public.scorecard_templates FOR SELECT
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin can manage scorecard templates" ON public.scorecard_templates;
CREATE POLICY "Admin can manage scorecard templates"
  ON public.scorecard_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_scorecard_templates_updated_at ON public.scorecard_templates;
CREATE TRIGGER update_scorecard_templates_updated_at
  BEFORE UPDATE ON public.scorecard_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scorecard_templates (stage_key, display_name, criteria, prompt_questions) VALUES
(
  'screening',
  'Screening',
  '[
    {"key": "communication", "label": "Communication", "scale_hint": "Clarity and professionalism"},
    {"key": "role_fit", "label": "Role Fit", "scale_hint": "Alignment with role requirements"},
    {"key": "motivation", "label": "Motivation", "scale_hint": "Interest in SparxIT and the role"}
  ]'::jsonb,
  '[
    "Walk me through your background and what drew you to this role.",
    "What are you looking for in your next opportunity?",
    "What is your notice period and salary expectation?",
    "Why are you interested in SparxIT specifically?"
  ]'::jsonb
),
(
  'technical',
  'Technical Round',
  '[
    {"key": "technical_depth", "label": "Technical Depth", "scale_hint": "Domain knowledge and expertise"},
    {"key": "problem_solving", "label": "Problem Solving", "scale_hint": "Approach to complex problems"},
    {"key": "code_quality", "label": "Code / Design Quality", "scale_hint": "Structure, clarity, best practices"},
    {"key": "system_thinking", "label": "System Thinking", "scale_hint": "Architecture and scalability awareness"}
  ]'::jsonb,
  '[
    "Describe a technically challenging project you led or contributed to.",
    "How would you design [relevant system] for scale and reliability?",
    "Walk through your approach to debugging a production issue.",
    "What trade-offs did you make in a recent technical decision?"
  ]'::jsonb
),
(
  'managerial',
  'Managerial / Panel',
  '[
    {"key": "leadership", "label": "Leadership", "scale_hint": "Influence and team guidance"},
    {"key": "stakeholder_management", "label": "Stakeholder Management", "scale_hint": "Cross-functional collaboration"},
    {"key": "decision_making", "label": "Decision Making", "scale_hint": "Judgment under ambiguity"},
    {"key": "culture_fit", "label": "Culture Fit", "scale_hint": "Values alignment with SparxIT"}
  ]'::jsonb,
  '[
    "Tell me about a time you had to influence without authority.",
    "How do you handle disagreement within your team?",
    "Describe a situation where you had to make a tough call with incomplete information.",
    "What kind of work environment helps you do your best work?"
  ]'::jsonb
),
(
  'hr_final',
  'HR / Final Round',
  '[
    {"key": "culture_fit", "label": "Culture Fit", "scale_hint": "Values and team alignment"},
    {"key": "communication", "label": "Communication", "scale_hint": "Professional presence"},
    {"key": "compensation_alignment", "label": "Compensation Alignment", "scale_hint": "Expectations vs budget"},
    {"key": "overall_potential", "label": "Overall Potential", "scale_hint": "Long-term growth at SparxIT"}
  ]'::jsonb,
  '[
    "What are your career goals for the next 2–3 years?",
    "What would make you accept an offer from us?",
    "Is there anything that would prevent you from joining if we extend an offer?",
    "Do you have any questions about SparxIT or the role?"
  ]'::jsonb
),
(
  'general',
  'General Interview',
  '[
    {"key": "technical", "label": "Technical Skills", "scale_hint": "1=poor, 5=excellent"},
    {"key": "communication", "label": "Communication", "scale_hint": "1=poor, 5=excellent"},
    {"key": "problem_solving", "label": "Problem Solving", "scale_hint": "1=poor, 5=excellent"},
    {"key": "culture_fit", "label": "Culture Fit", "scale_hint": "1=poor, 5=excellent"}
  ]'::jsonb,
  '[
    "Tell me about yourself and your relevant experience.",
    "What are your key strengths for this role?",
    "Describe a challenge you overcame recently.",
    "What questions do you have for us?"
  ]'::jsonb
)
ON CONFLICT (stage_key) DO NOTHING;

GRANT SELECT ON public.scorecard_templates TO authenticated;

-- ─── interview_kits (CREATE IF NOT EXISTS) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_interview_id uuid NOT NULL UNIQUE
    REFERENCES public.candidate_interviews(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL CHECK (source IN ('template', 'gemini')),
  scorecard_template_id uuid REFERENCES public.scorecard_templates(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_kits_interview
  ON public.interview_kits(candidate_interview_id);

ALTER TABLE public.interview_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view interview kits for visible interviews" ON public.interview_kits;
CREATE POLICY "Staff can view interview kits for visible interviews"
  ON public.interview_kits FOR SELECT
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
      WHERE ci.id = interview_kits.candidate_interview_id
        AND jr.recruiter_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.id = interview_kits.candidate_interview_id
        AND ci.interviewer_user_id = auth.uid()
    )
    OR public.is_panelist_for_interview(auth.uid(), interview_kits.candidate_interview_id)
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      JOIN public.candidate_interviewers cint
        ON cint.candidate_id = ci.candidate_id
      WHERE ci.id = interview_kits.candidate_interview_id
        AND cint.interviewer_user_id = auth.uid()
    )
  );

GRANT SELECT ON public.interview_kits TO authenticated;

-- ─── panelists: non-recursive SELECT + authenticated grants ──────────────────

DROP POLICY IF EXISTS "Users can view panelists for visible interviews" ON public.candidate_interview_panelists;
CREATE POLICY "Users can view panelists for visible interviews"
  ON public.candidate_interview_panelists FOR SELECT
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND jr.recruiter_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND ci.interviewer_user_id = auth.uid()
    )
    OR public.is_panelist_for_interview(auth.uid(), candidate_interview_panelists.candidate_interview_id)
  );

DROP POLICY IF EXISTS "Admin HR recruiters manage panelists" ON public.candidate_interview_panelists;
CREATE POLICY "Admin HR recruiters manage panelists"
  ON public.candidate_interview_panelists FOR ALL
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND public.is_recruiter_for_job(auth.uid(), jis.job_id)
    )
  )
  WITH CHECK (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND public.is_recruiter_for_job(auth.uid(), jis.job_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_interview_panelists TO authenticated;

NOTIFY pgrst, 'reload schema';
