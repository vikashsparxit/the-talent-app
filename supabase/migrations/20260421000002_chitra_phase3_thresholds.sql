-- ─────────────────────────────────────────────────────────────────────────────
-- Chitragupta Phase 3 — add KRA 8–15 thresholds to system_config
--
-- Run in Supabase Dashboard → SQL Editor.
-- Safe to run multiple times — only adds/merges keys.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE system_config
SET config_value = config_value || jsonb_build_object(
  -- KRA 8: Scheduling SLA
  'kra8_schedule_sla_hours', 48,    -- hours after 'proceeded' before next stage must be scheduled

  -- KRA 9: No-Show Follow-Up
  'kra9_noshow_followup_hours', 24, -- hours to take action after a no-show

  -- KRA 10: On-Hold Resolution
  'kra10_hold_days', 7,             -- days on hold before first nudge
  'kra10_level1_hours', 48,         -- hours after level 0 before escalating to HR + SA

  -- KRA 11: Workload Balancing
  'kra11_max_weekly_interviews', 5, -- max weekly interviews before overload flag

  -- KRA 13: Pre-Screen Monitoring
  'kra13_prescreen_days', 3,        -- days in pipeline before pre-screen is required

  -- KRA 14: Assessment Abandonment
  'kra14_invite_days', 3,           -- days invited before flagging as not-started
  'kra14_inprogress_hours', 48,     -- hours in-progress before flagging as stalled

  -- KRA 15: Recruiter Silence
  'kra15_inactivity_days', 5        -- days of zero activity before SA alert
)
WHERE config_key = 'chitra_escalation_thresholds';

-- Verify
SELECT config_key, config_value
FROM system_config
WHERE config_key = 'chitra_escalation_thresholds';
