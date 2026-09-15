-- Update the auto_create_candidate trigger so that organic applicants
-- (via the careers page) get uploaded_by set to the job's primary recruiter.
-- Previously the field was left NULL for portal candidates.

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
  -- Look up the primary recruiter for this job (may be NULL if no recruiter assigned yet)
  SELECT recruiter_user_id INTO _primary_recruiter_id
  FROM public.job_recruiters
  WHERE job_id = NEW.job_id AND is_primary = true
  LIMIT 1;

  -- Check if a candidate with this email already exists
  SELECT id INTO _existing_candidate_id
  FROM public.candidates
  WHERE email = NEW.applicant_email
  LIMIT 1;

  IF _existing_candidate_id IS NOT NULL THEN
    -- Link existing candidate — do NOT overwrite uploaded_by (original owner stays)
    NEW.candidate_id := _existing_candidate_id;
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id),
        source = COALESCE(source, 'portal')
    WHERE id = _existing_candidate_id;
  ELSE
    -- Create new candidate; set uploaded_by to job's primary recruiter
    INSERT INTO public.candidates (name, email, phone, resume_url, job_id, source, candidate_status, uploaded_by)
    VALUES (NEW.applicant_name, NEW.applicant_email, NEW.applicant_phone, NEW.resume_url, NEW.job_id, 'portal', 'new', _primary_recruiter_id)
    RETURNING id INTO _new_candidate_id;

    NEW.candidate_id := _new_candidate_id;
  END IF;

  RETURN NEW;
END;
$function$;
