-- Add deactivation fields to profiles for user offboarding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by  UUID       DEFAULT NULL;

-- Index for fast active-user lookups
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles (is_active);
