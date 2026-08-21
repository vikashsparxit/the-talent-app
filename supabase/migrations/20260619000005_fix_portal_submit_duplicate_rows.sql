-- Fix PostgreSQL 21000 on portal_submit_job_application:
-- duplicate job_applications rows for (job_id, lower(trim(applicant_email))) make
-- INSERT ... ON CONFLICT update the same logical row twice.

-- Normalize emails before dedupe / unique index enforcement.
UPDATE public.job_applications
SET applicant_email = lower(trim(applicant_email)),
    updated_at = now()
WHERE applicant_email IS NOT NULL
  AND applicant_email <> lower(trim(applicant_email));

-- Repoint digital forms from duplicate applications to the canonical keeper row.
WITH ranked AS (
  SELECT
    id,
    job_id,
    lower(trim(applicant_email)) AS norm_email,
    ROW_NUMBER() OVER (
      PARTITION BY job_id, lower(trim(applicant_email))
      ORDER BY
        (candidate_id IS NOT NULL) DESC,
        CASE source WHEN 'portal' THEN 0 WHEN 'recruiter' THEN 1 ELSE 2 END,
        created_at ASC
    ) AS rn
  FROM public.job_applications
  WHERE applicant_email IS NOT NULL
    AND trim(applicant_email) <> ''
),
keepers AS (
  SELECT id AS keeper_id, job_id, norm_email
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r
  INNER JOIN keepers k
    ON k.job_id = r.job_id
    AND k.norm_email = r.norm_email
  WHERE r.rn > 1
)
UPDATE public.job_application_forms jaf
SET job_application_id = d.keeper_id,
    updated_at = now()
FROM dupes d
WHERE jaf.job_application_id = d.dupe_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_application_forms existing
    WHERE existing.job_application_id = d.keeper_id
  );

-- Keep one row per (job_id, normalized email); prefer linked candidate, then portal source.
DELETE FROM public.job_applications ja
WHERE ja.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY job_id, lower(trim(applicant_email))
        ORDER BY
          (candidate_id IS NOT NULL) DESC,
          CASE source WHEN 'portal' THEN 0 WHEN 'recruiter' THEN 1 ELSE 2 END,
          created_at ASC
      ) AS rn
    FROM public.job_applications
    WHERE applicant_email IS NOT NULL
      AND trim(applicant_email) <> ''
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS public.job_applications_job_id_applicant_email_key;

CREATE UNIQUE INDEX job_applications_job_id_applicant_email_key
  ON public.job_applications (job_id, lower(trim(applicant_email)));

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

    RETURN jsonb_build_object('status', 'already_applied', 'application_id', _existing_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_submit_job_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
