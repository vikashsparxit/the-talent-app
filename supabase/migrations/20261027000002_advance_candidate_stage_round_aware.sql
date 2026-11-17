-- advance_candidate_stage: round-aware.
--
-- Runs after 20261027000001_advance_candidate_stage_authz_fix.sql and before
-- its read-only check 20261027000010_advance_candidate_stage_verify.sql (which
-- must still pass: the body has session_user and no current_user).
--
-- The previous definitions (20260924000001, 20261027000001) ignored
-- candidate_interviews.round:
--   * its UPDATE stamped advanced_at/advanced_by on the from-stage row of EVERY
--     round, so after a reopen (round N+1) and Advance, the earlier rounds' rows
--     looked advanced too;
--   * its INSERT omitted round, so the next-stage row landed in round 1 and the
--     board (latest round first, see src/lib/pipelineReopen.ts pickBoardRows)
--     kept showing the candidate at the from-stage of the newer round.
-- Now the advancing row is the candidate's non-removed from-stage row with the
-- highest round (newest session within it, like the board); only that row is
-- stamped, and the to-stage row is created in the same round. An open
-- (no verdict, not advanced, not removed) to-stage row already in that round is
-- reused, so a retried/double-clicked Advance does not create a duplicate.
-- No UNIQUE (candidate, stage, round) exists any more (dropped in
-- 20260422000003 / 20260617000001), so the reuse check is what prevents dupes.
--
-- Signature, SECURITY DEFINER, search_path, grants and the authorization block
-- are unchanged from 20261027000001 (service_role JWT or a direct
-- postgres / supabase_admin session with no JWT user is trusted and uses
-- p_advanced_by; everyone else needs auth.uid(), advanced_by = auth.uid(),
-- same-job stages, and admin/HR or the job's assigned recruiter).
--
-- Also:
--   * _app_timezone() (20261024000001) now requires a staff caller, or an
--     unauthenticated service context (service_role JWT, or a direct
--     postgres / supabase_admin session such as migrations and backfills).
--     session_user, not current_user: inside a SECURITY DEFINER function
--     current_user is the owner, so a current_user check would always pass.
--   * get_time_velocity_metrics(int): EXECUTE revoked from PUBLIC / anon
--     (20261024000002 only granted authenticated).

CREATE OR REPLACE FUNCTION public.advance_candidate_stage(
  p_candidate_id UUID,
  p_from_stage_id UUID,
  p_to_stage_id UUID,
  p_advanced_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from_job uuid;
  _to_job uuid;
  _actor uuid;
  _from_id uuid;
  _round int;
BEGIN
  IF auth.role() = 'service_role'
     OR (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
    _actor := p_advanced_by;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    _actor := auth.uid();

    SELECT jis.job_id INTO _from_job
    FROM public.job_interview_stages jis
    WHERE jis.id = p_from_stage_id;

    SELECT jis.job_id INTO _to_job
    FROM public.job_interview_stages jis
    WHERE jis.id = p_to_stage_id;

    IF _from_job IS NULL OR _to_job IS NULL THEN
      RAISE EXCEPTION 'Interview stage not found' USING ERRCODE = '22023';
    END IF;

    IF _from_job IS DISTINCT FROM _to_job THEN
      RAISE EXCEPTION 'Stages must belong to the same job' USING ERRCODE = '22023';
    END IF;

    IF NOT (
      public.is_admin_or_hr(auth.uid())
      OR public.is_recruiter_for_job(auth.uid(), _from_job)
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT ci.id, ci.round INTO _from_id, _round
  FROM public.candidate_interviews ci
  WHERE ci.candidate_id = p_candidate_id
    AND ci.job_interview_stage_id = p_from_stage_id
    AND ci.removed_from_pipeline_at IS NULL
  ORDER BY ci.round DESC, ci.created_at DESC, ci.id DESC
  LIMIT 1
  FOR UPDATE;

  IF _from_id IS NULL THEN
    RAISE EXCEPTION 'Candidate interview record not found for stage %', p_from_stage_id;
  END IF;

  UPDATE public.candidate_interviews
  SET
    advanced_by = _actor,
    advanced_at = NOW()
  WHERE id = _from_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.candidate_id = p_candidate_id
      AND ci.job_interview_stage_id = p_to_stage_id
      AND ci.round = _round
      AND ci.removed_from_pipeline_at IS NULL
      AND ci.verdict IS NULL
      AND ci.advanced_at IS NULL
  ) THEN
    INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id, round)
    VALUES (p_candidate_id, p_to_stage_id, _round);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── _app_timezone: staff only ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._app_timezone()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF NOT (auth.role() = 'service_role'
            OR session_user IN ('postgres', 'supabase_admin')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(
           CASE jsonb_typeof(sc.config_value)
             WHEN 'string' THEN sc.config_value #>> '{}'
             WHEN 'object' THEN sc.config_value ->> 'timezone'
           END), '')
  INTO _tz
  FROM public.system_config sc
  WHERE sc.config_key = 'default_timezone';

  IF _tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = _tz) THEN
    RETURN _tz;
  END IF;

  RETURN 'UTC';
END;
$$;

REVOKE EXECUTE ON FUNCTION public._app_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._app_timezone() TO authenticated;

-- ── get_time_velocity_metrics: no PUBLIC / anon EXECUTE ──────────────────────

REVOKE EXECUTE ON FUNCTION public.get_time_velocity_metrics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_time_velocity_metrics(int) TO authenticated;

-- ── Rollback ─────────────────────────────────────────────────────────────────
--
-- advance_candidate_stage: restore the 20261027000001 definition (authz fix,
-- not round-aware):
--
-- CREATE OR REPLACE FUNCTION public.advance_candidate_stage(
--   p_candidate_id UUID,
--   p_from_stage_id UUID,
--   p_to_stage_id UUID,
--   p_advanced_by UUID
-- )
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   _from_job uuid;
--   _to_job uuid;
--   _actor uuid;
-- BEGIN
--   IF auth.role() = 'service_role'
--      OR (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
--     _actor := p_advanced_by;
--   ELSE
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--     END IF;
--     _actor := auth.uid();
--
--     SELECT jis.job_id INTO _from_job
--     FROM public.job_interview_stages jis
--     WHERE jis.id = p_from_stage_id;
--
--     SELECT jis.job_id INTO _to_job
--     FROM public.job_interview_stages jis
--     WHERE jis.id = p_to_stage_id;
--
--     IF _from_job IS NULL OR _to_job IS NULL THEN
--       RAISE EXCEPTION 'Interview stage not found' USING ERRCODE = '22023';
--     END IF;
--
--     IF _from_job IS DISTINCT FROM _to_job THEN
--       RAISE EXCEPTION 'Stages must belong to the same job' USING ERRCODE = '22023';
--     END IF;
--
--     IF NOT (
--       public.is_admin_or_hr(auth.uid())
--       OR public.is_recruiter_for_job(auth.uid(), _from_job)
--     ) THEN
--       RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--     END IF;
--   END IF;
--
--   UPDATE public.candidate_interviews
--   SET
--     advanced_by = _actor,
--     advanced_at = NOW()
--   WHERE
--     candidate_id = p_candidate_id
--     AND job_interview_stage_id = p_from_stage_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Candidate interview record not found for stage %', p_from_stage_id;
--   END IF;
--
--   INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
--   VALUES (p_candidate_id, p_to_stage_id);
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
--   FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
--   TO authenticated, service_role;
--
-- _app_timezone: re-run its CREATE OR REPLACE + REVOKE/GRANT from
-- 20261024000001_dashboard_hires_ist_week.sql (no caller check).
--
-- get_time_velocity_metrics: the REVOKE above only removes PUBLIC / anon
-- access; restoring it would be GRANT EXECUTE ... TO PUBLIC (not recommended).
