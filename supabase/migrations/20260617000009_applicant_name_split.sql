-- Split applicant name into first_name / last_name; keep full_name for backward compatibility

ALTER TABLE public.applicant_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

COMMENT ON COLUMN public.applicant_profiles.first_name IS 'Applicant first name (required at app level)';
COMMENT ON COLUMN public.applicant_profiles.last_name IS 'Applicant last name (required at app level)';

-- Backfill: first word → first_name, remainder → last_name
UPDATE public.applicant_profiles
SET
  first_name = CASE
    WHEN trim(full_name) = '' OR full_name LIKE '%@%' THEN NULL
    WHEN position(' ' IN trim(full_name)) > 0 THEN split_part(trim(full_name), ' ', 1)
    ELSE trim(full_name)
  END,
  last_name = CASE
    WHEN trim(full_name) = '' OR full_name LIKE '%@%' THEN NULL
    WHEN position(' ' IN trim(full_name)) > 0 THEN trim(substring(trim(full_name) FROM position(' ' IN trim(full_name)) + 1))
    ELSE NULL
  END
WHERE first_name IS NULL AND last_name IS NULL;
