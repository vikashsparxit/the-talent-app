-- Server-side portal apply upsert: matches unique index on (job_id, lower(trim(applicant_email))).
-- Avoids client 409 when recruiter-synced rows are invisible to broken ilike pre-checks.

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
  _norm_email TEXT := lower(trim(p_applicant_email));
  _row public.job_applications%ROWTYPE;
  _new_id UUID;
BEGIN
  IF _norm_email IS NULL OR _norm_email = '' THEN
    RAISE EXCEPTION 'Applicant email is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job is not open for applications' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row
  FROM public.job_applications
  WHERE job_id = p_job_id
    AND lower(trim(applicant_email)) = _norm_email;

  IF FOUND THEN
    IF _row.source IN ('recruiter', 'import') THEN
      UPDATE public.job_applications
      SET
        applicant_email = _norm_email,
        applicant_name = p_applicant_name,
        applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
        linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
        resume_url = COALESCE(p_resume_url, resume_url),
        cover_letter = COALESCE(p_cover_letter, cover_letter),
        updated_at = now()
      WHERE id = _row.id;

      RETURN jsonb_build_object('status', 'updated', 'applicationId', _row.id);
    END IF;

    RETURN jsonb_build_object('status', 'already_applied', 'applicationId', _row.id);
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
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('status', 'created', 'applicationId', _new_id);

EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO _row
    FROM public.job_applications
    WHERE job_id = p_job_id
      AND lower(trim(applicant_email)) = _norm_email;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    IF _row.source IN ('recruiter', 'import') THEN
      UPDATE public.job_applications
      SET
        applicant_email = _norm_email,
        applicant_name = p_applicant_name,
        applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
        linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
        resume_url = COALESCE(p_resume_url, resume_url),
        cover_letter = COALESCE(p_cover_letter, cover_letter),
        updated_at = now()
      WHERE id = _row.id;

      RETURN jsonb_build_object('status', 'updated', 'applicationId', _row.id);
    END IF;

    RETURN jsonb_build_object('status', 'already_applied', 'applicationId', _row.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_submit_job_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
