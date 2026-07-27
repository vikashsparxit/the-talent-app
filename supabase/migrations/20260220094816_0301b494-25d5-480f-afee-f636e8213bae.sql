-- Create a trigger function that auto-populates applicant profile from candidates table
-- when a new applicant profile is created (on signup)
CREATE OR REPLACE FUNCTION public.enrich_applicant_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    _candidate RECORD;
BEGIN
    -- Look for a matching candidate by email
    SELECT * INTO _candidate
    FROM public.candidates
    WHERE email = NEW.email
    LIMIT 1;
    
    IF FOUND THEN
        -- Update the new applicant profile with candidate data
        NEW.full_name := COALESCE(NULLIF(NEW.full_name, NEW.email), _candidate.name, NEW.full_name);
        NEW.phone := COALESCE(NEW.phone, _candidate.phone);
        NEW.resume_url := COALESCE(NEW.resume_url, _candidate.resume_url);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger fires BEFORE INSERT on applicant_profiles to enrich with candidate data
CREATE TRIGGER enrich_applicant_from_candidate_trigger
BEFORE INSERT ON public.applicant_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enrich_applicant_from_candidate();
