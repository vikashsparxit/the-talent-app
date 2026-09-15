-- Company-wide job priority + Cancelled status.
-- Do not auto-apply. Founder reviews this SQL first.

-- 1) Cancelled: not hiring, not filled. Distinct from closed (completed/filled).
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2) Company-wide list order (lower = higher on Jobs listing).
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Optional note for terminal status (cancelled reason). Not a new status per reason.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS status_note text;

-- Preserve current visual order (created_at DESC = top of Jobs list).
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1)::integer AS rn
  FROM public.jobs
)
UPDATE public.jobs j
SET sort_order = ordered.rn
FROM ordered
WHERE j.id = ordered.id;

CREATE INDEX IF NOT EXISTS jobs_sort_order_idx ON public.jobs (sort_order);

COMMENT ON COLUMN public.jobs.sort_order IS
  'Company-wide Jobs listing priority. Lower values appear first. Admin/HR reorder via drag.';

COMMENT ON COLUMN public.jobs.status_note IS
  'Optional note for terminal status, e.g. cancelled reason (filled internally, role dropped, budget, duplicate, other).';
