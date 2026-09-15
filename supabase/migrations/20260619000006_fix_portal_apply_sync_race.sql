-- Fix false "already applied" on first portal Quick Apply.
--
-- Flow: portal_submit_job_application INSERT → auto_create_candidate_from_application
-- (BEFORE INSERT) inserts candidates → sync_job_application_from_candidate
-- (AFTER INSERT) runs at pg_trigger_depth() > 1 and INSERTs job_applications before
-- the parent row exists, causing unique_violation → already_applied on every first apply.

CREATE OR REPLACE FUNCTION public.sync_job_application_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _app_source TEXT;
BEGIN
  IF NEW.job_id IS NULL OR NEW.email IS NULL OR trim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.job_id IS NOT DISTINCT FROM NEW.job_id
     AND lower(trim(OLD.email)) IS NOT DISTINCT FROM lower(trim(NEW.email))
     AND OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.phone IS NOT DISTINCT FROM NEW.phone
     AND OLD.resume_url IS NOT DISTINCT FROM NEW.resume_url
     AND OLD.candidate_status IS NOT DISTINCT FROM NEW.candidate_status THEN
    RETURN NEW;
  END IF;

  -- Nested call from auto_create_candidate_from_application during job_applications INSERT.
  -- The parent INSERT will create the application row; syncing here races the unique index.
  IF pg_trigger_depth() > 1 THEN
    UPDATE public.job_applications ja
    SET
      candidate_id = COALESCE(ja.candidate_id, NEW.id),
      updated_at = now()
    WHERE ja.job_id = NEW.job_id
      AND lower(trim(ja.applicant_email)) = lower(trim(NEW.email));

    RETURN NEW;
  END IF;

  _app_source := CASE
    WHEN COALESCE(NEW.source, 'recruiter') = 'portal' THEN 'portal'
    ELSE 'recruiter'
  END;

  INSERT INTO public.job_applications (
    job_id,
    candidate_id,
    applicant_name,
    applicant_email,
    applicant_phone,
    resume_url,
    status,
    source
  )
  VALUES (
    NEW.job_id,
    NEW.id,
    NEW.name,
    trim(NEW.email),
    NEW.phone,
    NEW.resume_url,
    COALESCE(NULLIF(NEW.candidate_status, ''), 'new'),
    _app_source
  )
  ON CONFLICT (job_id, lower(trim(applicant_email))) DO UPDATE SET
    candidate_id = COALESCE(public.job_applications.candidate_id, EXCLUDED.candidate_id),
    applicant_name = EXCLUDED.applicant_name,
    applicant_phone = COALESCE(EXCLUDED.applicant_phone, public.job_applications.applicant_phone),
    resume_url = COALESCE(EXCLUDED.resume_url, public.job_applications.resume_url),
    source = CASE
      WHEN public.job_applications.source = 'portal' THEN 'portal'
      ELSE EXCLUDED.source
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Belt-and-suspenders: if a race still surfaces unique_violation, treat portal duplicate
-- as successful apply (idempotent) rather than blocking the applicant.
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
  _new_id UUID;
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
    AND lower(trim(ja.applicant_email)) = _norm_email
  ORDER BY (ja.candidate_id IS NOT NULL) DESC, ja.created_at ASC
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
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
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('status', 'created', 'application_id', _new_id);

EXCEPTION
  WHEN unique_violation THEN
    SELECT ja.id, ja.source
    INTO _existing_id, _existing_source
    FROM public.job_applications ja
    WHERE ja.job_id = p_job_id
      AND lower(trim(ja.applicant_email)) = _norm_email
    ORDER BY (ja.candidate_id IS NOT NULL) DESC, ja.created_at ASC
    LIMIT 1;

    IF _existing_id IS NULL THEN
      RAISE;
    END IF;

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

    -- Sync race or concurrent first apply: refresh profile fields, return success.
    UPDATE public.job_applications
    SET
      applicant_name = p_applicant_name,
      applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
      linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
      resume_url = COALESCE(p_resume_url, resume_url),
      cover_letter = COALESCE(p_cover_letter, cover_letter),
      updated_at = now()
    WHERE id = _existing_id;

    RETURN jsonb_build_object('status', 'created', 'application_id', _existing_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_submit_job_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
