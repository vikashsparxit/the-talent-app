-- Store the reason a candidate was declined at the Pending Approval stage.
-- Visible to recruiters so they can source more relevant profiles.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pending_approval_decline_reason TEXT DEFAULT NULL;
