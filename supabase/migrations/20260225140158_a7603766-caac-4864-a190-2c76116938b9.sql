-- Fix: Make the trigger function SECURITY DEFINER so it bypasses RLS
-- This is needed because anonymous users inserting job_applications
-- cannot read/write the candidates table due to RLS
CREATE OR REPLACE FUNCTION public.auto_create_candidate_from_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Update candidate's job_id if not already set, and mark source
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id),
        source = COALESCE(source, 'portal'),
        candidate_status = COALESCE(candidate_status, 'new')
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
$$;

-- Patch orphaned job_applications that have no candidate_id linked
UPDATE public.job_applications ja
SET candidate_id = c.id
FROM public.candidates c
WHERE ja.candidate_id IS NULL
  AND c.email = ja.applicant_email;