
-- Add new columns to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS experience_years_range text,
  ADD COLUMN IF NOT EXISTS position_type text DEFAULT 'tech',
  ADD COLUMN IF NOT EXISTS total_openings integer DEFAULT 1;

-- Update default salary_currency to INR
ALTER TABLE public.jobs ALTER COLUMN salary_currency SET DEFAULT 'INR';

-- Update existing jobs with USD currency to INR  
UPDATE public.jobs SET salary_currency = 'INR' WHERE salary_currency = 'USD';
