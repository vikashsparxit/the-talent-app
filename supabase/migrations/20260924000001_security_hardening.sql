-- DRAFT — present for super admin review. Do NOT apply automatically.
-- Fixes Critical/High DB findings (C1–C3, H1–H6) plus cheap win M4.
-- M1 is report-only (see pre-flight + agent notes). Does not modify supabase/functions/.

-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE-DB PRE-FLIGHT (run these first; do not skip the duplicate-email check)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER functions + ACLs:
--   SELECT proname,
--          pg_get_function_identity_arguments(oid) AS args,
--          proacl
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND prosecdef
--   ORDER BY 1;
--
-- Current RLS policies on the tables this migration touches:
--   SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN (
--     'profiles',
--     'applicant_profiles',
--     'candidate_interviews',
--     'candidates',
--     'user_roles',
--     'email_delivery_log'
--   )
--   ORDER BY tablename, policyname;
--
-- Triggers on profiles (C2 should add trg_protect_profile_privilege_columns):
--   SELECT tgname, pg_get_triggerdef(oid)
--   FROM pg_trigger
--   WHERE tgrelid = 'public.profiles'::regclass
--     AND NOT tgisinternal
--   ORDER BY 1;
--
-- Storage bucket public flags (M1 — report only; this migration does not change them):
--   SELECT id, name, public, file_size_limit
--   FROM storage.buckets
--   ORDER BY 1;
--
-- C3 case-insensitive applicant_profiles email duplicates
-- (unique index below WILL FAIL if this returns rows — merge/delete first):
--   SELECT lower(trim(email)) AS email_key,
--          COUNT(*) AS n,
--          ARRAY_AGG(id ORDER BY created_at) AS ids,
--          ARRAY_AGG(user_id ORDER BY created_at) AS user_ids,
--          ARRAY_AGG(email ORDER BY created_at) AS emails
--   FROM public.applicant_profiles
--   GROUP BY lower(trim(email))
--   HAVING COUNT(*) > 1
--   ORDER BY n DESC, email_key;

BEGIN;

-- ── C1. Drop make_user_admin (SECURITY DEFINER, no caller check) ────────────
-- Created in 20260116144225 as make_user_admin(uuid). Never granted specially;
-- no src/ or supabase/functions/ callers (types.ts only). First-admin setup
-- is done via SQL / Settings role insert, not this RPC.

DROP FUNCTION IF EXISTS public.make_user_admin(uuid);

-- ── C2. profiles privilege-column lock + M7 super-admin role lock ───────────
-- Policy "Users can update own profile" (20260116144225) is USING(auth.uid()=user_id)
-- with no column restriction. Staff deactivation uses edge function service role;
-- can_conduct_interviews uses set_can_conduct_interviews (DEFINER / postgres).
-- ProfileDialog only writes full_name + timezone — those stay allowed.

CREATE OR REPLACE FUNCTION public.protect_profile_privilege_columns()
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

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'cannot change is_super_admin' USING ERRCODE = '42501';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.can_conduct_interviews IS DISTINCT FROM OLD.can_conduct_interviews
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'cannot change privileged profile columns' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privilege_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privilege_columns();

-- M7: non-service callers cannot remove/reassign the super admin's admin role.
-- Settings.handleChangeRole / handleRemoveRole will error on that user — intended.

CREATE OR REPLACE FUNCTION public.protect_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _target uuid;
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _target := COALESCE(OLD.user_id, NEW.user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _target AND p.is_super_admin = true
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND OLD.role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'cannot remove super admin role' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.role = 'admin'::public.app_role
     AND (
       NEW.role IS DISTINCT FROM 'admin'::public.app_role
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
     ) THEN
    RAISE EXCEPTION 'cannot remove super admin role' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_role
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_super_admin_role();

-- ── C3. applicant_profiles email takeover ───────────────────────────────────
-- Policies (final): "Applicants can insert/update own profile" check user_id only
-- (20260212140150). Ownership elsewhere is lower(trim(email)).
-- Bind trigger name sorts BEFORE enrich_applicant_from_candidate_trigger so
-- enrich (20260620000002) looks up candidates by the JWT email, not a spoofed one.
-- handle_new_user / register_profile_as_applicant are DEFINER (postgres) — skipped.

CREATE OR REPLACE FUNCTION public.applicant_profiles_bind_auth_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _jwt_email text;
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  _jwt_email := lower(trim(COALESCE(auth.jwt()->>'email', '')));
  IF _jwt_email = '' THEN
    RAISE EXCEPTION 'applicant email is required' USING ERRCODE = '22023';
  END IF;

  NEW.email := _jwt_email;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'cannot set applicant user_id' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'cannot change applicant user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applicant_profiles_bind_auth_email ON public.applicant_profiles;
CREATE TRIGGER applicant_profiles_bind_auth_email
  BEFORE INSERT OR UPDATE ON public.applicant_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.applicant_profiles_bind_auth_email();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.applicant_profiles
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'C3: case-insensitive duplicate emails exist in applicant_profiles. Run the pre-flight query, merge/delete dupes, then re-apply.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS applicant_profiles_email_lower_trim_idx
  ON public.applicant_profiles (lower(trim(email)));

-- ── H1. Interviewer interview INSERT/UPDATE + identity lock ─────────────────
-- INSERT policy name (final, never replaced): 
--   "Interviewers can create interviews for assigned candidates" (20260226121735)
-- UPDATE policy name (final):
--   "Interviewers can update assigned interviews" (20260615000002)
-- Stage-move already blocked by trg_prevent_interviewer_pipeline_stage_move
-- (20260723150000). This trigger only locks candidate_id + interviewer_user_id.
-- WITH CHECK keeps panelists (is_panelist_for_interview); restricting to
-- interviewer_user_id = auth.uid() alone would break panel notes/feedback.

DROP POLICY IF EXISTS "Interviewers can create interviews for assigned candidates"
  ON public.candidate_interviews;

CREATE POLICY "Interviewers can create interviews for assigned candidates"
  ON public.candidate_interviews
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
    AND interviewer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.job_interview_stages jis
      INNER JOIN public.candidates c ON c.id = candidate_interviews.candidate_id
      WHERE jis.id = candidate_interviews.job_interview_stage_id
        AND (
          c.job_id IS NOT DISTINCT FROM jis.job_id
          OR EXISTS (
            SELECT 1 FROM public.job_applications ja
            WHERE ja.candidate_id = c.id
              AND ja.job_id = jis.job_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "Interviewers can update assigned interviews"
  ON public.candidate_interviews;

CREATE POLICY "Interviewers can update assigned interviews"
  ON public.candidate_interviews
  FOR UPDATE
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_panelist_for_interview(auth.uid(), candidate_interviews.id)
  )
  WITH CHECK (
    interviewer_user_id = auth.uid()
    OR public.is_panelist_for_interview(auth.uid(), candidate_interviews.id)
  );

CREATE OR REPLACE FUNCTION public.prevent_interviewer_interview_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.candidate_id IS NOT DISTINCT FROM OLD.candidate_id
     AND NEW.interviewer_user_id IS NOT DISTINCT FROM OLD.interviewer_user_id THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_or_hr(auth.uid())
     OR public.has_role(auth.uid(), 'recruiter'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'cannot change interview assignment' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_interviewer_interview_identity_change
  ON public.candidate_interviews;

CREATE TRIGGER trg_prevent_interviewer_interview_identity_change
  BEFORE UPDATE OF candidate_id, interviewer_user_id ON public.candidate_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_interviewer_interview_identity_change();

-- ── H2. advance_candidate_stage caller + same-job check ─────────────────────
-- Final signature (20260617000008 / 20260407000001):
--   (p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid)
-- Called from useInterviewPipeline.advanceCandidate (admin/HR/recruiter UI).

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
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
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
  TO authenticated;

-- ── H3. Analytics / dashboard RPC grants + caller guards ────────────────────
-- Frontend:
--   Dashboard (/): admin, hr, recruiter nav; interviewers still hit
--     useDashboardMetrics + InterviewStageFunnel (scoped).
--   HiringJobPicker / Pipeline: get_pipeline_job_counts (all staff).
--   Reports: recruiter/vendor RPCs — admin, hr, recruiter.
--   Settings Email: get_email_send_counts — admin only.
--   get_pending_approval_counts: unused (client rewrite) — still staff-guarded.
-- _period_candidate_flags: helper only (called by other DEFINER RPCs).

CREATE OR REPLACE FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, candidate_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    jis.job_id,
    COUNT(DISTINCT ci.candidate_id)::bigint
  FROM public.candidate_interviews ci
  INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  INNER JOIN public.candidates c ON c.id = ci.candidate_id
  WHERE jis.job_id = ANY(p_job_ids)
    AND ci.removed_from_pipeline_at IS NULL
    AND c.candidate_status NOT IN ('rejected', 'shortlisted', 'backout')
    AND c.hired_at IS NULL
  GROUP BY jis.job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_approval_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, pending_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.job_id,
    COUNT(*)::bigint AS pending_count
  FROM public.candidates c
  WHERE c.job_id = ANY(p_job_ids)
    AND c.candidate_status NOT IN ('backout', 'shortlisted')
    AND NOT EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      INNER JOIN public.job_interview_stages jis
        ON jis.id = ci.job_interview_stage_id
        AND jis.job_id = c.job_id
      WHERE ci.candidate_id = c.id
        AND ci.removed_from_pipeline_at IS NULL
    )
  GROUP BY c.job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_period text DEFAULT 'week')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_period_start timestamptz;
  v_prev_period_start timestamptz;
  v_total_candidates bigint;
  v_new_this_period bigint;
  v_new_last_period bigint;
  v_hires_this_period bigint;
  v_open_jobs int;
  v_open_positions bigint;
  v_active_candidates bigint;
  v_trend int;
BEGIN
  -- is_staff: Index.tsx always calls useDashboardMetrics, including interviewers
  -- (KPI cards are hidden). Stricter admin/hr/recruiter would 42501 that query.
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_days := CASE WHEN p_period = 'month' THEN 30 ELSE 7 END;
  v_period_start := now() - (v_days || ' days')::interval;
  v_prev_period_start := now() - (v_days * 2 || ' days')::interval;

  SELECT count(*) INTO v_total_candidates FROM public.candidates;

  SELECT count(*) INTO v_new_this_period
  FROM public.candidates
  WHERE created_at >= v_period_start;

  SELECT count(*) INTO v_new_last_period
  FROM public.candidates
  WHERE created_at >= v_prev_period_start
    AND created_at < v_period_start;

  SELECT count(*) INTO v_hires_this_period
  FROM public.candidates
  WHERE (
    (hired_at IS NOT NULL AND hired_at >= v_period_start)
    OR (
      hired_at IS NULL
      AND candidate_status = 'shortlisted'
      AND updated_at >= v_period_start
    )
  );

  SELECT count(*)::int, coalesce(sum(coalesce(total_openings, 1)), 0)
  INTO v_open_jobs, v_open_positions
  FROM public.jobs
  WHERE status = 'open';

  SELECT count(*) INTO v_active_candidates
  FROM public.candidates c
  WHERE c.job_id IN (SELECT id FROM public.jobs WHERE status = 'open');

  IF v_new_last_period > 0 THEN
    v_trend := round(((v_new_this_period - v_new_last_period)::numeric / v_new_last_period) * 100);
  ELSIF v_new_this_period > 0 THEN
    v_trend := 100;
  ELSE
    v_trend := 0;
  END IF;

  RETURN jsonb_build_object(
    'totalCandidates', v_total_candidates,
    'activeCandidates', v_active_candidates,
    'openJobs', v_open_jobs,
    'openPositions', v_open_positions,
    'hiresThisPeriod', v_hires_this_period,
    'newThisPeriod', v_new_this_period,
    'newThisPeriodTrend', v_trend
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sourcing_trend(p_weeks int DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_hr(auth.uid())
    OR public.has_role(auth.uid(), 'recruiter'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH bounds AS (
      SELECT date_trunc('week', now())::timestamptz AS this_week_start
    ),
    week_series AS (
      SELECT generate_series(
        (SELECT this_week_start FROM bounds) - ((GREATEST(p_weeks, 1) - 1) || ' weeks')::interval,
        (SELECT this_week_start FROM bounds),
        '1 week'::interval
      ) AS week_start
    ),
    counts AS (
      SELECT
        date_trunc('week', c.created_at)::timestamptz AS week_start,
        count(*)::int AS cnt
      FROM public.candidates c
      WHERE c.created_at >= (SELECT min(week_start) FROM week_series)
      GROUP BY 1
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'week_start', ws.week_start,
          'count', coalesce(cnt.cnt, 0)
        )
        ORDER BY ws.week_start
      ),
      '[]'::jsonb
    )
    FROM week_series ws
    LEFT JOIN counts cnt ON cnt.week_start = ws.week_start
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Interviewers render InterviewStageFunnel on Dashboard with their user id.
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH stage_base AS (
      SELECT DISTINCT jis.id, jis.stage_name, jis.order_index
      FROM public.job_interview_stages jis
      INNER JOIN public.jobs j ON j.id = jis.job_id AND j.status = 'open'
      WHERE p_interviewer_user_id IS NULL

      UNION

      SELECT DISTINCT jis.id, jis.stage_name, jis.order_index
      FROM public.candidate_interviews ci
      INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE p_interviewer_user_id IS NOT NULL
        AND ci.interviewer_user_id = p_interviewer_user_id
    ),
    agg AS (
      SELECT
        sb.order_index,
        min(sb.stage_name) AS stage_name,
        count(ci.id)::int AS entered,
        count(ci.id) FILTER (WHERE ci.verdict = 'proceeded')::int AS proceeded
      FROM stage_base sb
      LEFT JOIN public.candidate_interviews ci
        ON ci.job_interview_stage_id = sb.id
        AND ci.removed_from_pipeline_at IS NULL
        AND (p_interviewer_user_id IS NULL OR ci.interviewer_user_id = p_interviewer_user_id)
      GROUP BY sb.order_index
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_index', order_index,
          'stage_name', stage_name,
          'entered', entered,
          'proceeded', proceeded
        )
        ORDER BY order_index
      ),
      '[]'::jsonb
    )
    FROM agg
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recruiter_leaderboard(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  recruiter_id uuid,
  recruiter_name text,
  sourced int,
  in_pipeline int,
  conversion_pct int,
  proceeded int,
  hired int,
  pending int,
  job_count int,
  rank int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_hr(auth.uid())
    OR public.has_role(auth.uid(), 'recruiter'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT
      p_start_date::timestamptz AS start_ts,
      (p_end_date + 1)::timestamptz - interval '1 microsecond' AS end_ts
  ),
  flags AS (
    SELECT f.*
    FROM bounds b
    CROSS JOIN LATERAL public._period_candidate_flags(
      b.start_ts, b.end_ts, NULL::uuid, NULL::text[], true
    ) f
  ),
  agg AS (
    SELECT
      f.created_by AS recruiter_id,
      count(*)::int AS sourced,
      count(*) FILTER (WHERE f.in_pipeline)::int AS in_pipeline,
      count(*) FILTER (WHERE f.any_proceeded)::int AS proceeded,
      count(*) FILTER (WHERE f.is_hired)::int AS hired,
      count(*) FILTER (WHERE f.any_pending)::int AS pending,
      count(DISTINCT COALESCE(f.pipeline_job_id, f.job_id)) FILTER (
        WHERE COALESCE(f.pipeline_job_id, f.job_id) IS NOT NULL
      )::int AS job_count
    FROM flags f
    GROUP BY f.created_by
  ),
  ranked AS (
    SELECT
      a.*,
      CASE WHEN a.sourced > 0 THEN round(a.in_pipeline::numeric / a.sourced * 100)::int ELSE 0 END AS conversion_pct,
      row_number() OVER (
        ORDER BY
          a.hired DESC,
          CASE WHEN a.sourced > 0 THEN round(a.in_pipeline::numeric / a.sourced * 100) ELSE 0 END DESC,
          a.sourced DESC
      )::int AS rank
    FROM agg a
  )
  SELECT
    r.recruiter_id,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      split_part(p.email, '@', 1),
      'Unknown'
    ) AS recruiter_name,
    r.sourced,
    r.in_pipeline,
    r.conversion_pct,
    r.proceeded,
    r.hired,
    r.pending,
    r.job_count,
    r.rank
  FROM ranked r
  LEFT JOIN public.profiles p ON p.user_id = r.recruiter_id
  ORDER BY r.rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recruiter_detail(
  p_recruiter_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_hr(auth.uid())
    OR public.has_role(auth.uid(), 'recruiter'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH bounds AS (
      SELECT
        p_start_date::timestamptz AS start_ts,
        (p_end_date + 1)::timestamptz - interval '1 microsecond' AS end_ts
    ),
    flags AS (
      SELECT f.*
      FROM bounds b
      CROSS JOIN LATERAL public._period_candidate_flags(
        b.start_ts, b.end_ts, p_recruiter_id, NULL::text[], true
      ) f
    ),
    jobs_agg AS (
      SELECT
        COALESCE(f.pipeline_job_id, f.job_id) AS job_id,
        max(f.job_title) AS title,
        count(*)::int AS sourced,
        count(*) FILTER (WHERE f.in_pipeline)::int AS in_pipeline,
        count(*) FILTER (WHERE f.is_hired)::int AS hired
      FROM flags f
      WHERE COALESCE(f.pipeline_job_id, f.job_id) IS NOT NULL
      GROUP BY 1
      ORDER BY count(*) DESC
    ),
    sources_agg AS (
      SELECT
        coalesce(nullif(trim(f.source), ''), 'manual') AS source,
        count(*)::int AS count,
        count(*) FILTER (WHERE f.in_pipeline)::int AS in_pipeline
      FROM flags f
      GROUP BY 1
      ORDER BY count(*) DESC
    ),
    candidates_agg AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', f.candidate_id,
            'name', coalesce(nullif(trim(f.candidate_name), ''), 'Unknown'),
            'job_title', f.job_title,
            'source', coalesce(nullif(trim(f.source), ''), 'manual'),
            'highest_stage', f.highest_stage,
            'overall_verdict', f.overall_verdict,
            'is_hired', f.is_hired,
            'is_in_pipeline', f.in_pipeline
          )
          ORDER BY f.candidate_name
        ),
        '[]'::jsonb
      ) AS candidates
      FROM flags f
    )
    SELECT jsonb_build_object(
      'jobs', coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM jobs_agg j), '[]'::jsonb),
      'sources', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM sources_agg s), '[]'::jsonb),
      'candidates', (SELECT candidates FROM candidates_agg)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_leaderboard(
  p_source_keys text[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  source_key text,
  submitted int,
  in_pipeline int,
  conversion_pct int,
  shortlisted int,
  hired int,
  rank int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_hr(auth.uid())
    OR public.has_role(auth.uid(), 'recruiter'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT
      p_start_date::timestamptz AS start_ts,
      (p_end_date + 1)::timestamptz - interval '1 microsecond' AS end_ts
  ),
  job_final AS (
    SELECT DISTINCT ON (jis.job_id)
      jis.job_id,
      jis.id AS final_stage_id
    FROM public.job_interview_stages jis
    ORDER BY jis.job_id, jis.order_index DESC
  ),
  flags AS (
    SELECT f.*
    FROM bounds b
    CROSS JOIN LATERAL public._period_candidate_flags(
      b.start_ts, b.end_ts, NULL::uuid, p_source_keys, false
    ) f
  ),
  agg AS (
    SELECT
      coalesce(nullif(trim(f.source), ''), 'manual') AS source_key,
      count(*)::int AS submitted,
      count(*) FILTER (WHERE f.in_pipeline)::int AS in_pipeline,
      count(*) FILTER (WHERE
        NOT f.is_hired
        AND EXISTS (
          SELECT 1
          FROM public.candidate_interviews ci
          INNER JOIN job_final jf ON jf.final_stage_id = ci.job_interview_stage_id
          WHERE ci.candidate_id = f.candidate_id
            AND ci.verdict = 'proceeded'
        )
      )::int AS shortlisted,
      count(*) FILTER (WHERE f.is_hired)::int AS hired
    FROM flags f
    GROUP BY 1
  ),
  all_keys AS (
    SELECT unnest(p_source_keys) AS source_key
  ),
  merged AS (
    SELECT
      k.source_key,
      coalesce(a.submitted, 0) AS submitted,
      coalesce(a.in_pipeline, 0) AS in_pipeline,
      coalesce(a.shortlisted, 0) AS shortlisted,
      coalesce(a.hired, 0) AS hired
    FROM all_keys k
    LEFT JOIN agg a ON a.source_key = k.source_key
  ),
  ranked AS (
    SELECT
      m.*,
      CASE WHEN m.submitted > 0 THEN round(m.in_pipeline::numeric / m.submitted * 100)::int ELSE 0 END AS conversion_pct,
      row_number() OVER (
        ORDER BY
          m.hired DESC,
          CASE WHEN m.submitted > 0 THEN round(m.in_pipeline::numeric / m.submitted * 100) ELSE 0 END DESC,
          m.submitted DESC
      )::int AS rank
    FROM merged m
  )
  SELECT * FROM ranked ORDER BY rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_detail(
  p_source_key text,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin_or_hr(auth.uid())
    OR public.has_role(auth.uid(), 'recruiter'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH bounds AS (
      SELECT
        p_start_date::timestamptz AS start_ts,
        (p_end_date + 1)::timestamptz - interval '1 microsecond' AS end_ts
    ),
    flags AS (
      SELECT f.*
      FROM bounds b
      CROSS JOIN LATERAL public._period_candidate_flags(
        b.start_ts, b.end_ts, NULL::uuid, ARRAY[p_source_key], false
      ) f
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', f.candidate_id,
          'name', coalesce(nullif(trim(f.candidate_name), ''), 'Unknown'),
          'job_title', f.job_title,
          'highest_stage', f.highest_stage,
          'overall_verdict', f.overall_verdict,
          'is_hired', f.is_hired,
          'is_in_pipeline', f.in_pipeline
        )
        ORDER BY f.candidate_name
      ),
      '[]'::jsonb
    )
    FROM flags f
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_email_send_counts()
RETURNS TABLE (sent_today bigint, sent_this_month bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (
      WHERE status = 'sent'
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    )::bigint AS sent_today,
    count(*) FILTER (
      WHERE status = 'sent'
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
    )::bigint AS sent_this_month
  FROM public.email_delivery_log;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._period_candidate_flags(timestamptz, timestamptz, uuid, text[], boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_pipeline_job_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pipeline_job_counts(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_pending_approval_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_approval_counts(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_sourcing_trend(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sourcing_trend(int) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_interview_stage_funnel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_interview_stage_funnel(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_recruiter_leaderboard(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recruiter_leaderboard(date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_recruiter_detail(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recruiter_detail(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_vendor_leaderboard(text[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_leaderboard(text[], date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_vendor_detail(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_detail(text, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_email_send_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_send_counts() TO authenticated;

-- ── H4. Webhook helpers: triggers only ──────────────────────────────────────
-- invoke_hire_email_webhook(uuid) — 20260619000007
-- invoke_staff_email_webhook(text, uuid) — 20260617000004
-- Called from DEFINER triggers (postgres); no src/ .rpc() callers.

REVOKE EXECUTE ON FUNCTION public.invoke_hire_email_webhook(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_staff_email_webhook(text, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── H5. Applicant candidate UPDATE whitelist ────────────────────────────────
-- Policy "Applicants can update own candidate record" (20260619000002) is
-- still used: useApplicantPortal writes name, phone, resume_url, linkedin_url,
-- skills. Keep the policy; trigger blocks every other column for non-staff.

CREATE OR REPLACE FUNCTION public.restrict_applicant_candidate_update()
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

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.candidate_status IS DISTINCT FROM OLD.candidate_status
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.ai_summary IS DISTINCT FROM OLD.ai_summary
     OR NEW.red_flags IS DISTINCT FROM OLD.red_flags
     OR NEW.suitability_analysis IS DISTINCT FROM OLD.suitability_analysis
     OR NEW.suitability_score IS DISTINCT FROM OLD.suitability_score
     OR NEW.hired_at IS DISTINCT FROM OLD.hired_at
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
     OR NEW.work_experience IS DISTINCT FROM OLD.work_experience
     OR NEW.education IS DISTINCT FROM OLD.education
     OR NEW.skills_tags IS DISTINCT FROM OLD.skills_tags
     OR NEW.structured_skills IS DISTINCT FROM OLD.structured_skills
     OR NEW.certifications IS DISTINCT FROM OLD.certifications
     OR NEW.awards IS DISTINCT FROM OLD.awards
     OR NEW.credential_score IS DISTINCT FROM OLD.credential_score
     OR NEW.enrichment_score IS DISTINCT FROM OLD.enrichment_score
     OR NEW.parse_score IS DISTINCT FROM OLD.parse_score
     OR NEW.experience_years IS DISTINCT FROM OLD.experience_years
     OR NEW.candidate_current_role IS DISTINCT FROM OLD.candidate_current_role
     OR NEW.candidate_current_company IS DISTINCT FROM OLD.candidate_current_company
     OR NEW.role_applied IS DISTINCT FROM OLD.role_applied
     OR NEW.last_analyzed_at IS DISTINCT FROM OLD.last_analyzed_at
     OR NEW.last_enriched_at IS DISTINCT FROM OLD.last_enriched_at
     OR NEW.pending_approval_decline_reason IS DISTINCT FROM OLD.pending_approval_decline_reason THEN
    RAISE EXCEPTION 'applicants cannot update internal candidate fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_applicant_candidate_update ON public.candidates;
CREATE TRIGGER trg_restrict_applicant_candidate_update
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_applicant_candidate_update();

-- ── H6. portal_submit_job_application: anon insert-only ─────────────────────
-- Final signature (20260619000006):
--   (uuid, text, text, text, text, text, text) RETURNS jsonb
-- Careers (often anon) + applicant portal (authenticated). Anon must not
-- overwrite recruiter/import rows. Authenticated updates require JWT email.

CREATE OR REPLACE FUNCTION public.portal_submit_job_application(
  p_job_id UUID,
  p_applicant_name TEXT,
  p_applicant_email TEXT,
  p_applicant_phone TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_resume_url TEXT DEFAULT NULL,
  p_cover_letter TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm_email TEXT;
  _jwt_email TEXT;
  _existing_id UUID;
  _existing_source TEXT;
  _new_id UUID;
  _is_anon BOOLEAN;
BEGIN
  _is_anon := auth.uid() IS NULL;
  _jwt_email := lower(trim(COALESCE(auth.jwt()->>'email', '')));

  IF _is_anon THEN
    _norm_email := lower(trim(COALESCE(p_applicant_email, '')));
  ELSE
    IF _jwt_email = '' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    _norm_email := _jwt_email;
  END IF;

  IF _norm_email IS NULL OR _norm_email = '' THEN
    RAISE EXCEPTION 'Applicant email is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job is not open for applications' USING ERRCODE = '22023';
  END IF;

  SELECT ja.id, ja.source
  INTO _existing_id, _existing_source
  FROM public.job_applications ja
  WHERE ja.job_id = p_job_id
    AND lower(trim(ja.applicant_email)) = _norm_email
  ORDER BY (ja.candidate_id IS NOT NULL) DESC, ja.created_at ASC
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    IF _is_anon THEN
      RETURN jsonb_build_object('status', 'already_applied');
    END IF;

    IF _existing_source IN ('recruiter', 'import') THEN
      UPDATE public.job_applications
      SET
        applicant_email = _norm_email,
        applicant_name = p_applicant_name,
        applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
        linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
        resume_url = COALESCE(p_resume_url, resume_url),
        cover_letter = COALESCE(p_cover_letter, cover_letter),
        updated_at = now()
      WHERE id = _existing_id;

      RETURN jsonb_build_object('status', 'updated', 'application_id', _existing_id);
    END IF;

    RETURN jsonb_build_object('status', 'already_applied', 'application_id', _existing_id);
  END IF;

  INSERT INTO public.job_applications (
    job_id,
    applicant_name,
    applicant_email,
    applicant_phone,
    linkedin_url,
    resume_url,
    cover_letter,
    source
  )
  VALUES (
    p_job_id,
    p_applicant_name,
    _norm_email,
    p_applicant_phone,
    p_linkedin_url,
    p_resume_url,
    p_cover_letter,
    'portal'
  )
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('status', 'created', 'application_id', _new_id);

EXCEPTION
  WHEN unique_violation THEN
    SELECT ja.id, ja.source
    INTO _existing_id, _existing_source
    FROM public.job_applications ja
    WHERE ja.job_id = p_job_id
      AND lower(trim(ja.applicant_email)) = _norm_email
    ORDER BY (ja.candidate_id IS NOT NULL) DESC, ja.created_at ASC
    LIMIT 1;

    IF _existing_id IS NULL THEN
      RAISE;
    END IF;

    IF _is_anon THEN
      RETURN jsonb_build_object('status', 'already_applied');
    END IF;

    IF _existing_source IN ('recruiter', 'import') THEN
      UPDATE public.job_applications
      SET
        applicant_email = _norm_email,
        applicant_name = p_applicant_name,
        applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
        linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
        resume_url = COALESCE(p_resume_url, resume_url),
        cover_letter = COALESCE(p_cover_letter, cover_letter),
        updated_at = now()
      WHERE id = _existing_id;

      RETURN jsonb_build_object('status', 'updated', 'application_id', _existing_id);
    END IF;

    UPDATE public.job_applications
    SET
      applicant_name = p_applicant_name,
      applicant_phone = COALESCE(p_applicant_phone, applicant_phone),
      linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
      resume_url = COALESCE(p_resume_url, resume_url),
      cover_letter = COALESCE(p_cover_letter, cover_letter),
      updated_at = now()
    WHERE id = _existing_id;

    RETURN jsonb_build_object('status', 'created', 'application_id', _existing_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_submit_job_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- ── M4. Drop email_delivery_log WITH CHECK(true) insert policy ──────────────
-- Only writer is supabase/functions/_shared/email.ts via service role, which
-- bypasses RLS. Policy name (final): "Service role insert email delivery log".

DROP POLICY IF EXISTS "Service role insert email delivery log"
  ON public.email_delivery_log;

COMMIT;
