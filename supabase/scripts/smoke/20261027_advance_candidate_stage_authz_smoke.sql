-- Smoke test: advance_candidate_stage() authorization
-- (migration 20261027000001_advance_candidate_stage_authz_fix.sql)
--
-- LOCAL / THROWAWAY DATABASE ONLY. Everything runs inside BEGIN ... ROLLBACK.
--
--   docker exec -i <throwaway-container> psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/scripts/smoke/20261027_advance_candidate_stage_authz_smoke.sql
--
-- Callers are simulated with SET LOCAL ROLE to the JWT role and the JWT claims
-- in request.jwt.claims. The legacy request.jwt.claim.sub / .role settings are
-- set too, for auth.uid()/auth.role() implementations that still read them.
--
-- session_user stays `postgres` throughout (on Supabase images postgres is not
-- a superuser, so SET SESSION AUTHORIZATION authenticator is unavailable). An
-- "authenticated role with no sub claim" case is therefore not covered here:
-- with session_user = postgres it is the trusted direct-DB path by design,
-- while through PostgREST session_user is `authenticator` and it is refused.
--
-- Each case prints PASS/FAIL. The final block raises an exception if any case
-- failed, so psql exits non-zero under ON_ERROR_STOP.

\set QUIET on
\o /dev/null
BEGIN;

-- ── Harness ─────────────────────────────────────────────────────────────────

CREATE SCHEMA smoke;
GRANT USAGE ON SCHEMA smoke TO anon, authenticated, service_role;

CREATE TABLE smoke.results (
  n serial PRIMARY KEY,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text NOT NULL
);
GRANT INSERT, SELECT ON smoke.results TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE smoke.results_n_seq TO anon, authenticated, service_role;

