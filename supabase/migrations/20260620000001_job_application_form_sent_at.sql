-- Track when recruiters email the digital application form link to a candidate

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS form_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.job_applications.form_sent_at IS 'When staff last emailed the candidate a link to complete the digital application form';
