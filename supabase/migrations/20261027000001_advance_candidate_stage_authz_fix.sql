-- ════════════════════════════════════════════════════════════════════════════
-- advance_candidate_stage(): fix caller authorization
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug: 20260924000001_security_hardening.sql trusted the caller when
-- `current_user IN ('postgres', 'service_role', 'supabase_admin')`. The
-- function is SECURITY DEFINER, so inside it current_user is always the
-- function owner (postgres / supabase_admin). That branch was therefore always
-- taken: the admin/HR/assigned-recruiter checks never ran, any signed-in user
-- (applicant, interviewer, any recruiter) could advance any candidate, the
-- two stages were never checked to belong to the same job, and advanced_by was
-- whatever the client sent in p_advanced_by.
--
-- Fix: only the authorization block changes; the row updates are identical.
--   * Trusted callers: a service_role JWT, or a direct database session with
--     no JWT user (session_user postgres / supabase_admin, e.g. SQL editor or
--     pg_cron). session_user is the login role and is not changed by SECURITY
--     DEFINER. Through PostgREST session_user is `authenticator`, so API
--     callers never match it. For trusted callers advanced_by = p_advanced_by.
--   * Everyone else: must have a JWT user; advanced_by = auth.uid() and
--     p_advanced_by is ignored; both stages must exist and belong to the same
--     job (22023); caller must be admin/HR or a recruiter assigned to that job
--     (42501 'forbidden').
--
-- Grants are unchanged: no PUBLIC/anon, EXECUTE for authenticated and
-- service_role.
--
-- Idempotent: CREATE OR REPLACE.
-- Smoke test: supabase/scripts/smoke/20261027_advance_candidate_stage_authz_smoke.sql

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

  UPDATE public.candidate_interviews
  SET
    advanced_by = _actor,
    advanced_at = NOW()
  WHERE
    candidate_id = p_candidate_id
    AND job_interview_stage_id = p_from_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate interview record not found for stage %', p_from_stage_id;
  END IF;

  INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
  VALUES (p_candidate_id, p_to_stage_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_candidate_stage(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── Rollback (restores the 20260924000001 definition, INCLUDING THE BUG) ─────
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
--      OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
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
--   TO authenticated;
