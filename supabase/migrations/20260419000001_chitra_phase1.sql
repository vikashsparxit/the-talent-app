-- ──────────────────────────────────────────────────────────────────────────────
-- Chitragupta (Chitra) — AI HR Manager, Phase 1
-- ──────────────────────────────────────────────────────────────────────────────

-- ── A. Super admin flag ───────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- ── B. Chitra escalations table ───────────────────────────────────────────────
CREATE TABLE public.chitra_escalations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_type    TEXT        NOT NULL DEFAULT 'overdue_feedback',
  subject_user_id   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_id      UUID        NOT NULL,   -- candidate_interviews.id
  escalation_level  INT         NOT NULL DEFAULT 0,
  -- 0 = soft nudge to interviewer
  -- 1 = firm nudge + recruiter looped in
  -- 2 = HR escalation
  -- 3 = admin daily report note
  -- 4 = formal warning (CC: recruiter, HR, admin)
  last_escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chitra_escalations_open
  ON public.chitra_escalations (violation_type, last_escalated_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.chitra_escalations ENABLE ROW LEVEL SECURITY;

-- Admins can read (for future Chitra dashboard page)
CREATE POLICY "Admins can read chitra escalations"
  ON public.chitra_escalations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role (used by edge function) bypasses RLS — allow all via WITH CHECK
CREATE POLICY "Service role full access to chitra escalations"
  ON public.chitra_escalations FOR ALL
  WITH CHECK (true);

-- ── C. Extend notifications table for Chitra ──────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source         TEXT    NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS action_buttons JSONB;
-- source: 'system' | 'chitra'
-- action_buttons: [{ "label": "Submit Feedback", "link": "/pipeline" }]

-- ── D. Auto-resolve trigger ───────────────────────────────────────────────────
-- When a verdict is submitted, immediately resolve any open overdue_feedback
-- escalation for that interview so Chitra stops sending reminders.

CREATE OR REPLACE FUNCTION public.chitra_resolve_feedback_escalation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.verdict IS NOT NULL AND (OLD.verdict IS NULL OR TG_OP = 'INSERT') THEN
    UPDATE public.chitra_escalations
       SET resolved_at = NOW()
     WHERE violation_type = 'overdue_feedback'
       AND reference_id = NEW.id
       AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_feedback_resolves_chitra_escalation
  AFTER INSERT OR UPDATE OF verdict ON public.candidate_interviews
  FOR EACH ROW EXECUTE FUNCTION public.chitra_resolve_feedback_escalation();

-- ── E. Default escalation thresholds in system_config ────────────────────────
INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'chitra_escalation_thresholds',
  '{
    "grace_minutes": 30,
    "level1_hours": 24,
    "level2_hours": 48,
    "level3_hours": 72,
    "level4_hours": 96
  }'::jsonb,
  'Chitra escalation timing: minutes of grace after scheduled_at, then hours between each escalation level'
)
ON CONFLICT (config_key) DO NOTHING;
