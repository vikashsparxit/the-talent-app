-- Smoke test: reopen -> advance_candidate_stage (20261027000002) + the
-- dashboard / Reports RPCs (20261024000001 / 20261024000002 / 20261027000002).
--
-- NOT a migration. LOCAL THROWAWAY DATABASE ONLY, with every migration applied.
-- Everything runs inside BEGIN ... ROLLBACK, so nothing persists, but it does
-- insert into auth.users / user_roles / jobs / candidates while it runs.
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/smoke/20261024_reopen_advance_smoke.sql
--
-- Run as postgres (or supabase_admin). Success prints NOTICE 'SMOKE OK'; any
-- failed assertion raises an exception and psql stops.
--
-- advance_candidate_stage is called with a JWT user set, so it takes the
-- non-trusted branch from 20261027000001 (admin/HR check, advanced_by =
-- auth.uid()) even though session_user is postgres. The full authorization
-- matrix is in 20261027_advance_candidate_stage_authz_smoke.sql.

BEGIN;

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
DO $$
DECLARE
  _admin uuid := gen_random_uuid();
  _job uuid;
  _s1 uuid;
  _s2 uuid;
  _s3 uuid;
  _cand uuid;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'smoke-admin-' || _admin || '@example.invalid', '{"full_name":"Smoke Admin"}'::jsonb, now(), now());

  -- handle_new_user() normally creates the profile.
  INSERT INTO public.profiles (user_id, full_name, email)
  SELECT _admin, 'Smoke Admin', 'smoke-admin-' || _admin || '@example.invalid'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _admin);

  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin');

  INSERT INTO public.jobs (title, status, created_by)
  VALUES ('Smoke job', 'open', _admin)
  RETURNING id INTO _job;

  INSERT INTO public.job_interview_stages (job_id, stage_name, order_index)
  VALUES (_job, 'Smoke screen', 0) RETURNING id INTO _s1;
  INSERT INTO public.job_interview_stages (job_id, stage_name, order_index)
  VALUES (_job, 'Smoke tech', 1) RETURNING id INTO _s2;
  INSERT INTO public.job_interview_stages (job_id, stage_name, order_index)
  VALUES (_job, 'Smoke HR', 2) RETURNING id INTO _s3;

  INSERT INTO public.candidates (name, email, job_id, created_by, candidate_status)
  VALUES ('Smoke Candidate', 'smoke-candidate-' || _admin || '@example.invalid', _job, _admin, 'rejected')
  RETURNING id INTO _cand;

  -- Drop whatever the auto-enroll trigger created; build round 1 explicitly.
  DELETE FROM public.candidate_interviews WHERE candidate_id = _cand;

  -- Round 1: screen proceeded and advanced, rejected at tech.
  INSERT INTO public.candidate_interviews
    (candidate_id, job_interview_stage_id, round, verdict, advanced_at, advanced_by, created_at)
  VALUES (_cand, _s1, 1, 'proceeded', now() - interval '3 days', _admin, now() - interval '5 days');
  INSERT INTO public.candidate_interviews
    (candidate_id, job_interview_stage_id, round, verdict, created_at)
  VALUES (_cand, _s2, 1, 'rejected', now() - interval '3 days');

  PERFORM set_config('smoke.admin', _admin::text, true);
  PERFORM set_config('smoke.cand', _cand::text, true);
  PERFORM set_config('smoke.s1', _s1::text, true);
  PERFORM set_config('smoke.s2', _s2::text, true);
  PERFORM set_config('smoke.s3', _s3::text, true);
END
$$;

CREATE TEMP TABLE smoke_round1 ON COMMIT DROP AS
SELECT ci.*
FROM public.candidate_interviews ci
WHERE ci.candidate_id = current_setting('smoke.cand')::uuid;

