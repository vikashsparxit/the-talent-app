-- Reports hire counts use the same rule and windows as the dashboard
-- (get_dashboard_metrics, 20261024000001):
--   * a hire is public._is_hired_in_window(hired_at, start, end) — hired_at only;
--     candidate_status 'shortlisted' without hired_at and updated_at no longer count.
--   * a hire is attributed to the window its hired_at falls in, not to the window
--     the candidate was created (sourced) in. Sourced / in-pipeline / proceeded /
--     pending stay cohort counts by created_at.
--   * date params are calendar days in public._app_timezone():
--     [p_start_date 00:00, p_end_date + 1 day 00:00) in that zone.
-- Signatures, return columns, role checks and grants are unchanged.
--
-- Also fixes get_vendor_leaderboard returning columns out of order
-- (SELECT * put shortlisted/hired/conversion_pct into the wrong OUT columns).
--
-- Requires 20261024000001 (_app_timezone, _is_hired_in_window).

-- Rows: candidates created in [p_start_ts, p_end_ts) plus candidates hired in it.
-- p_end_ts is exclusive. Callers tell cohort rows apart by candidates.created_at.
-- is_hired = hired inside the window.
CREATE OR REPLACE FUNCTION public._period_candidate_flags(
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_recruiter_id uuid DEFAULT NULL,
  p_source_keys text[] DEFAULT NULL,
  p_require_created_by boolean DEFAULT true
)
RETURNS TABLE (
  candidate_id uuid,
  candidate_name text,
  created_by uuid,
  job_id uuid,
  source text,
  in_pipeline boolean,
  any_proceeded boolean,
  any_pending boolean,
  pipeline_job_id uuid,
  highest_stage text,
  overall_verdict text,
  is_hired boolean,
  job_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_candidates AS (
    SELECT c.id, c.name, c.created_by, c.job_id, c.source, c.hired_at
    FROM public.candidates c
    WHERE (
        (c.created_at >= p_start_ts AND c.created_at < p_end_ts)
        OR public._is_hired_in_window(c.hired_at, p_start_ts, p_end_ts)
      )
      AND (NOT p_require_created_by OR c.created_by IS NOT NULL)
      AND (p_recruiter_id IS NULL OR c.created_by = p_recruiter_id)
      AND (p_source_keys IS NULL OR c.source = ANY(p_source_keys))
  ),
  best_iv AS (
    SELECT DISTINCT ON (ci.candidate_id)
      ci.candidate_id,
      ci.verdict,
      jis.job_id AS stage_job_id,
      jis.stage_name
    FROM public.candidate_interviews ci
    INNER JOIN period_candidates pc ON pc.id = ci.candidate_id
    INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    ORDER BY ci.candidate_id, jis.order_index DESC
  )
  SELECT
    pc.id,
    pc.name,
    pc.created_by,
    pc.job_id,
    pc.source,
    (pc.job_id IS NOT NULL OR bi.candidate_id IS NOT NULL) AS in_pipeline,
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.candidate_id = pc.id AND ci.verdict = 'proceeded'
    ) AS any_proceeded,
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.candidate_id = pc.id
        AND ci.scheduled_at IS NOT NULL
        AND ci.verdict IS NULL
    ) AS any_pending,
    bi.stage_job_id,
    bi.stage_name,
    bi.verdict::text,
    public._is_hired_in_window(pc.hired_at, p_start_ts, p_end_ts) AS is_hired,
    COALESCE(j_pipeline.title, j_cand.title, '—') AS job_title
  FROM period_candidates pc
  LEFT JOIN best_iv bi ON bi.candidate_id = pc.id
  LEFT JOIN public.jobs j_pipeline ON j_pipeline.id = bi.stage_job_id
  LEFT JOIN public.jobs j_cand ON j_cand.id = pc.job_id;
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
      p_start_date::timestamp AT TIME ZONE tz.zone AS start_ts,
      (p_end_date + 1)::timestamp AT TIME ZONE tz.zone AS end_ts
    FROM (SELECT public._app_timezone() AS zone) tz
  ),
  flags AS (
    SELECT f.*, (c.created_at >= b.start_ts AND c.created_at < b.end_ts) AS is_sourced
    FROM bounds b
    CROSS JOIN LATERAL public._period_candidate_flags(
      b.start_ts, b.end_ts, NULL::uuid, NULL::text[], true
    ) f
    INNER JOIN public.candidates c ON c.id = f.candidate_id
  ),
  agg AS (
    SELECT
      f.created_by AS recruiter_id,
      count(*) FILTER (WHERE f.is_sourced)::int AS sourced,
      count(*) FILTER (WHERE f.is_sourced AND f.in_pipeline)::int AS in_pipeline,
      count(*) FILTER (WHERE f.is_sourced AND f.any_proceeded)::int AS proceeded,
      count(*) FILTER (WHERE f.is_hired)::int AS hired,
      count(*) FILTER (WHERE f.is_sourced AND f.any_pending)::int AS pending,
      count(DISTINCT COALESCE(f.pipeline_job_id, f.job_id)) FILTER (
        WHERE f.is_sourced AND COALESCE(f.pipeline_job_id, f.job_id) IS NOT NULL
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
        p_start_date::timestamp AT TIME ZONE tz.zone AS start_ts,
        (p_end_date + 1)::timestamp AT TIME ZONE tz.zone AS end_ts
      FROM (SELECT public._app_timezone() AS zone) tz
    ),
    flags AS (
      SELECT f.*, (c.created_at >= b.start_ts AND c.created_at < b.end_ts) AS is_sourced
      FROM bounds b
      CROSS JOIN LATERAL public._period_candidate_flags(
        b.start_ts, b.end_ts, p_recruiter_id, NULL::text[], true
      ) f
      INNER JOIN public.candidates c ON c.id = f.candidate_id
    ),
    jobs_agg AS (
      SELECT
        COALESCE(f.pipeline_job_id, f.job_id) AS job_id,
        max(f.job_title) AS title,
        count(*) FILTER (WHERE f.is_sourced)::int AS sourced,
        count(*) FILTER (WHERE f.is_sourced AND f.in_pipeline)::int AS in_pipeline,
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
      WHERE f.is_sourced
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
      p_start_date::timestamp AT TIME ZONE tz.zone AS start_ts,
      (p_end_date + 1)::timestamp AT TIME ZONE tz.zone AS end_ts
    FROM (SELECT public._app_timezone() AS zone) tz
  ),
  job_final AS (
    SELECT DISTINCT ON (jis.job_id)
      jis.job_id,
      jis.id AS final_stage_id
    FROM public.job_interview_stages jis
    ORDER BY jis.job_id, jis.order_index DESC
  ),
  flags AS (
    SELECT
      f.*,
      (c.created_at >= b.start_ts AND c.created_at < b.end_ts) AS is_sourced,
      c.hired_at
    FROM bounds b
    CROSS JOIN LATERAL public._period_candidate_flags(
      b.start_ts, b.end_ts, NULL::uuid, p_source_keys, false
    ) f
    INNER JOIN public.candidates c ON c.id = f.candidate_id
  ),
  agg AS (
    SELECT
      coalesce(nullif(trim(f.source), ''), 'manual') AS source_key,
      count(*) FILTER (WHERE f.is_sourced)::int AS submitted,
      count(*) FILTER (WHERE f.is_sourced AND f.in_pipeline)::int AS in_pipeline,
      -- Final stage proceeded, not hired (ever).
      count(*) FILTER (WHERE
        f.is_sourced
        AND f.hired_at IS NULL
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
  -- Explicit list in OUT-column order (RETURN QUERY maps by position).
  SELECT
    r.source_key,
    r.submitted,
    r.in_pipeline,
    r.conversion_pct,
    r.shortlisted,
    r.hired,
    r.rank
  FROM ranked r
  ORDER BY r.rank;
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
        p_start_date::timestamp AT TIME ZONE tz.zone AS start_ts,
        (p_end_date + 1)::timestamp AT TIME ZONE tz.zone AS end_ts
      FROM (SELECT public._app_timezone() AS zone) tz
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

-- Windows are whole days in _app_timezone(): the last p_period_days days
-- including today, and the same number of days before that. Hires (and
-- avg_time_to_hire) use hired_at only — no shortlisted / updated_at fallback.
CREATE OR REPLACE FUNCTION public.get_time_velocity_metrics(p_period_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_tz text := public._app_timezone();
  v_today timestamp;
BEGIN
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_period_days IS NULL OR p_period_days < 1 OR p_period_days > 365 THEN
    p_period_days := 30;
  END IF;

  v_today := date_trunc('day', now() AT TIME ZONE v_tz);

  WITH bounds AS (
    SELECT
      (v_today - make_interval(days => p_period_days - 1)) AT TIME ZONE v_tz AS curr_start,
      (v_today + interval '1 day') AT TIME ZONE v_tz AS curr_end,
      (v_today - make_interval(days => p_period_days * 2 - 1)) AT TIME ZONE v_tz AS prev_start,
      (v_today - make_interval(days => p_period_days - 1)) AT TIME ZONE v_tz AS prev_end
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
      COALESCE(bi.stage_job_id, c.job_id) AS job_id,
      fiv.first_scheduled_at,
      c.hired_at
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
        WHEN cb.hired_at IS NOT NULL AND cb.hired_at >= cb.created_at
        THEN EXTRACT(EPOCH FROM (cb.hired_at - cb.created_at)) / 86400.0
      END AS days_to_hire
    FROM candidate_base cb
  ),
  period_agg AS (
    SELECT
      'current'::text AS period,
      ROUND(AVG(e.days_to_first_iv) FILTER (
        WHERE e.first_scheduled_at >= b.curr_start
          AND e.first_scheduled_at < b.curr_end
          AND e.days_to_first_iv IS NOT NULL
      ))::int AS avg_time_to_first_interview,
      COUNT(*) FILTER (
        WHERE e.first_scheduled_at >= b.curr_start
          AND e.first_scheduled_at < b.curr_end
          AND e.days_to_first_iv IS NOT NULL
      )::int AS first_iv_sample,
      ROUND(AVG(e.days_to_hire) FILTER (
        WHERE public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
          AND e.days_to_hire IS NOT NULL
      ))::int AS avg_time_to_hire,
      COUNT(*) FILTER (
        WHERE public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
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
        WHERE public._is_hired_in_window(e.hired_at, b.prev_start, b.prev_end)
          AND e.days_to_hire IS NOT NULL
      ))::int,
      COUNT(*) FILTER (
        WHERE public._is_hired_in_window(e.hired_at, b.prev_start, b.prev_end)
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
          AND e.first_scheduled_at < b.curr_end
          AND e.days_to_first_iv IS NOT NULL
          AND e.job_id = j.id
      ))::int AS avg_time_to_first_interview,
      ROUND(AVG(e.days_to_hire) FILTER (
        WHERE public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
          AND e.days_to_hire IS NOT NULL
          AND e.job_id = j.id
      ))::int AS avg_time_to_hire,
      COUNT(*) FILTER (
        WHERE public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
          AND e.job_id = j.id
      )::int AS hired_count,
      COUNT(*) FILTER (
        WHERE e.job_id = j.id
          AND (
            (e.first_scheduled_at >= b.curr_start AND e.first_scheduled_at < b.curr_end)
            OR public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
          )
      )::int AS activity_count
    FROM bounds b
    CROSS JOIN public.jobs j
    LEFT JOIN enriched e ON e.job_id = j.id
    GROUP BY j.id, j.title, b.curr_start, b.curr_end
    HAVING COUNT(*) FILTER (
      WHERE e.job_id = j.id
        AND (
          (e.first_scheduled_at >= b.curr_start AND e.first_scheduled_at < b.curr_end)
          OR public._is_hired_in_window(e.hired_at, b.curr_start, b.curr_end)
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
      AND ci.scheduled_at < b.curr_end
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

REVOKE EXECUTE ON FUNCTION public._period_candidate_flags(timestamptz, timestamptz, uuid, text[], boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_recruiter_leaderboard(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recruiter_leaderboard(date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_recruiter_detail(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recruiter_detail(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_vendor_leaderboard(text[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_leaderboard(text[], date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_vendor_detail(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_detail(text, date, date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_time_velocity_metrics(int) TO authenticated;
