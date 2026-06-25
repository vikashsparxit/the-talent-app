-- Time-to-hire / TAT metrics for Reports → Time & Velocity tab

CREATE OR REPLACE FUNCTION public.get_time_velocity_metrics(p_period_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_period_days IS NULL OR p_period_days < 1 OR p_period_days > 365 THEN
    p_period_days := 30;
  END IF;

  WITH bounds AS (
    SELECT
      now() - make_interval(days => p_period_days) AS curr_start,
      now() AS curr_end,
      now() - make_interval(days => p_period_days * 2) AS prev_start,
      now() - make_interval(days => p_period_days) AS prev_end
  ),
  job_final AS (
    SELECT DISTINCT ON (jis.job_id)
      jis.job_id,
      jis.id AS final_stage_id
    FROM public.job_interview_stages jis
    ORDER BY jis.job_id, jis.order_index DESC
  ),
  best_iv AS (
    SELECT DISTINCT ON (ci.candidate_id)
      ci.candidate_id,
      jis.job_id AS stage_job_id
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.removed_from_pipeline_at IS NULL
    ORDER BY ci.candidate_id, jis.order_index DESC
  ),
  first_iv AS (
    SELECT
      ci.candidate_id,
      MIN(ci.scheduled_at) AS first_scheduled_at
    FROM public.candidate_interviews ci
    WHERE ci.scheduled_at IS NOT NULL
      AND ci.removed_from_pipeline_at IS NULL
    GROUP BY ci.candidate_id
  ),
  candidate_base AS (
    SELECT
      c.id,
      c.created_at,
      c.candidate_status,
      COALESCE(bi.stage_job_id, c.job_id) AS job_id,
      fiv.first_scheduled_at,
      (
        EXISTS (
          SELECT 1
          FROM public.candidate_interviews ci
          INNER JOIN job_final jf ON jf.final_stage_id = ci.job_interview_stage_id
          WHERE ci.candidate_id = c.id
            AND ci.verdict = 'proceeded'
            AND ci.removed_from_pipeline_at IS NULL
        )
        OR (
          EXISTS (
            SELECT 1
            FROM public.candidate_interviews ci
            WHERE ci.candidate_id = c.id
              AND ci.verdict = 'proceeded'
              AND ci.removed_from_pipeline_at IS NULL
          )
          AND EXISTS (
            SELECT 1
            FROM public.jobs j
            WHERE j.id = COALESCE(bi.stage_job_id, c.job_id)
              AND j.status = 'closed'
          )
        )
        OR c.candidate_status = 'shortlisted'
      ) AS is_hired,
      COALESCE(
        (
          SELECT ci.updated_at
          FROM public.candidate_interviews ci
          INNER JOIN job_final jf ON jf.final_stage_id = ci.job_interview_stage_id
          WHERE ci.candidate_id = c.id
            AND ci.verdict = 'proceeded'
            AND ci.removed_from_pipeline_at IS NULL
          ORDER BY ci.updated_at DESC
          LIMIT 1
        ),
        (
          SELECT MAX(ci.updated_at)
          FROM public.candidate_interviews ci
          INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
          INNER JOIN public.jobs j ON j.id = jis.job_id
          WHERE ci.candidate_id = c.id
            AND ci.verdict = 'proceeded'
            AND ci.removed_from_pipeline_at IS NULL
            AND j.status = 'closed'
        ),
        CASE WHEN c.candidate_status = 'shortlisted' THEN c.updated_at END
      ) AS hired_at
    FROM public.candidates c
    LEFT JOIN first_iv fiv ON fiv.candidate_id = c.id
    LEFT JOIN best_iv bi ON bi.candidate_id = c.id
  ),
  enriched AS (
    SELECT
      cb.*,
      CASE
        WHEN cb.first_scheduled_at IS NOT NULL AND cb.first_scheduled_at >= cb.created_at
        THEN EXTRACT(EPOCH FROM (cb.first_scheduled_at - cb.created_at)) / 86400.0
      END AS days_to_first_iv,
      CASE
        WHEN cb.is_hired AND cb.hired_at IS NOT NULL AND cb.hired_at >= cb.created_at
        THEN EXTRACT(EPOCH FROM (cb.hired_at - cb.created_at)) / 86400.0
      END AS days_to_hire
    FROM candidate_base cb
  ),
  period_agg AS (
    SELECT
      'current'::text AS period,
      ROUND(AVG(e.days_to_first_iv) FILTER (
        WHERE e.first_scheduled_at >= b.curr_start
          AND e.first_scheduled_at <= b.curr_end
          AND e.days_to_first_iv IS NOT NULL
      ))::int AS avg_time_to_first_interview,
      COUNT(*) FILTER (
        WHERE e.first_scheduled_at >= b.curr_start
          AND e.first_scheduled_at <= b.curr_end
          AND e.days_to_first_iv IS NOT NULL
      )::int AS first_iv_sample,
      ROUND(AVG(e.days_to_hire) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.curr_start
          AND e.hired_at <= b.curr_end
          AND e.days_to_hire IS NOT NULL
      ))::int AS avg_time_to_hire,
      COUNT(*) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.curr_start
          AND e.hired_at <= b.curr_end
          AND e.days_to_hire IS NOT NULL
      )::int AS hired_sample
    FROM bounds b
    CROSS JOIN enriched e
    UNION ALL
    SELECT
      'previous'::text,
      ROUND(AVG(e.days_to_first_iv) FILTER (
        WHERE e.first_scheduled_at >= b.prev_start
          AND e.first_scheduled_at < b.prev_end
          AND e.days_to_first_iv IS NOT NULL
      ))::int,
      COUNT(*) FILTER (
        WHERE e.first_scheduled_at >= b.prev_start
          AND e.first_scheduled_at < b.prev_end
          AND e.days_to_first_iv IS NOT NULL
      )::int,
      ROUND(AVG(e.days_to_hire) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.prev_start
          AND e.hired_at < b.prev_end
          AND e.days_to_hire IS NOT NULL
      ))::int,
      COUNT(*) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.prev_start
          AND e.hired_at < b.prev_end
          AND e.days_to_hire IS NOT NULL
      )::int
    FROM bounds b
    CROSS JOIN enriched e
  ),
  per_job AS (
    SELECT
      j.id AS job_id,
      j.title AS job_title,
      ROUND(AVG(e.days_to_first_iv) FILTER (
        WHERE e.first_scheduled_at >= b.curr_start
          AND e.first_scheduled_at <= b.curr_end
          AND e.days_to_first_iv IS NOT NULL
          AND e.job_id = j.id
      ))::int AS avg_time_to_first_interview,
      ROUND(AVG(e.days_to_hire) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.curr_start
          AND e.hired_at <= b.curr_end
          AND e.days_to_hire IS NOT NULL
          AND e.job_id = j.id
      ))::int AS avg_time_to_hire,
      COUNT(*) FILTER (
        WHERE e.is_hired
          AND e.hired_at >= b.curr_start
          AND e.hired_at <= b.curr_end
          AND e.job_id = j.id
      )::int AS hired_count,
      COUNT(*) FILTER (
        WHERE e.job_id = j.id
          AND (
            (e.first_scheduled_at >= b.curr_start AND e.first_scheduled_at <= b.curr_end)
            OR (e.is_hired AND e.hired_at >= b.curr_start AND e.hired_at <= b.curr_end)
          )
      )::int AS activity_count
    FROM bounds b
    CROSS JOIN public.jobs j
    LEFT JOIN enriched e ON e.job_id = j.id
    GROUP BY j.id, j.title, b.curr_start, b.curr_end
    HAVING COUNT(*) FILTER (
      WHERE e.job_id = j.id
        AND (
          (e.first_scheduled_at >= b.curr_start AND e.first_scheduled_at <= b.curr_end)
          OR (e.is_hired AND e.hired_at >= b.curr_start AND e.hired_at <= b.curr_end)
        )
    ) > 0
    ORDER BY activity_count DESC, j.title
  ),
  stage_scheduled AS (
    SELECT
      ci.candidate_id,
      jis.stage_name,
      jis.order_index,
      ci.scheduled_at,
      c.created_at,
      LAG(ci.scheduled_at) OVER (
        PARTITION BY ci.candidate_id
        ORDER BY jis.order_index
      ) AS prev_scheduled
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    INNER JOIN public.candidates c ON c.id = ci.candidate_id
    CROSS JOIN bounds b
    WHERE ci.scheduled_at IS NOT NULL
      AND ci.removed_from_pipeline_at IS NULL
      AND ci.scheduled_at >= b.curr_start
      AND ci.scheduled_at <= b.curr_end
  ),
  stage_durations AS (
    SELECT
      ss.stage_name,
      ss.order_index,
      EXTRACT(EPOCH FROM (ss.scheduled_at - COALESCE(ss.prev_scheduled, ss.created_at))) / 86400.0 AS days_in_stage
    FROM stage_scheduled ss
    WHERE ss.scheduled_at >= COALESCE(ss.prev_scheduled, ss.created_at)
  )
  SELECT jsonb_build_object(
    'period_days', p_period_days,
    'current', (
      SELECT jsonb_build_object(
        'avg_time_to_first_interview', pa.avg_time_to_first_interview,
        'avg_time_to_hire', pa.avg_time_to_hire,
        'first_iv_sample', pa.first_iv_sample,
        'hired_sample', pa.hired_sample
      )
      FROM period_agg pa
      WHERE pa.period = 'current'
    ),
    'previous', (
      SELECT jsonb_build_object(
        'avg_time_to_first_interview', pa.avg_time_to_first_interview,
        'avg_time_to_hire', pa.avg_time_to_hire,
        'first_iv_sample', pa.first_iv_sample,
        'hired_sample', pa.hired_sample
      )
      FROM period_agg pa
      WHERE pa.period = 'previous'
    ),
    'per_job', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'job_id', pj.job_id,
        'job_title', pj.job_title,
        'avg_time_to_first_interview', pj.avg_time_to_first_interview,
        'avg_time_to_hire', pj.avg_time_to_hire,
        'hired_count', pj.hired_count,
        'activity_count', pj.activity_count
      ) ORDER BY pj.activity_count DESC, pj.job_title)
      FROM per_job pj
    ), '[]'::jsonb),
    'stage_durations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage_name', sd.stage_name,
        'order_index', sd.order_index,
        'avg_days', sd.avg_days,
        'sample_size', sd.sample_size
      ) ORDER BY sd.order_index)
      FROM (
        SELECT
          stage_name,
          order_index,
          ROUND(AVG(days_in_stage))::int AS avg_days,
          COUNT(*)::int AS sample_size
        FROM stage_durations
        GROUP BY stage_name, order_index
      ) sd
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_time_velocity_metrics(int) TO authenticated;
