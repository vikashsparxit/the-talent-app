-- Track when a candidate was explicitly approved into the pipeline from Pending Approval.
-- Used to show a 24-hour "New" badge on pipeline cards after first approval.
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT NULL;
