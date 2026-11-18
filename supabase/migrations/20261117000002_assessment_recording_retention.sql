-- Admin switch for the 90-day deletion of assessment recordings.
--
-- Run manually after review. Not applied automatically.
-- Requires 20261114000002_assessment_media.sql (assessment_recordings) and
-- 20261010000004_audit_log_integrity.sql (audit_log_record).
--
-- DO NOT enable the pg_cron job in 20261114000004_cleanup_recordings_cron.sql
-- until the cleanup-recordings function that checks
-- assessment_recording_retention.enabled is deployed. The older function has
-- no flag check: scheduling it with dry_run false deletes every expired
-- recording on its first run, whatever this setting says.
--
-- Key 'assessment_recording_retention', value:
--   { enabled, enabled_at, enabled_by, updated_at }
-- Off by default. Edited in Settings -> Assessments -> Recording consent
-- (admins only). While it is off, cleanup-recordings deletes nothing (a dry
-- run still reports what it would delete). When it is on, a cleanup run
-- deletes every recording past the 90-day rule, including ones that expired
-- before the switch was turned on, except recordings of hired candidates.
-- enabled_at / enabled_by record who last turned it on; turning it off keeps
-- them.
--
-- Who can read and write the row: admins only (same restrictive policy as
-- assessment_media_consent). Other staff learn only whether it is on, through
-- assessment_recording_retention_enabled(), so reviewers do not see a
-- "kept until" date that would not be honoured.
--
-- Every insert or change of the row is written to audit_log
-- (recording_retention.updated) by a trigger; the client does not write it.
--
-- Nothing here deletes recordings or changes attempts, scores or stages.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_audit_recording_retention_config ON public.system_config;
--   DROP FUNCTION IF EXISTS public.audit_recording_retention_config();
--   DROP FUNCTION IF EXISTS public.count_expired_assessment_recordings();
--   DROP FUNCTION IF EXISTS public.assessment_recording_retention_enabled();
--   DROP POLICY IF EXISTS "Recording retention config is admin only" ON public.system_config;
--   DELETE FROM public.system_config WHERE config_key = 'assessment_recording_retention';
--   (without the row, cleanup-recordings treats the setting as off)

BEGIN;

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'assessment_recording_retention',
  '{"enabled": false, "enabled_at": null, "enabled_by": null, "updated_at": null}'::jsonb,
  'Delete assessment recordings (webcam and spoken answers) 90 days after the attempt, except hired candidates. Off by default. Admin only.'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Recording retention config is admin only" ON public.system_config;
CREATE POLICY "Recording retention config is admin only"
  ON public.system_config
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    config_key <> 'assessment_recording_retention'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    config_key <> 'assessment_recording_retention'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ── Audit ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_recording_retention_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.config_value IS NOT DISTINCT FROM OLD.config_value THEN
    RETURN NULL;
  END IF;

  PERFORM public.audit_log_record(
    'recording_retention.updated',
    'system_config',
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'enabled', OLD.config_value -> 'enabled',
      'enabled_at', OLD.config_value -> 'enabled_at',
      'enabled_by', OLD.config_value -> 'enabled_by'
    ) END,
    jsonb_build_object(
      'enabled', NEW.config_value -> 'enabled',
      'enabled_at', NEW.config_value -> 'enabled_at',
      'enabled_by', NEW.config_value -> 'enabled_by'
    )
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_recording_retention_config() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_recording_retention_config ON public.system_config;
CREATE TRIGGER trg_audit_recording_retention_config
  AFTER INSERT OR UPDATE OF config_value ON public.system_config
  FOR EACH ROW
  WHEN (NEW.config_key = 'assessment_recording_retention')
  EXECUTE FUNCTION public.audit_recording_retention_config();

-- ── Read helpers ─────────────────────────────────────────────────────────────

-- Whether automatic deletion is on. Any signed-in staff member may ask (the
-- reviewer views hide "kept until" while it is off); only the boolean is exposed.
CREATE OR REPLACE FUNCTION public.assessment_recording_retention_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT config_value -> 'enabled' = 'true'::jsonb
     FROM public.system_config
     WHERE config_key = 'assessment_recording_retention'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.assessment_recording_retention_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assessment_recording_retention_enabled() TO authenticated;

-- How many recordings the next cleanup run would delete if the setting were
-- on: same rules as isRecordingExpired (supabase/functions/_shared/recordingRetention.ts):
-- not already deleted, candidate not hired, and 90 days past the attempt's
-- completion (or its start, if never completed). Admins only; shown in the
-- confirmation before turning the setting on.
CREATE OR REPLACE FUNCTION public.count_expired_assessment_recordings()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT count(*)::integer
    FROM public.assessment_recordings r
    JOIN public.candidate_assessments ca ON ca.id = r.candidate_assessment_id
    JOIN public.candidates c ON c.id = ca.candidate_id
    WHERE r.deleted_at IS NULL
      AND r.status <> 'deleted'
      AND c.hired_at IS NULL
      AND COALESCE(ca.completed_at, ca.started_at) <= now() - interval '90 days'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_expired_assessment_recordings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_expired_assessment_recordings() TO authenticated;

COMMIT;
