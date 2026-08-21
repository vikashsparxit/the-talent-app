-- Copy full parsed candidate profile into applicant_profiles on signup (BEFORE INSERT trigger).

CREATE OR REPLACE FUNCTION public.enrich_applicant_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    _candidate RECORD;
    _name_parts TEXT[];
BEGIN
    SELECT *
    INTO _candidate
    FROM public.candidates
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    ORDER BY updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    NEW.full_name := COALESCE(
        NULLIF(trim(NEW.full_name), ''),
        NULLIF(trim(NEW.full_name), NEW.email),
        NULLIF(trim(_candidate.name), ''),
        NEW.full_name
    );
    NEW.phone := COALESCE(NEW.phone, _candidate.phone);
    NEW.resume_url := COALESCE(NEW.resume_url, _candidate.resume_url);
    NEW.linkedin_url := COALESCE(NULLIF(trim(NEW.linkedin_url), ''), _candidate.linkedin_url);

    IF NEW.work_experience IS NULL OR NEW.work_experience = '[]'::jsonb THEN
        IF _candidate.work_experience IS NOT NULL AND _candidate.work_experience <> '[]'::jsonb THEN
            NEW.work_experience := _candidate.work_experience;
        END IF;
    END IF;

    IF NEW.education IS NULL OR NEW.education = '[]'::jsonb THEN
        IF _candidate.education IS NOT NULL AND _candidate.education <> '[]'::jsonb THEN
            NEW.education := _candidate.education;
        END IF;
    END IF;

    IF NEW.skills IS NULL OR NEW.skills = '[]'::jsonb THEN
        IF _candidate.skills IS NOT NULL AND _candidate.skills <> '[]'::jsonb THEN
            NEW.skills := _candidate.skills;
        ELSIF _candidate.skills_tags IS NOT NULL AND _candidate.skills_tags <> '[]'::jsonb THEN
            NEW.skills := _candidate.skills_tags;
        END IF;
    END IF;

    IF (NEW.first_name IS NULL OR trim(NEW.first_name) = '' OR NEW.first_name LIKE '%@%')
        AND _candidate.name IS NOT NULL
        AND trim(_candidate.name) <> '' THEN
        _name_parts := regexp_split_to_array(trim(_candidate.name), '\s+');
        NEW.first_name := _name_parts[1];
        IF array_length(_name_parts, 1) > 1 THEN
            NEW.last_name := _name_parts[array_length(_name_parts, 1)];
            IF array_length(_name_parts, 1) > 2 THEN
                NEW.middle_name := array_to_string(_name_parts[2:array_length(_name_parts, 1) - 1], ' ');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
