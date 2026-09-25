-- Dashboard metrics RPC: collapse 5–6 count queries into one round-trip

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
  WHERE candidate_status = 'shortlisted'
    AND updated_at >= v_period_start;

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

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated;
