-- ─────────────────────────────────────────────────────────────────────────────
-- KRA 17 — Rejection Intelligence
-- Add rejection_reason column to candidate_interviews
--
-- Run in Supabase Dashboard → SQL Editor.
-- Safe to run multiple times — ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE candidate_interviews
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'candidate_interviews'
  AND column_name = 'rejection_reason';
