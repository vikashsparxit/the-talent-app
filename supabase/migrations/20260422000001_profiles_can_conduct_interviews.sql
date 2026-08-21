-- Add can_conduct_interviews flag to profiles
-- Allows any user (regardless of role) to be assigned as an interviewer
-- Backfills existing interviewer-role users to true

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_conduct_interviews BOOLEAN NOT NULL DEFAULT false;

-- Backfill: users with role = 'interviewer' should default to true
UPDATE profiles p
SET can_conduct_interviews = true
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = p.user_id
    AND ur.role = 'interviewer'
);
