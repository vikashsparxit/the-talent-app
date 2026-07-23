-- Applicant portal improvements: skills, notification prefs, multi-document uploads

ALTER TABLE public.applicant_profiles
  ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"application_updates": true, "assessment_reminders": true, "marketing": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.applicant_profiles.skills IS 'Skills extracted from resume or entered manually';
COMMENT ON COLUMN public.applicant_profiles.notification_prefs IS 'Applicant email notification preferences';
COMMENT ON COLUMN public.applicant_profiles.documents IS 'Additional documents: [{id, name, url, type, uploaded_at}]';
