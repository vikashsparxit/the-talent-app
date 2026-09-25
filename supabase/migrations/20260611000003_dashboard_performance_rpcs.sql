-- Dashboard performance: server-side sourcing trend + interview stage funnel

CREATE OR REPLACE FUNCTION public.get_sourcing_trend(p_weeks int DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  LEFT JOIN counts cnt ON cnt.week_start = ws.week_start;
$$;

CREATE OR REPLACE FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_sourcing_trend(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_interview_stage_funnel(uuid) TO authenticated;
