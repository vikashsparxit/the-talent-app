-- Track when recruiters email job details to a candidate

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS jd_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.job_applications.jd_sent_at IS 'When staff last emailed the candidate job details for this application';
