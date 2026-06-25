-- Add meeting_link column to candidate_interviews for video call URLs
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;
