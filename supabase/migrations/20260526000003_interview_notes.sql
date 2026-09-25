-- Add interview_notes column to candidate_interviews for manual note-taking
-- Notes are raw/informal, kept separate from the final structured 'feedback' field.
ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS interview_notes TEXT DEFAULT NULL;
