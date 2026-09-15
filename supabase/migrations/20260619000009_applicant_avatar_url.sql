-- Optional profile photo for applicant portal (reuses existing avatars storage bucket).

ALTER TABLE public.applicant_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.applicant_profiles.avatar_url IS 'Optional profile photo URL in avatars storage bucket';
