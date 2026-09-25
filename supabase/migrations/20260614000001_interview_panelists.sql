-- Panel interviews Phase 1: junction table + backfill + RPC/trigger updates
-- interviewer_user_id on candidate_interviews = first panelist (backward compat with RPCs/triggers)

CREATE TABLE public.candidate_interview_panelists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_interview_id uuid NOT NULL REFERENCES public.candidate_interviews(id) ON DELETE CASCADE,
  interviewer_user_id uuid NOT NULL REFERENCES public.profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_interview_id, interviewer_user_id)
);

CREATE INDEX idx_candidate_interview_panelists_interview
  ON public.candidate_interview_panelists(candidate_interview_id);
CREATE INDEX idx_candidate_interview_panelists_user
  ON public.candidate_interview_panelists(interviewer_user_id);

ALTER TABLE public.candidate_interview_panelists ENABLE ROW LEVEL SECURITY;

-- Backfill: one panelist row per existing scheduled interview
INSERT INTO public.candidate_interview_panelists (candidate_interview_id, interviewer_user_id)
SELECT ci.id, ci.interviewer_user_id
FROM public.candidate_interviews ci
WHERE ci.interviewer_user_id IS NOT NULL
ON CONFLICT (candidate_interview_id, interviewer_user_id) DO NOTHING;

-- ─── RLS: panelists table ───

CREATE POLICY "Users can view panelists for visible interviews"
  ON public.candidate_interview_panelists FOR SELECT
  USING (
    interviewer_user_id = auth.uid()
    OR public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND jr.recruiter_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND ci.interviewer_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.candidate_interview_panelists cip2
        ON cip2.candidate_interview_id = ci.id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND cip2.interviewer_user_id = auth.uid()
    )
  );

CREATE POLICY "Admin HR recruiters manage panelists"
  ON public.candidate_interview_panelists FOR ALL
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND public.is_recruiter_for_job(auth.uid(), jis.job_id)
    )
  )
  WITH CHECK (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interviews ci
      JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
      WHERE ci.id = candidate_interview_panelists.candidate_interview_id
        AND public.is_recruiter_for_job(auth.uid(), jis.job_id)
    )
  );

-- ─── Extend candidate_interviews RLS for panelists ───

DROP POLICY IF EXISTS "Interviewers can view interviews for assigned candidates" ON public.candidate_interviews;
CREATE POLICY "Interviewers can view interviews for assigned candidates"
  ON public.candidate_interviews FOR SELECT
  USING (
    interviewer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.candidate_interview_panelists cip
      WHERE cip.candidate_interview_id = candidate_interviews.id
        AND cip.interviewer_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Interviewers can update assigned interviews" ON public.candidate_interviews;
CREATE POLICY "Interviewers can update assigned interviews"
  ON public.candidate_interviews FOR UPDATE
  USING (
    interviewer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.candidate_interview_panelists cip
      WHERE cip.candidate_interview_id = candidate_interviews.id
        AND cip.interviewer_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviewers ci
      WHERE ci.candidate_id = candidate_interviews.candidate_id
        AND ci.interviewer_user_id = auth.uid()
    )
  );

-- ─── Notifications: all panelists ───

CREATE OR REPLACE FUNCTION public.notify_interview_scheduled()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _candidate_name TEXT;
  _scheduled_display TEXT;
  _panelist_id UUID;
BEGIN
  IF NEW.scheduled_at IS NULL OR NEW.interviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
       AND NEW.interviewer_user_id IS NOT DISTINCT FROM OLD.interviewer_user_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  _scheduled_display := to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' IST';

  FOR _panelist_id IN
    SELECT cip.interviewer_user_id
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = NEW.id
    UNION
    SELECT NEW.interviewer_user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.candidate_interview_panelists cip
      WHERE cip.candidate_interview_id = NEW.id
    )
  LOOP
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = _panelist_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || NEW.id || '%';

    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      _panelist_id,
      'interview_scheduled',
      'Interview Scheduled',
      'You have been assigned to interview ' || COALESCE(_candidate_name, 'a candidate')
        || ' on ' || _scheduled_display
        || ' — interview_ref:' || NEW.id,
      '/calendar'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_panelist_added()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _scheduled_at timestamptz;
  _candidate_id uuid;
  _candidate_name TEXT;
  _scheduled_display TEXT;
