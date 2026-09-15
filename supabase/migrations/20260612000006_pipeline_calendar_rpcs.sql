-- Pipeline + Calendar: server-side interview fetches (avoids heavy PostgREST nested embeds → 502)

CREATE OR REPLACE FUNCTION public.get_scheduled_interviews(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ci.id,
        'candidate_id', ci.candidate_id,
        'job_interview_stage_id', ci.job_interview_stage_id,
        'interviewer_user_id', ci.interviewer_user_id,
        'scheduled_at', ci.scheduled_at,
        'interview_mode', ci.interview_mode,
        'meeting_link', ci.meeting_link,
        'verdict', ci.verdict,
        'candidate', jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'email', c.email
        ),
        'stage', jsonb_build_object(
          'id', jis.id,
          'stage_name', jis.stage_name,
          'job_id', jis.job_id,
          'job', jsonb_build_object('id', j.id, 'title', j.title)
        ),
        'interviewer', CASE
          WHEN p.user_id IS NOT NULL THEN jsonb_build_object(
            'full_name', p.full_name,
            'email', p.email
          )
          ELSE NULL
        END
      )
      ORDER BY ci.scheduled_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.candidate_interviews ci
  INNER JOIN public.candidates c ON c.id = ci.candidate_id
  INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  INNER JOIN public.jobs j ON j.id = jis.job_id
  LEFT JOIN public.profiles p ON p.user_id = ci.interviewer_user_id
  WHERE ci.scheduled_at IS NOT NULL
    AND ci.removed_from_pipeline_at IS NULL
    AND (p_from IS NULL OR ci.scheduled_at >= p_from)
    AND (p_to IS NULL OR ci.scheduled_at <= p_to);
$$;

CREATE OR REPLACE FUNCTION public.get_job_pipeline_interviews(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ci.id,
        'candidate_id', ci.candidate_id,
        'job_interview_stage_id', ci.job_interview_stage_id,
        'interviewer_user_id', ci.interviewer_user_id,
        'verdict', ci.verdict,
        'overall_score', ci.overall_score,
        'rating_categories', ci.rating_categories,
        'feedback', ci.feedback,
        'artifacts', ci.artifacts,
        'interview_mode', ci.interview_mode,
        'meeting_link', ci.meeting_link,
        'scheduled_at', ci.scheduled_at,
        'completed_at', ci.completed_at,
        'advanced_by', ci.advanced_by,
        'advanced_at', ci.advanced_at,
        'interview_notes', ci.interview_notes,
        'enrolled_at', ci.enrolled_at,
        'created_at', ci.created_at,
        'updated_at', ci.updated_at,
        'sort_order', ci.sort_order,
        'round', ci.round,
        'candidate', jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'email', c.email,
          'role_applied', c.role_applied,
          'resume_url', c.resume_url,
          'candidate_status', c.candidate_status,
          'phone', c.phone,
          'uploaded_by', c.uploaded_by,
          'parse_score', c.parse_score,
          'enrichment_score', c.enrichment_score,
          'suitability_score', c.suitability_score,
          'linkedin_url', c.linkedin_url,
          'experience_years', c.experience_years,
          'candidate_current_role', c.candidate_current_role,
          'candidate_current_company', c.candidate_current_company,
          'skills', c.skills,
          'structured_skills', c.structured_skills,
          'notes', c.notes,
          'owner', CASE
            WHEN op.user_id IS NOT NULL THEN jsonb_build_object('full_name', op.full_name)
            ELSE NULL
          END
        ),
        'job_interview_stage', jsonb_build_object(
          'id', jis.id,
          'job_id', jis.job_id,
          'stage_name', jis.stage_name,
          'order_index', jis.order_index,
          'is_eliminatory', jis.is_eliminatory
        ),
        'interviewer', CASE
          WHEN ip.user_id IS NOT NULL THEN jsonb_build_object(
            'full_name', ip.full_name,
            'email', ip.email
          )
          ELSE NULL
        END
      )
      ORDER BY jis.order_index ASC, ci.sort_order ASC NULLS LAST, ci.created_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.candidate_interviews ci
  INNER JOIN public.job_interview_stages jis
    ON jis.id = ci.job_interview_stage_id
    AND jis.job_id = p_job_id
  INNER JOIN public.candidates c ON c.id = ci.candidate_id
  LEFT JOIN public.profiles ip ON ip.user_id = ci.interviewer_user_id
  LEFT JOIN public.profiles op ON op.user_id = c.uploaded_by
  WHERE ci.removed_from_pipeline_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    array_agg(DISTINCT ci.candidate_id),
    ARRAY[]::uuid[]
  )
  FROM public.candidate_interviews ci
  INNER JOIN public.job_interview_stages jis
    ON jis.id = ci.job_interview_stage_id
    AND jis.job_id = p_job_id
  WHERE ci.removed_from_pipeline_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_scheduled_interviews(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_pipeline_interviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_enrolled_candidate_ids(uuid) TO authenticated;

-- SaaS tenant branding (company logo in header)
INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'business_branding',
  '{"logo_desktop_url": null, "logo_mobile_url": null, "company_name": null}'::jsonb,
  'Tenant branding: company logos for header (desktop + mobile) and display name'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read company assets" ON storage.objects;
CREATE POLICY "Public read company assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Admin upload company assets" ON storage.objects;
CREATE POLICY "Admin upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets'
    AND public.is_admin_or_hr(auth.uid())
  );

DROP POLICY IF EXISTS "Admin update company assets" ON storage.objects;
CREATE POLICY "Admin update company assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets'
    AND public.is_admin_or_hr(auth.uid())
  );

DROP POLICY IF EXISTS "Admin delete company assets" ON storage.objects;
CREATE POLICY "Admin delete company assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets'
    AND public.is_admin_or_hr(auth.uid())
  );
