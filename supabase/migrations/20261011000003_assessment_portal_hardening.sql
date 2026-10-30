-- Assessment portal hardening.
--   1. Grading bookkeeping so AI grading runs once per attempt, from every
--      submit path, and the UI can tell "grading pending" from a real score.
--   2. Exam link expiry: token_expires_at is set on assignment and kept in
--      step with the deadline. Enforced by the candidate-portal function.
--   3. Server-side time limit: once started, answers cannot be written after
--      started_at + duration or the deadline (plus a small grace), and overdue
--      attempts are submitted automatically by a scheduled sweep.
--   4. Signed-in applicants (dashboard exam path, which writes through RLS)
--      get the same rules: valid status transitions only, server-set
--      timestamps, and answers only for questions in their own assessment.
--
-- Existing rows:
--   * token_expires_at IS NULL  -> the link keeps working (no expiry). Only
--     new assignments get an expiry.
--   * Open attempts (invited / in_progress) whose token_expires_at was already
--     in the past from the 2026-04 backfill, but whose deadline has not passed,
--     get a fresh expiry from the policy below so live links do not break.
--   * grading_status IS NULL on old rows means "unknown"; the UI treats it as
--     not pending and shows the stored score as before.
--
-- Policy (system_config.assessment_link_policy, editable without a deploy):
--   expiry_days_without_deadline       14   link lifetime when no deadline
--   expiry_grace_hours_after_deadline  24   link stays valid this long after the deadline
--   time_limit_grace_seconds          120   allowance for the final save / clock skew

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────────────

ALTER TABLE public.candidate_assessments
  ADD COLUMN IF NOT EXISTS grading_status text,
  ADD COLUMN IF NOT EXISTS grading_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS grading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_notified_at timestamptz;

ALTER TABLE public.candidate_assessments
  DROP CONSTRAINT IF EXISTS candidate_assessments_grading_status_check;
ALTER TABLE public.candidate_assessments
  ADD CONSTRAINT candidate_assessments_grading_status_check
  CHECK (grading_status IS NULL OR grading_status IN ('queued', 'grading', 'graded', 'failed', 'not_required'));

COMMENT ON COLUMN public.candidate_assessments.grading_status IS
  'AI grading state: queued -> grading -> graded | failed; not_required when the assessment has no subjective/coding/file questions. NULL on rows submitted before tracking existed.';
COMMENT ON COLUMN public.candidate_assessments.staff_notified_at IS
  'Set when recruiters were notified that the attempt was submitted; makes the notification fire once.';

CREATE INDEX IF NOT EXISTS idx_candidate_assessments_in_progress_started
  ON public.candidate_assessments (started_at)
  WHERE status = 'in_progress';

-- ── 2. Link policy ──────────────────────────────────────────────────────────

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'assessment_link_policy',
  '{
    "expiry_days_without_deadline": 14,
    "expiry_grace_hours_after_deadline": 24,
    "time_limit_grace_seconds": 120
  }'::jsonb,
  'Assessment exam links: lifetime without a deadline, grace after the deadline, and grace on the attempt time limit'
)
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assessment_link_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'expiry_days_without_deadline',
      COALESCE((sc.config_value->>'expiry_days_without_deadline')::numeric, 14),
    'expiry_grace_hours_after_deadline',
      COALESCE((sc.config_value->>'expiry_grace_hours_after_deadline')::numeric, 24),
    'time_limit_grace_seconds',
      COALESCE((sc.config_value->>'time_limit_grace_seconds')::numeric, 120)
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.system_config sc ON sc.config_key = 'assessment_link_policy';
$$;

