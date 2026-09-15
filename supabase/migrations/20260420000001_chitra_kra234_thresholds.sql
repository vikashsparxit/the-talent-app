-- ─────────────────────────────────────────────────────────────────────────────
-- Chitragupta KRA 2, 3, 4 — add new thresholds to system_config
--
-- Run this in Supabase Dashboard → SQL Editor.
-- Safe to run multiple times — only adds keys that don't exist.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE system_config
SET config_value = config_value || jsonb_build_object(
  -- KRA 2: Stage Stagnation
  'kra2_stagnation_days',   5,     -- days before stagnation alert fires
  'kra2_level1_hours',      48,    -- hours before escalating to HR
  'kra2_level2_hours',      96,    -- hours before super admin flag

  -- KRA 3: Job Deadline Pipeline Risk
  'kra3_deadline_buffer_days', 5,  -- days before deadline to start watching
  'kra3_min_proceeded',        2,  -- minimum proceeded candidates required
  'kra3_level1_hours',         24, -- hours before escalating to HR + SA

  -- KRA 4: Reward & Recognition
  'kra4_feedback_grace_minutes', 120,  -- minutes after interview to count as on-time (2h)
  'kra4_streak_length',          5     -- consecutive on-time submissions to trigger streak praise
)
WHERE config_key = 'chitra_escalation_thresholds';

-- Verify the update
SELECT config_key, config_value
FROM system_config
WHERE config_key = 'chitra_escalation_thresholds';
