-- Allow candidates to be saved without an email address.
-- Email is optional on resumes; recruiters can fill it in later.
-- PostgreSQL UNIQUE allows multiple NULL values, so no constraint change needed.
ALTER TABLE public.candidates ALTER COLUMN email DROP NOT NULL;
