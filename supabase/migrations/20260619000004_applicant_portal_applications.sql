-- Applicant portal: reliable apply upsert + SECURITY DEFINER list (bypasses RLS visibility gaps).

-- Normalize stored emails so RLS lower(trim()) matching is consistent.
UPDATE public.job_applications
SET applicant_email = lower(trim(applicant_email)),
    updated_at = now()
WHERE applicant_email IS NOT NULL
  AND applicant_email <> lower(trim(applicant_email));

UPDATE public.applicant_profiles
SET email = lower(trim(email)),
    updated_at = now()
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

CREATE OR REPLACE FUNCTION public.portal_submit_job_application(
  p_job_id UUID,
  p_applicant_name TEXT,
  p_applicant_email TEXT,
  p_applicant_phone TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_resume_url TEXT DEFAULT NULL,
  p_cover_letter TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm_email TEXT;
  _existing_id UUID;
  _existing_source TEXT;
  _result_id UUID;
  _result_source TEXT;
BEGIN
  SELECT lower(trim(ap.email)) INTO _norm_email
  FROM public.applicant_profiles ap
  WHERE ap.user_id = auth.uid()
  LIMIT 1;

  IF _norm_email IS NULL OR _norm_email = '' THEN
    _norm_email := lower(trim(p_applicant_email));
  END IF;

  IF _norm_email IS NULL OR _norm_email = '' THEN
    RAISE EXCEPTION 'Applicant email is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job is not open for applications' USING ERRCODE = '22023';
  END IF;

  SELECT ja.id, ja.source
  INTO _existing_id, _existing_source
  FROM public.job_applications ja
  WHERE ja.job_id = p_job_id
    AND lower(trim(ja.applicant_email)) = _norm_email;

  IF FOUND THEN
    IF _existing_source IN ('recruiter', 'import') THEN
      UPDATE public.job_applications
      SET
        applicant_email = _norm_email,
        applicant_name = p_applicant_name,
        applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
        linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
        resume_url = COALESCE(p_resume_url, resume_url),
        cover_letter = COALESCE(p_cover_letter, cover_letter),
        updated_at = now()
      WHERE id = _existing_id;

      RETURN jsonb_build_object('status', 'updated', 'application_id', _existing_id);
    END IF;

    RETURN jsonb_build_object('status', 'already_applied', 'application_id', _existing_id);
  END IF;

  INSERT INTO public.job_applications (
    job_id,
    applicant_name,
    applicant_email,
    applicant_phone,
    linkedin_url,
    resume_url,
    cover_letter,
    source
  )
  VALUES (
    p_job_id,
    p_applicant_name,
    _norm_email,
    p_applicant_phone,
    p_linkedin_url,
    p_resume_url,
    p_cover_letter,
    'portal'
  )
  ON CONFLICT (job_id, lower(trim(applicant_email))) DO UPDATE SET
    applicant_email = _norm_email,
    applicant_name = EXCLUDED.applicant_name,
    applicant_phone = COALESCE(EXCLUDED.applicant_phone, public.job_applications.applicant_phone),
    linkedin_url = COALESCE(EXCLUDED.linkedin_url, public.job_applications.linkedin_url),
    resume_url = COALESCE(EXCLUDED.resume_url, public.job_applications.resume_url),
    cover_letter = COALESCE(EXCLUDED.cover_letter, public.job_applications.cover_letter),
    updated_at = now()
  WHERE public.job_applications.source IN ('recruiter', 'import')
  RETURNING id, source INTO _result_id, _result_source;

  IF NOT FOUND THEN
    SELECT ja.id INTO _result_id
    FROM public.job_applications ja
    WHERE ja.job_id = p_job_id
      AND lower(trim(ja.applicant_email)) = _norm_email;

    RETURN jsonb_build_object('status', 'already_applied', 'application_id', _result_id);
  END IF;

  IF _result_source IN ('recruiter', 'import') THEN
    RETURN jsonb_build_object('status', 'updated', 'application_id', _result_id);
  END IF;

  RETURN jsonb_build_object('status', 'created', 'application_id', _result_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_job_applications()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY sort_created_at DESC),
    '[]'::jsonb
  )
  INTO _result
  FROM (
    SELECT
      ja.created_at AS sort_created_at,
      to_jsonb(ja) || jsonb_build_object(
        'job',
        CASE
          WHEN j.id IS NOT NULL THEN jsonb_build_object(
            'id', j.id,
            'title', j.title,
            'department', j.department,
            'location', j.location,
            'job_type', j.job_type,
            'require_digital_application_form', j.require_digital_application_form
          )
          ELSE NULL
        END
      ) AS row_data
    FROM public.job_applications ja
    INNER JOIN public.applicant_profiles ap
      ON lower(trim(ap.email)) = lower(trim(ja.applicant_email))
    LEFT JOIN public.jobs j ON j.id = ja.job_id
    WHERE ap.user_id = auth.uid()
  ) rows;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_submit_job_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_my_job_applications() TO authenticated;
