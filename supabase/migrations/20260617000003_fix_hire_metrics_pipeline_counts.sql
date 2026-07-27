-- Align pipeline counts and report hire metrics with candidates.hired_at (not inferred from proceeded).

-- Pipeline job tab counts: exclude terminal statuses and hired candidates
CREATE OR REPLACE FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, candidate_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Include hired_at on pipeline interview payload
CREATE OR REPLACE FUNCTION public.get_job_pipeline_interviews(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->'job_interview_stage'->>'order_index')::int ASC NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id,
      'candidate_id', ci.candidate_id,
      'job_interview_stage_id', ci.job_interview_stage_id,
      'interviewer_user_id', ci.interviewer_user_id,
      'verdict', ci.verdict,
      'overall_score', ci.overall_score,
      'rating_categories', ci.rating_categories,
      'feedback', ci.feedback,
      'artifacts', ci.artifacts,
      'interview_mode', ci.interview_mode,
      'meeting_link', ci.meeting_link,
      'scheduled_at', ci.scheduled_at,
      'completed_at', ci.completed_at,
      'advanced_by', ci.advanced_by,
      'advanced_at', ci.advanced_at,
      'interview_notes', ci.interview_notes,
      'enrolled_at', ci.enrolled_at,
      'created_at', ci.created_at,
      'updated_at', ci.updated_at,
      'sort_order', ci.sort_order,
      'round', ci.round,
      'candidate', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email,
        'role_applied', c.role_applied,
        'resume_url', c.resume_url,
        'candidate_status', c.candidate_status,
        'hired_at', c.hired_at,
        'phone', c.phone,
        'uploaded_by', c.uploaded_by,
        'suitability_score', c.suitability_score,
        'linkedin_url', c.linkedin_url,
        'experience_years', c.experience_years,
        'candidate_current_role', c.candidate_current_role,
        'candidate_current_company', c.candidate_current_company,
        'owner', CASE
          WHEN op.user_id IS NOT NULL THEN jsonb_build_object('full_name', op.full_name)
          ELSE NULL
        END
      ),
      'job_interview_stage', jsonb_build_object(
        'id', jis.id,
        'job_id', jis.job_id,
        'stage_name', jis.stage_name,
        'order_index', jis.order_index,
        'is_eliminatory', jis.is_eliminatory
      ),
      'interviewer', CASE
        WHEN ip.user_id IS NOT NULL THEN jsonb_build_object(
          'full_name', ip.full_name,
          'email', ip.email
        )
        ELSE NULL
      END
    ) AS row_data
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis
      ON jis.id = ci.job_interview_stage_id
      AND jis.job_id = p_job_id
    INNER JOIN public.candidates c ON c.id = ci.candidate_id
    LEFT JOIN public.profiles ip ON ip.user_id = ci.interviewer_user_id
    LEFT JOIN public.profiles op ON op.user_id = c.uploaded_by
    WHERE ci.removed_from_pipeline_at IS NULL
    ORDER BY jis.order_index ASC, ci.sort_order ASC NULLS LAST, ci.created_at ASC
  ) rows;
$$;

-- Report flags: is_hired from explicit hire signal, not final-stage proceeded
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
    SELECT c.id, c.name, c.created_by, c.job_id, c.source, c.hired_at, c.candidate_status
    FROM public.candidates c
    WHERE c.created_at >= p_start_ts
      AND c.created_at <= p_end_ts
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
    (pc.hired_at IS NOT NULL OR pc.candidate_status = 'shortlisted') AS is_hired,
    COALESCE(j_pipeline.title, j_cand.title, '—') AS job_title
  FROM period_candidates pc
  LEFT JOIN best_iv bi ON bi.candidate_id = pc.id
  LEFT JOIN public.jobs j_pipeline ON j_pipeline.id = bi.stage_job_id
  LEFT JOIN public.jobs j_cand ON j_cand.id = pc.job_id;
$$;

-- Vendor leaderboard: shortlisted = final-stage proceeded but not yet hired
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Dashboard hires: prefer hired_at, fall back to legacy shortlisted updated_at
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

-- Time & velocity: hire signal from candidates.hired_at
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
      (c.hired_at IS NOT NULL OR c.candidate_status = 'shortlisted') AS is_hired,
      COALESCE(
        c.hired_at,
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