-- ── Act as the admin through the API role ───────────────────────────────────
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('smoke.admin'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('smoke.admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

-- What reopenCandidate does (computeReopenTarget -> tech, round 2).
INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id, round)
VALUES (current_setting('smoke.cand')::uuid, current_setting('smoke.s2')::uuid, 2);
UPDATE public.candidates SET candidate_status = 'reviewing'
WHERE id = current_setting('smoke.cand')::uuid;

-- Round 2 tech interview passes, then Advance (twice: retry must not duplicate).
UPDATE public.candidate_interviews SET verdict = 'proceeded'
WHERE candidate_id = current_setting('smoke.cand')::uuid
  AND job_interview_stage_id = current_setting('smoke.s2')::uuid
  AND round = 2;

SELECT public.advance_candidate_stage(
  current_setting('smoke.cand')::uuid, current_setting('smoke.s2')::uuid,
  current_setting('smoke.s3')::uuid, current_setting('smoke.admin')::uuid);
SELECT public.advance_candidate_stage(
  current_setting('smoke.cand')::uuid, current_setting('smoke.s2')::uuid,
  current_setting('smoke.s3')::uuid, current_setting('smoke.admin')::uuid);

-- RPCs execute for a staff caller (results are not asserted).
SELECT public.get_dashboard_metrics('week') IS NOT NULL AS dashboard_week;
SELECT public.get_dashboard_metrics('month') IS NOT NULL AS dashboard_month;
SELECT public.get_time_velocity_metrics(30) IS NOT NULL AS velocity_30;
SELECT count(*) >= 0 AS recruiter_leaderboard FROM public.get_recruiter_leaderboard(current_date - 6, current_date);
SELECT count(*) >= 0 AS vendor_leaderboard FROM public.get_vendor_leaderboard(ARRAY['smoke_vendor'], current_date - 6, current_date);
SELECT public._app_timezone() AS app_timezone;

RESET ROLE;

-- ── Assertions (as postgres) ────────────────────────────────────────────────
DO $$
DECLARE
  _cand uuid := current_setting('smoke.cand')::uuid;
  _admin uuid := current_setting('smoke.admin')::uuid;
  _s2 uuid := current_setting('smoke.s2')::uuid;
  _s3 uuid := current_setting('smoke.s3')::uuid;
  _n int;
  _r record;
BEGIN
  SELECT count(*) INTO _n FROM public.candidate_interviews
  WHERE candidate_id = _cand AND job_interview_stage_id = _s3;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 next-stage row, found %', _n;
  END IF;

  SELECT * INTO _r FROM public.candidate_interviews
  WHERE candidate_id = _cand AND job_interview_stage_id = _s3;
  IF _r.round <> 2 OR _r.verdict IS NOT NULL OR _r.advanced_at IS NOT NULL THEN
    RAISE EXCEPTION 'next-stage row wrong: round %, verdict %, advanced_at %', _r.round, _r.verdict, _r.advanced_at;
  END IF;

  SELECT * INTO _r FROM public.candidate_interviews
  WHERE candidate_id = _cand AND job_interview_stage_id = _s2 AND round = 2;
  IF _r.advanced_at IS NULL OR _r.advanced_by IS DISTINCT FROM _admin THEN
    RAISE EXCEPTION 'round 2 from-stage row not stamped (advanced_at %, advanced_by %)', _r.advanced_at, _r.advanced_by;
  END IF;

  -- Round 1 rows are byte-for-byte what they were before reopen/advance.
  SELECT count(*) INTO _n
  FROM smoke_round1 b
  FULL JOIN (SELECT * FROM public.candidate_interviews WHERE candidate_id = _cand AND round = 1) a
    ON a.id = b.id
  WHERE a.id IS NULL OR b.id IS NULL OR to_jsonb(a) IS DISTINCT FROM to_jsonb(b);
  IF _n <> 0 THEN
    RAISE EXCEPTION 'round 1 rows changed (% differences)', _n;
  END IF;

  -- The board row (latest round, furthest stage) is the new round-2 next-stage row.
  SELECT ci.job_interview_stage_id, ci.round INTO _r
  FROM public.candidate_interviews ci
  JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  WHERE ci.candidate_id = _cand AND ci.removed_from_pipeline_at IS NULL
  ORDER BY ci.round DESC, jis.order_index DESC, ci.created_at DESC, ci.id DESC
  LIMIT 1;
  IF _r.job_interview_stage_id <> _s3 OR _r.round <> 2 THEN
    RAISE EXCEPTION 'board row is stage % round %, expected next stage in round 2', _r.job_interview_stage_id, _r.round;
  END IF;
END
$$;

-- _app_timezone(): a signed-in non-staff user is refused.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('request.jwt.claims')::jsonb ->> 'sub', true);
DO $$
BEGIN
  BEGIN
    PERFORM public._app_timezone();
    RAISE EXCEPTION '_app_timezone() allowed a non-staff caller';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'SMOKE OK';
END
$$;

ROLLBACK;
