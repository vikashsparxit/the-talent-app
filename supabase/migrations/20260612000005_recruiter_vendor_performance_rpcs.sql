-- Recruiter / vendor performance: server-side aggregation (eliminates batched candidate_interviews IN queries)

CREATE INDEX IF NOT EXISTS idx_candidate_interviews_scheduled_active
  ON public.candidate_interviews (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND removed_from_pipeline_at IS NULL;

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
    SELECT c.id, c.name, c.created_by, c.job_id, c.source
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
  ),
  job_final AS (
    SELECT DISTINCT ON (jis.job_id)
      jis.job_id,
      jis.id AS final_stage_id
    FROM public.job_interview_stages jis
    ORDER BY jis.job_id, jis.order_index DESC
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
    (
      EXISTS (
        SELECT 1
        FROM public.candidate_interviews ci
        INNER JOIN job_final jf ON jf.final_stage_id = ci.job_interview_stage_id
        WHERE ci.candidate_id = pc.id AND ci.verdict = 'proceeded'
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.candidate_interviews ci
          WHERE ci.candidate_id = pc.id AND ci.verdict = 'proceeded'
        )
        AND EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = COALESCE(bi.stage_job_id, pc.job_id) AND j.status = 'closed'
        )
      )
    ) AS is_hired,
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
$$;

CREATE OR REPLACE FUNCTION public.get_recruiter_detail(
  p_recruiter_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
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
  );
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
      count(*) FILTER (WHERE f.any_proceeded)::int AS shortlisted,
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

CREATE OR REPLACE FUNCTION public.get_vendor_detail(
  p_source_key text,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
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
  FROM flags f;
$$;

GRANT EXECUTE ON FUNCTION public.get_recruiter_leaderboard(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recruiter_detail(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_leaderboard(text[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_detail(text, date, date) TO authenticated;
