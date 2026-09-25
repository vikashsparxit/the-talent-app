
DROP VIEW IF EXISTS public.public_job_listings;

CREATE VIEW public.public_job_listings AS
SELECT
  id,
  title,
  description,
  domain,
  department,
  location,
  job_type,
  experience_level,
  experience_years_range,
  application_deadline,
  created_at,
  updated_at
FROM public.jobs
WHERE status = 'open';

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'job_domains',
  '["Engineering", "Design", "Marketing", "Sales", "Operations", "HR", "Finance", "Product", "Data Science", "DevOps", "QA", "Support"]'::jsonb,
  'List of available domains for job postings. Each domain can contain multiple teams.'
)
ON CONFLICT (config_key) DO NOTHING;
