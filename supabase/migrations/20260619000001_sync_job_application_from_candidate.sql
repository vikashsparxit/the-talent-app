-- Bridge recruiter-added candidates to job_applications so digital form flow works both ways.
-- Portal apply: job_applications INSERT → auto_create_candidate (existing).
-- Recruiter path: candidates INSERT/UPDATE → sync_job_application_from_candidate (this migration).

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'portal'
  CHECK (source IN ('portal', 'recruiter', 'import'));

COMMENT ON COLUMN public.job_applications.source IS 'How the application was created: portal (careers), recruiter (manual add), import';

-- Remove duplicate (job_id, applicant_email) rows before UNIQUE constraint.
-- Prefer rows with candidate_id linked, then earliest created_at.
DELETE FROM public.job_applications ja
WHERE ja.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY job_id, lower(trim(applicant_email))
        ORDER BY (candidate_id IS NOT NULL) DESC, created_at ASC
      ) AS rn
    FROM public.job_applications
  ) ranked
  WHERE rn > 1
);

-- Backfill job_applications for existing candidates linked to a job.
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
SELECT
  c.job_id,
  c.id,
  c.name,
  c.email,
  c.phone,
  c.resume_url,
  COALESCE(NULLIF(c.candidate_status, ''), 'new'),
  CASE WHEN COALESCE(c.source, 'recruiter') = 'portal' THEN 'portal' ELSE 'recruiter' END
FROM public.candidates c
WHERE c.job_id IS NOT NULL
  AND c.email IS NOT NULL
  AND trim(c.email) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    WHERE ja.job_id = c.job_id
      AND lower(trim(ja.applicant_email)) = lower(trim(c.email))
  );

-- Link candidate_id on existing applications matched by email + job when missing.
UPDATE public.job_applications ja
SET candidate_id = c.id,
    updated_at = now()
FROM public.candidates c
WHERE ja.candidate_id IS NULL
  AND c.job_id = ja.job_id
  AND lower(trim(c.email)) = lower(trim(ja.applicant_email));

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_job_id_applicant_email_key
  ON public.job_applications (job_id, lower(trim(applicant_email)));

-- Sync job_applications when a candidate is linked to a job (recruiter / import path).
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

DROP TRIGGER IF EXISTS sync_job_application_on_candidate ON public.candidates;

CREATE TRIGGER sync_job_application_on_candidate
AFTER INSERT OR UPDATE OF job_id, email, name, phone, resume_url, candidate_status
ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.sync_job_application_from_candidate();

-- When portal apply links an existing candidate, ensure job_application.candidate_id stays in sync
-- without creating duplicate candidates (coordination with auto_create_candidate_from_application).
CREATE OR REPLACE FUNCTION public.auto_create_candidate_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_candidate_id uuid;
  _new_candidate_id uuid;
  _primary_recruiter_id uuid;
BEGIN
  SELECT recruiter_user_id INTO _primary_recruiter_id
  FROM public.job_recruiters
  WHERE job_id = NEW.job_id AND is_primary = true
  LIMIT 1;

  SELECT id INTO _existing_candidate_id
  FROM public.candidates
  WHERE lower(trim(email)) = lower(trim(NEW.applicant_email))
  LIMIT 1;

  IF _existing_candidate_id IS NOT NULL THEN
    NEW.candidate_id := _existing_candidate_id;
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id),
        source = COALESCE(source, 'portal')
    WHERE id = _existing_candidate_id;
  ELSE
    INSERT INTO public.candidates (name, email, phone, resume_url, job_id, source, candidate_status, uploaded_by)
    VALUES (
      NEW.applicant_name,
      trim(NEW.applicant_email),
      NEW.applicant_phone,
      NEW.resume_url,
      NEW.job_id,
      'portal',
      'new',
      _primary_recruiter_id
    )
    RETURNING id INTO _new_candidate_id;

    NEW.candidate_id := _new_candidate_id;
  END IF;

  RETURN NEW;
END;
$function$;