BEGIN
  SELECT ci.scheduled_at, ci.candidate_id
  INTO _scheduled_at, _candidate_id
  FROM public.candidate_interviews ci
  WHERE ci.id = NEW.candidate_interview_id;

  IF _scheduled_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = _candidate_id;
  _scheduled_display := to_char(_scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' IST';

  DELETE FROM public.notifications
  WHERE type = 'interview_scheduled'
    AND user_id = NEW.interviewer_user_id
    AND is_read = false
    AND message LIKE '%interview_ref:' || NEW.candidate_interview_id || '%';

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.interviewer_user_id,
    'interview_scheduled',
    'Interview Scheduled',
    'You have been assigned to interview ' || COALESCE(_candidate_name, 'a candidate')
      || ' on ' || _scheduled_display
      || ' — interview_ref:' || NEW.candidate_interview_id,
    '/calendar'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_panelist_added ON public.candidate_interview_panelists;
CREATE TRIGGER on_panelist_added
  AFTER INSERT ON public.candidate_interview_panelists
  FOR EACH ROW EXECUTE FUNCTION public.notify_panelist_added();

-- ─── RPCs: include panelists jsonb array ───

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
      END,
      'panelists', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', pp.user_id,
            'full_name', pp.full_name,
            'email', pp.email
          )
          ORDER BY cip.created_at ASC
        )
        FROM public.candidate_interview_panelists cip
        JOIN public.profiles pp ON pp.user_id = cip.interviewer_user_id
        WHERE cip.candidate_interview_id = ci.id
      ), '[]'::jsonb)
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

CREATE OR REPLACE FUNCTION public.get_scheduled_interviews(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 800
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->>'scheduled_at') ASC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id,
      'candidate_id', ci.candidate_id,
      'job_interview_stage_id', ci.job_interview_stage_id,
      'interviewer_user_id', ci.interviewer_user_id,
      'scheduled_at', ci.scheduled_at,
      'interview_mode', ci.interview_mode,
      'meeting_link', ci.meeting_link,
      'verdict', ci.verdict,
      'candidate', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email
      ),
      'stage', jsonb_build_object(
        'id', jis.id,
        'stage_name', jis.stage_name,
        'job_id', jis.job_id,
        'job', jsonb_build_object('id', j.id, 'title', j.title)
      ),
      'interviewer', CASE
        WHEN p.user_id IS NOT NULL THEN jsonb_build_object(
          'full_name', p.full_name,
          'email', p.email
        )
        ELSE NULL
      END,
      'panelists', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', pp.user_id,
            'full_name', pp.full_name,
            'email', pp.email
          )
          ORDER BY cip.created_at ASC
        )
        FROM public.candidate_interview_panelists cip
        JOIN public.profiles pp ON pp.user_id = cip.interviewer_user_id
        WHERE cip.candidate_interview_id = ci.id
      ), '[]'::jsonb)
    ) AS row_data,
    ci.scheduled_at
    FROM public.candidate_interviews ci
    INNER JOIN public.candidates c ON c.id = ci.candidate_id
    INNER JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    INNER JOIN public.jobs j ON j.id = jis.job_id
    LEFT JOIN public.profiles p ON p.user_id = ci.interviewer_user_id
    WHERE ci.scheduled_at IS NOT NULL
      AND ci.removed_from_pipeline_at IS NULL
      AND (p_from IS NULL OR ci.scheduled_at >= p_from)
      AND (p_to IS NULL OR ci.scheduled_at <= p_to)
    ORDER BY ci.scheduled_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 800), 1500), 1)
  ) rows;
$$;

GRANT EXECUTE ON FUNCTION public.get_job_pipeline_interviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_interviews(timestamptz, timestamptz, int) TO authenticated;
