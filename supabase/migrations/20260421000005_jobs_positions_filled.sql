-- ─────────────────────────────────────────────────────────────────────────────
-- Item 1: Track how many candidates joined when a job is closed
-- Adds positions_filled to the jobs table.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS positions_filled INTEGER NOT NULL DEFAULT 0;

-- Verify
SELECT id, title, status, total_openings, positions_filled
FROM public.jobs
LIMIT 5;
