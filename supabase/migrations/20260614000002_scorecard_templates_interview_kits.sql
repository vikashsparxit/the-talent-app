-- Tier 1 ATS scorecard templates + read-only interview kits

-- ─── Scorecard templates (stage-keyed, static defaults for v1) ───────────────

CREATE TABLE public.scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ "key": "technical", "label": "Technical Skills", "scale_hint": "1=poor, 5=excellent" }]
  prompt_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- ["Tell me about a challenging project…"]
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scorecard_templates_stage_key ON public.scorecard_templates(stage_key);

ALTER TABLE public.scorecard_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view scorecard templates"
  ON public.scorecard_templates FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Admin can manage scorecard templates"
  ON public.scorecard_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_scorecard_templates_updated_at
  BEFORE UPDATE ON public.scorecard_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates (admin can edit later)
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
);

-- ─── Interview kits (one per scheduled interview, read-only) ─────────────────

CREATE TABLE public.interview_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_interview_id uuid NOT NULL UNIQUE
    REFERENCES public.candidate_interviews(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL CHECK (source IN ('template', 'gemini')),
  scorecard_template_id uuid REFERENCES public.scorecard_templates(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_kits_interview ON public.interview_kits(candidate_interview_id);

ALTER TABLE public.interview_kits ENABLE ROW LEVEL SECURITY;

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
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.candidate_interview_panelists cip
        ON cip.candidate_interview_id = ci.id
      WHERE ci.id = interview_kits.candidate_interview_id
        AND cip.interviewer_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      JOIN public.candidate_interviewers cint
        ON cint.candidate_id = ci.candidate_id
      WHERE ci.id = interview_kits.candidate_interview_id
        AND cint.interviewer_user_id = auth.uid()
    )
  );

-- Kits are written by edge functions (service role); no client INSERT/UPDATE policies for v1

GRANT SELECT ON public.scorecard_templates TO authenticated;
GRANT SELECT ON public.interview_kits TO authenticated;
