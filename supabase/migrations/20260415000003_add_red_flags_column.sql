-- Add red_flags JSONB column to store AI-detected warning signals per candidate.
-- Structure: [{ type: string, message: string, severity: 'low'|'medium'|'high' }]
-- Populated by the enrich-profile edge function on upload.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS red_flags JSONB NOT NULL DEFAULT '[]'::jsonb;