REVOKE ALL ON FUNCTION public.assessment_link_policy() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assessment_default_token_expiry(_deadline timestamptz, _from timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p jsonb := public.assessment_link_policy();
BEGIN
  IF _deadline IS NOT NULL THEN
    RETURN _deadline + make_interval(secs => (_p->>'expiry_grace_hours_after_deadline')::numeric * 3600);
  END IF;
  RETURN _from + make_interval(secs => (_p->>'expiry_days_without_deadline')::numeric * 86400);
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_default_token_expiry(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- Earlier of started_at + duration and the deadline, plus grace. NULL when neither applies.
CREATE OR REPLACE FUNCTION public.assessment_attempt_time_limit(
  _started_at timestamptz,
  _duration_minutes integer,
  _deadline timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LEAST(
           CASE WHEN _started_at IS NOT NULL AND _duration_minutes > 0
                THEN _started_at + make_interval(mins => _duration_minutes) END,
           _deadline
         )
         + make_interval(secs => (public.assessment_link_policy()->>'time_limit_grace_seconds')::numeric);
$$;

REVOKE ALL ON FUNCTION public.assessment_attempt_time_limit(timestamptz, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assessment_attempt_time_limit(timestamptz, integer, timestamptz) TO authenticated;

-- ── 3. Token expiry on assignment ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_candidate_assessment_token_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.token_expires_at IS NULL THEN
      NEW.token_expires_at := public.assessment_default_token_expiry(NEW.deadline, now());
    END IF;
  ELSIF NEW.deadline IS DISTINCT FROM OLD.deadline
        AND NEW.token_expires_at IS NOT DISTINCT FROM OLD.token_expires_at
        AND NEW.status IN ('invited', 'in_progress') THEN
    -- Staff moved the deadline without setting an expiry: follow the deadline.
    NEW.token_expires_at := public.assessment_default_token_expiry(NEW.deadline, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ac_set_candidate_assessment_token_expiry ON public.candidate_assessments;
CREATE TRIGGER ac_set_candidate_assessment_token_expiry
  BEFORE INSERT OR UPDATE OF deadline ON public.candidate_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_candidate_assessment_token_expiry();

-- Backfill: keep live links working (see header). NULL expiries are left alone.
UPDATE public.candidate_assessments
SET token_expires_at = public.assessment_default_token_expiry(deadline, now())
WHERE status IN ('invited', 'in_progress')
  AND token_expires_at IS NOT NULL
  AND token_expires_at <= now()
  AND (deadline IS NULL OR deadline > now());

-- ── 4. Signed-in applicant writes (dashboard exam path) ─────────────────────

-- Write state for an attempt, evaluated with definer rights so the caller's
-- RLS on assessments / questions does not matter.
CREATE OR REPLACE FUNCTION public.assessment_response_write_state(_candidate_assessment_id uuid, _question_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ca record;
  _limit timestamptz;
BEGIN
  SELECT ca.status, ca.started_at, ca.deadline, ca.assessment_id, a.duration_minutes
  INTO _ca
  FROM public.candidate_assessments ca
  JOIN public.assessments a ON a.id = ca.assessment_id
  WHERE ca.id = _candidate_assessment_id;

  IF NOT FOUND THEN
    RETURN 'assessment_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.questions q
    JOIN public.assessment_sections s ON s.id = q.section_id
    WHERE q.id = _question_id AND s.assessment_id = _ca.assessment_id
  ) THEN
    RETURN 'invalid_question_for_assessment';
  END IF;

  IF _ca.status IN ('completed', 'evaluated') THEN
    RETURN 'assessment_already_submitted';
  END IF;
  IF _ca.status <> 'in_progress' THEN
    RETURN 'assessment_not_in_progress';
  END IF;

  _limit := public.assessment_attempt_time_limit(_ca.started_at, _ca.duration_minutes, _ca.deadline);
  IF _limit IS NOT NULL AND now() > _limit THEN
    RETURN 'assessment_time_limit_exceeded';
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_response_write_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assessment_response_write_state(uuid, uuid) TO authenticated;

-- SECURITY INVOKER so current_user reflects the caller (see 20260924000002).
CREATE OR REPLACE FUNCTION public.enforce_assessment_response_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _state text;
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  _state := public.assessment_response_write_state(NEW.candidate_assessment_id, NEW.question_id);
  IF _state <> 'ok' THEN
    RAISE EXCEPTION '%', _state USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ab_enforce_assessment_response_window ON public.candidate_responses;
CREATE TRIGGER ab_enforce_assessment_response_window
  BEFORE INSERT OR UPDATE ON public.candidate_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assessment_response_window();

CREATE OR REPLACE FUNCTION public.enforce_applicant_assessment_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Server-owned bookkeeping.
  NEW.token_expires_at := OLD.token_expires_at;
  NEW.grading_status := OLD.grading_status;
  NEW.grading_requested_at := OLD.grading_requested_at;
  NEW.grading_started_at := OLD.grading_started_at;
  NEW.graded_at := OLD.graded_at;
  NEW.staff_notified_at := OLD.staff_notified_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'invited' AND NEW.status = 'in_progress' THEN
      IF OLD.deadline IS NOT NULL AND OLD.deadline < now() THEN
        RAISE EXCEPTION 'assessment_expired' USING ERRCODE = 'P0001';
      END IF;
      IF OLD.token_expires_at IS NOT NULL AND OLD.token_expires_at <= now() THEN
        RAISE EXCEPTION 'assessment_link_expired' USING ERRCODE = 'P0001';
      END IF;
      -- The clock starts on the server, not at a client-chosen time.
      NEW.started_at := now();
      NEW.completed_at := NULL;
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
      -- A late submit only finalises answers already saved (writes past the
      -- limit are rejected by enforce_assessment_response_window).
      NEW.started_at := OLD.started_at;
      NEW.completed_at := now();
    ELSE
      RAISE EXCEPTION 'invalid_assessment_status_transition' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    NEW.started_at := OLD.started_at;
    NEW.completed_at := OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ab_enforce_applicant_assessment_flow ON public.candidate_assessments;
CREATE TRIGGER ab_enforce_applicant_assessment_flow
  BEFORE UPDATE ON public.candidate_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_applicant_assessment_flow();

-- ── 5. Auto-submit overdue attempts ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_name text, p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cfg jsonb;
  _base text;
  _bearer text;
BEGIN
  SELECT value INTO _cfg
  FROM public.internal_webhook_config
  WHERE key = 'edge_functions';

  IF _cfg IS NULL OR COALESCE((_cfg->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  _base := nullif(rtrim(trim(_cfg->>'base_url'), '/'), '');
  _bearer := nullif(trim(_cfg->>'bearer_token'), '');
  IF _base IS NULL OR _bearer IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _base || '/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _bearer
    ),
    body := COALESCE(p_body, '{}'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Submits in-progress attempts past their time limit with the answers already
-- saved, and asks grade-assessment to grade anything queued. Without the
-- edge_functions config row the grading request is a no-op; the attempts are
-- still submitted and can be graded from Evaluations.
CREATE OR REPLACE FUNCTION public.sweep_overdue_assessment_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _swept integer := 0;
  _needs_grading boolean;
BEGIN
  WITH overdue AS (
    SELECT ca.id,
           EXISTS (
             SELECT 1
             FROM public.questions q
             JOIN public.assessment_sections s ON s.id = q.section_id
             WHERE s.assessment_id = ca.assessment_id
               AND q.type::text IN ('subjective', 'coding', 'file_upload')
           ) AS gradeable
    FROM public.candidate_assessments ca
    JOIN public.assessments a ON a.id = ca.assessment_id
    WHERE ca.status = 'in_progress'
      AND public.assessment_attempt_time_limit(ca.started_at, a.duration_minutes, ca.deadline) < now()
    FOR UPDATE OF ca SKIP LOCKED
  ),
  done AS (
    UPDATE public.candidate_assessments ca
    SET status = 'completed',
        completed_at = now(),
        integrity_log = COALESCE(ca.integrity_log, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('type', 'auto_submit_time_limit', 'timestamp', now())),
        grading_status = COALESCE(ca.grading_status, CASE WHEN o.gradeable THEN 'queued' ELSE 'not_required' END),
        grading_requested_at = COALESCE(ca.grading_requested_at, now())
    FROM overdue o
    WHERE ca.id = o.id
    RETURNING ca.id
  )
  SELECT count(*) INTO _swept FROM done;

  SELECT EXISTS (
    SELECT 1 FROM public.candidate_assessments
    WHERE grading_status = 'queued'
      AND grading_requested_at < now() - interval '1 minute'
  ) INTO _needs_grading;

  IF _needs_grading THEN
    PERFORM public.invoke_edge_function('grade-assessment', '{"all_pending": true, "limit": 20}'::jsonb);
  END IF;

  RETURN _swept;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_overdue_assessment_attempts() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Every 5 minutes. Outside the transaction so a missing pg_cron does not roll
-- back the changes above; run this block again once pg_cron is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'assessment-time-limit-sweep',
      '*/5 * * * *',
      'SELECT public.sweep_overdue_assessment_attempts()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed: schedule public.sweep_overdue_assessment_attempts() manually';
  END IF;
END;
$$;