-- Reads advanced_by bypassing RLS (runs as the script owner).
CREATE FUNCTION smoke.actor_of(p_candidate uuid, p_stage uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT advanced_by FROM public.candidate_interviews
  WHERE candidate_id = p_candidate AND job_interview_stage_id = p_stage
$$;

-- Runs as the caller. p_expect is 'ok' or the expected SQLSTATE.
-- When p_expect = 'ok', advanced_by on the from-stage row must equal p_expect_actor.
CREATE FUNCTION smoke.check(
  p_case text, p_candidate uuid, p_from uuid, p_to uuid,
  p_advanced_by uuid, p_expect text, p_expect_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  _got text := 'ok';
  _msg text := '';
  _actor uuid;
  _passed boolean;
  _detail text;
BEGIN
  BEGIN
    PERFORM public.advance_candidate_stage(p_candidate, p_from, p_to, p_advanced_by);
  EXCEPTION WHEN OTHERS THEN
    _got := SQLSTATE;
    _msg := SQLERRM;
  END;

  IF _got = 'ok' THEN
    _actor := smoke.actor_of(p_candidate, p_from);
  END IF;

  _passed := _got = p_expect
             AND (p_expect <> 'ok' OR _actor IS NOT DISTINCT FROM p_expect_actor);

  _detail := format('expected %s, got %s%s', p_expect, _got,
    CASE WHEN _got = 'ok'
      THEN format(' (advanced_by=%s, expected %s)', _actor, coalesce(p_expect_actor::text, 'n/a'))
      ELSE format(' (%s)', _msg) END);

  INSERT INTO smoke.results (case_name, passed, detail) VALUES (p_case, _passed, _detail);
  RAISE NOTICE '% %: % [role=%]',
    CASE WHEN _passed THEN 'PASS' ELSE 'FAIL' END, p_case, _detail, current_user;
END;
$$;
GRANT EXECUTE ON FUNCTION smoke.check(text, uuid, uuid, uuid, uuid, text, uuid)
  TO anon, authenticated, service_role;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Users: ...01 admin, ...02 hr, ...03 recruiter (assigned to job A),
--        ...04 recruiter (not assigned), ...05 interviewer, ...06 applicant (no staff role)

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'smoke-admin@example.test',        '{"full_name":"Smoke Admin"}'),
  ('a0000000-0000-4000-8000-000000000002', 'smoke-hr@example.test',           '{"full_name":"Smoke HR"}'),
  ('a0000000-0000-4000-8000-000000000003', 'smoke-rec-assigned@example.test', '{"full_name":"Smoke Recruiter A"}'),
  ('a0000000-0000-4000-8000-000000000004', 'smoke-rec-other@example.test',    '{"full_name":"Smoke Recruiter B"}'),
  ('a0000000-0000-4000-8000-000000000005', 'smoke-interviewer@example.test',  '{"full_name":"Smoke Interviewer"}'),
  ('a0000000-0000-4000-8000-000000000006', 'smoke-applicant@example.test',    '{"full_name":"Smoke Applicant","portal":"applicant"}');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-000000000002', 'hr'),
  ('a0000000-0000-4000-8000-000000000003', 'recruiter'),
  ('a0000000-0000-4000-8000-000000000004', 'recruiter'),
  ('a0000000-0000-4000-8000-000000000005', 'interviewer')
ON CONFLICT DO NOTHING;  -- auto_assign_first_admin already made the first user admin on an empty DB

INSERT INTO public.jobs (id, title) VALUES
  ('b0000000-0000-4000-8000-00000000000a', 'Smoke Job A'),
  ('b0000000-0000-4000-8000-00000000000b', 'Smoke Job B');

-- Job A: stage A1 -> A2. Job B: stage B1.
INSERT INTO public.job_interview_stages (id, job_id, stage_name, order_index) VALUES
  ('c0000000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-00000000000a', 'Screen', 1),
  ('c0000000-0000-4000-8000-0000000000a2', 'b0000000-0000-4000-8000-00000000000a', 'Tech',   2),
  ('c0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'Screen', 1);

INSERT INTO public.job_recruiters (job_id, recruiter_user_id) VALUES
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003');

-- One candidate per case (d...01 .. d...10), each sitting in stage A1 of job A.
INSERT INTO public.candidates (id, name, job_id)
SELECT format('d0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid,
       'Smoke Candidate ' || i, 'b0000000-0000-4000-8000-00000000000a'
FROM generate_series(1, 10) AS i;

INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id)
SELECT id, 'c0000000-0000-4000-8000-0000000000a1'
FROM public.candidates WHERE id::text LIKE 'd0000000-0000-4000-8000-%';

-- ── Cases ───────────────────────────────────────────────────────────────────
-- p_advanced_by is always a different user (the admin, or the HR user for the
-- admin case) to prove client-supplied actors are ignored for JWT callers.

-- 1. Applicant (signed in, no staff role): refused
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000006","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000006', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('applicant refused', 'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', '42501', NULL);
RESET ROLE;

-- 2. Interviewer: refused
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000005', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('interviewer refused', 'd0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', '42501', NULL);
RESET ROLE;

-- 3. Recruiter not assigned to job A: refused
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000004', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('unassigned recruiter refused', 'd0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', '42501', NULL);
RESET ROLE;

-- 4. Recruiter assigned to job A: allowed, advanced_by = own uid (not the admin uid sent)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('assigned recruiter allowed, actor = self', 'd0000000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', 'ok', 'a0000000-0000-4000-8000-000000000003');
RESET ROLE;

-- 5. Admin: allowed, actor = self
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('admin allowed, actor = self', 'd0000000-0000-4000-8000-000000000005',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000002', 'ok', 'a0000000-0000-4000-8000-000000000001');
RESET ROLE;

-- 6. HR: allowed, actor = self
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('hr allowed, actor = self', 'd0000000-0000-4000-8000-000000000006',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', 'ok', 'a0000000-0000-4000-8000-000000000002');
RESET ROLE;

-- 7. anon (no JWT user): refused (no EXECUTE grant)
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim.role', 'anon', true) \gset
SELECT smoke.check('anon refused', 'd0000000-0000-4000-8000-000000000007',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000001', '42501', NULL);
RESET ROLE;

-- 8. service_role JWT: allowed, actor = p_advanced_by
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim.role', 'service_role', true) \gset
SELECT smoke.check('service_role allowed, actor = p_advanced_by', 'd0000000-0000-4000-8000-000000000008',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000002', 'ok', 'a0000000-0000-4000-8000-000000000002');
RESET ROLE;

-- 9. Stages of different jobs (admin caller): 22023
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
SELECT smoke.check('mismatched jobs rejected', 'd0000000-0000-4000-8000-000000000009',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000b1',
  'a0000000-0000-4000-8000-000000000001', '22023', NULL);
RESET ROLE;

-- 10. Direct DB session as postgres with no JWT (SQL editor, pg_cron): allowed, actor = p_advanced_by
SELECT set_config('request.jwt.claims', '', true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim.role', '', true) \gset
SELECT smoke.check('postgres session without JWT allowed, actor = p_advanced_by', 'd0000000-0000-4000-8000-000000000010',
  'c0000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a2',
  'a0000000-0000-4000-8000-000000000005', 'ok', 'a0000000-0000-4000-8000-000000000005');

-- ── Summary ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _total int;
  _failed int;
  _names text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT passed),
         string_agg(case_name, '; ' ORDER BY n) FILTER (WHERE NOT passed)
    INTO _total, _failed, _names
  FROM smoke.results;

  IF _failed > 0 THEN
    RAISE EXCEPTION 'SUMMARY: % of % cases FAILED: %', _failed, _total, _names;
  END IF;
  RAISE NOTICE 'SUMMARY: all % cases PASSED', _total;
END;
$$;

ROLLBACK;
