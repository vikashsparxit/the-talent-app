
-- Add candidate_status to candidates table
-- Every candidate (manual or portal) follows: new → reviewing → shortlisted → rejected
ALTER TABLE public.candidates
ADD COLUMN candidate_status text NOT NULL DEFAULT 'new';

-- Sync existing portal applicants' status from job_applications
UPDATE public.candidates c
SET candidate_status = COALESCE(
  (SELECT ja.status FROM public.job_applications ja WHERE ja.candidate_id = c.id ORDER BY ja.created_at DESC LIMIT 1),
  'new'
);

-- Update the auto_create_candidate trigger to also set source
CREATE OR REPLACE FUNCTION public.auto_create_candidate_from_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing_candidate_id uuid;
  _new_candidate_id uuid;
BEGIN
  -- Check if a candidate with this email already exists
  SELECT id INTO _existing_candidate_id
  FROM public.candidates
  WHERE email = NEW.applicant_email
  LIMIT 1;

  IF _existing_candidate_id IS NOT NULL THEN
    -- Link existing candidate to this application
    NEW.candidate_id := _existing_candidate_id;
    -- Update candidate's job_id if not already set
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id),
        source = COALESCE(source, 'portal')
    WHERE id = _existing_candidate_id;
  ELSE
    -- Create new candidate from applicant data
    INSERT INTO public.candidates (name, email, phone, resume_url, job_id, source, candidate_status)
    VALUES (NEW.applicant_name, NEW.applicant_email, NEW.applicant_phone, NEW.resume_url, NEW.job_id, 'portal', 'new')
    RETURNING id INTO _new_candidate_id;

    NEW.candidate_id := _new_candidate_id;
  END IF;

  RETURN NEW;
END;
$function$;
