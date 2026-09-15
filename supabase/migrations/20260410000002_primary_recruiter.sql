-- Add uploaded_by to candidates (who created this record)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id);

-- Add is_primary to job_recruiters (who is the primary/owning recruiter for this job)
ALTER TABLE public.job_recruiters
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Index for fast primary lookups
CREATE INDEX IF NOT EXISTS idx_job_recruiters_primary ON public.job_recruiters(job_id, is_primary) WHERE is_primary = true;
