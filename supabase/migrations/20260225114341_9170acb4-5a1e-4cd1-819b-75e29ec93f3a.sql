
-- Auto-create candidate record when a job application is submitted
CREATE OR REPLACE FUNCTION public.auto_create_candidate_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    -- Update candidate's job_id if not already set
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id)
    WHERE id = _existing_candidate_id;
  ELSE
    -- Create new candidate from applicant data
    INSERT INTO public.candidates (name, email, phone, resume_url, job_id, source)
    VALUES (NEW.applicant_name, NEW.applicant_email, NEW.applicant_phone, NEW.resume_url, NEW.job_id, 'portal')
    RETURNING id INTO _new_candidate_id;

    NEW.candidate_id := _new_candidate_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on job_applications insert
CREATE TRIGGER auto_candidate_on_application
BEFORE INSERT ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_candidate_from_application();
