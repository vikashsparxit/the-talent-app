-- Add relocation and work mode preference fields to candidate_prescreens
ALTER TABLE public.candidate_prescreens
  ADD COLUMN IF NOT EXISTS open_to_relocation TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS work_mode_preference TEXT[] DEFAULT NULL;

-- open_to_relocation: 'yes' | 'no' | 'maybe'
-- work_mode_preference: array of 'wfo' | 'wfh' | 'hybrid' | 'flexible'
