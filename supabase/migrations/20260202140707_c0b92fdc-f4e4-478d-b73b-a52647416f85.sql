-- Fix the security definer view by using security_invoker = true
DROP VIEW IF EXISTS public.public_job_listings;

CREATE VIEW public.public_job_listings 
WITH (security_invoker = true) AS
SELECT 
    id,
    title,
    description,
    department,
    location,
    job_type,
    experience_level,
    application_deadline,
    created_at,
    updated_at
FROM public.jobs
WHERE status = 'open'::job_status;