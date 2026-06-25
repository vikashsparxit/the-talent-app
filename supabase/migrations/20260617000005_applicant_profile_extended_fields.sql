-- Extended applicant profile fields for portal (personal details)

ALTER TABLE public.applicant_profiles
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS dob_actual DATE,
  ADD COLUMN IF NOT EXISTS dob_documented DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT;

COMMENT ON COLUMN public.applicant_profiles.middle_name IS 'Optional middle name';
COMMENT ON COLUMN public.applicant_profiles.dob_actual IS 'Actual date of birth (optional)';
COMMENT ON COLUMN public.applicant_profiles.dob_documented IS 'Date of birth as on official documents (required at app level)';
COMMENT ON COLUMN public.applicant_profiles.gender IS 'Gender: male, female, non_binary, prefer_not_to_say';
COMMENT ON COLUMN public.applicant_profiles.marital_status IS 'Marital status: single, married, divorced, widowed, separated, prefer_not_to_say';
COMMENT ON COLUMN public.applicant_profiles.blood_group IS 'Blood group: A+, A-, B+, B-, AB+, AB-, O+, O-, unknown';
COMMENT ON COLUMN public.applicant_profiles.emergency_phone IS 'Alternative emergency contact phone';

-- education jsonb shape: [{ degree_name, year_of_completion, board_university, grade }]
-- work_experience jsonb shape extended with reason_for_leaving per entry
