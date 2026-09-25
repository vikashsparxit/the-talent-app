-- Assessment org defaults + AI generation settings (admin Settings UI)

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'assessment_org_defaults',
  '{
    "deadline_days": 7,
    "default_pass_threshold": null,
    "require_pass_before_interview": true,
    "notify_recruiter_on_complete": true
  }'::jsonb,
  'Org-wide assessment defaults for new jobs: deadline, pass threshold, interview gate, recruiter notifications'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'assessment_generation_settings',
  '{
    "global": {
      "section_count": 3,
      "questions_per_section": 2,
      "marks": { "mcq": 5, "coding": 10, "subjective": 10 }
    },
    "tiers": {
      "tech_fresher": {
        "duration_minutes": 60,
        "passing_score": 60,
        "min_coding_questions": 2,
        "max_coding_questions": 3,
        "min_subjective_questions": 1,
        "max_subjective_questions": 2,
        "min_mcq_questions": 1,
        "max_mcq_questions": 2
      },
      "tech_junior": {
        "duration_minutes": 75,
        "passing_score": 60,
        "min_coding_questions": 3,
        "max_coding_questions": 3,
        "min_subjective_questions": 1,
        "max_subjective_questions": 2,
        "min_mcq_questions": 1,
        "max_mcq_questions": 2
      },
      "tech_mid": {
        "duration_minutes": 90,
        "passing_score": 65,
        "min_coding_questions": 3,
        "max_coding_questions": 3,
        "min_subjective_questions": 2,
        "max_subjective_questions": 2,
        "min_mcq_questions": 1,
        "max_mcq_questions": 1
      },
      "tech_senior": {
        "duration_minutes": 90,
        "passing_score": 70,
        "min_coding_questions": 2,
        "max_coding_questions": 3,
        "min_subjective_questions": 2,
        "max_subjective_questions": 3,
        "min_mcq_questions": 1,
        "max_mcq_questions": 2
      },
      "nontech_fresher": {
        "duration_minutes": 60,
        "passing_score": 60,
        "min_coding_questions": 0,
        "max_coding_questions": 0,
        "min_subjective_questions": 2,
        "max_subjective_questions": 4,
        "min_mcq_questions": 2,
        "max_mcq_questions": 4
      },
      "nontech_experienced": {
        "duration_minutes": 75,
        "passing_score": 65,
        "min_coding_questions": 0,
        "max_coding_questions": 0,
        "min_subjective_questions": 3,
        "max_subjective_questions": 5,
        "min_mcq_questions": 1,
        "max_mcq_questions": 2
      }
    }
  }'::jsonb,
  'AI assessment generation: global structure (sections/questions/marks) and per-tier duration, passing score, question-type limits'
)
ON CONFLICT (config_key) DO NOTHING;

-- Staff can read org defaults when creating/editing jobs
DROP POLICY IF EXISTS "Authenticated can read lookup config" ON public.system_config;
CREATE POLICY "Authenticated can read lookup config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (config_key IN (
    'cert_tiers', 'tier1_colleges', 'job_domains', 'job_teams', 'assessment_org_defaults'
  ));

-- Admin RLS: assessment_org_defaults
DROP POLICY IF EXISTS "Admin read assessment org defaults" ON public.system_config;
CREATE POLICY "Admin read assessment org defaults"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key = 'assessment_org_defaults'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin update assessment org defaults" ON public.system_config;
CREATE POLICY "Admin update assessment org defaults"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key = 'assessment_org_defaults'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    config_key = 'assessment_org_defaults'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin insert assessment org defaults" ON public.system_config;
CREATE POLICY "Admin insert assessment org defaults"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key = 'assessment_org_defaults'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Admin RLS: assessment_generation_settings
DROP POLICY IF EXISTS "Admin read assessment generation settings" ON public.system_config;
CREATE POLICY "Admin read assessment generation settings"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (
    config_key = 'assessment_generation_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin update assessment generation settings" ON public.system_config;
CREATE POLICY "Admin update assessment generation settings"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (
    config_key = 'assessment_generation_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    config_key = 'assessment_generation_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admin insert assessment generation settings" ON public.system_config;
CREATE POLICY "Admin insert assessment generation settings"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (
    config_key = 'assessment_generation_settings'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );
