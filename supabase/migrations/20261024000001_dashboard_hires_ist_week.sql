-- Dashboard "Hires this week/month": count real hires by hired_at inside a
-- calendar window in the deployment timezone. Previously 'week' was a rolling
-- 7 days and the hire count also included shortlisted candidates by updated_at
-- (any edit counted as a hire).
--   week  = Monday 00:00 (app tz) → end of today (app tz)
--   month = 00:00 (app tz) 29 days ago → end of today (30 days, like Reports "Last 30 days")
-- The previous period (newThisPeriod trend) is the same-length window before it.
-- Adds periodStart / timezone keys; existing keys are unchanged.
--
-- Also defines the two helpers shared with the Reports RPCs
-- (20261024000002_shared_hired_rule_reports.sql):
--   _app_timezone()        system_config.default_timezone if a valid IANA zone, else UTC
--   _is_hired_in_window()  the one hire rule: hired_at in [start, end)

-- Same lookup as notification_timezone() (20261011000001) minus the per-user profile step.
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

-- Granted to authenticated: Reports computes its date range in this zone
-- (system_config itself is not readable by recruiters). Returns only a zone name.
REVOKE EXECUTE ON FUNCTION public._app_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._app_timezone() TO authenticated;

-- Hired = hired_at set and inside the half-open window. candidate_status
-- 'shortlisted' without hired_at and updated_at are deliberately not hires.
-- Plain SQL / IMMUTABLE without SET so the planner can inline it.
CREATE OR REPLACE FUNCTION public._is_hired_in_window(
  p_hired_at timestamptz,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_hired_at IS NOT NULL AND p_hired_at >= p_start AND p_hired_at < p_end;
$$;

REVOKE EXECUTE ON FUNCTION public._is_hired_in_window(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_period text DEFAULT 'week')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := public._app_timezone();
  v_now timestamptz := now();
  v_period_start timestamptz;
  v_period_end timestamptz;
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
  -- is_staff: Index.tsx calls useDashboardMetrics for every staff role.
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_period = 'month' THEN
    v_period_start := (date_trunc('day', v_now AT TIME ZONE v_tz) - interval '29 days') AT TIME ZONE v_tz;
  ELSE
    v_period_start := date_trunc('week', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  END IF;
  -- End of today in v_tz: the same exclusive end Reports uses for p_end_date = today.
  v_period_end := (date_trunc('day', v_now AT TIME ZONE v_tz) + interval '1 day') AT TIME ZONE v_tz;
  v_prev_period_start := v_period_start - (v_now - v_period_start);

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
  WHERE public._is_hired_in_window(hired_at, v_period_start, v_period_end);

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
    'newThisPeriodTrend', v_trend,
    'periodStart', v_period_start,
    'timezone', v_tz
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated;
