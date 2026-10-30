-- The Talent App: database schema baseline
--
-- Creates the complete application schema in one step: tables, views, functions,
-- triggers, row-level security policies, grants, storage buckets and policies,
-- scheduled jobs, and the default configuration rows the app expects.
--
-- Apply it to a fresh Supabase project with `supabase db reset` (local) or
-- `supabase db push` (hosted). Later migrations build on top of this file.
--
-- Scheduled jobs call Edge Functions through public.invoke_edge_function(), which
-- reads its base URL and bearer token from public.internal_webhook_config. See
-- docs/guides/oss-self-host.md for the one-time setup.

SET check_function_bodies = false;
SELECT pg_catalog.set_config('search_path', '', true);

-- Extensions --------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Schema ------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'hr',
    'recruiter',
    'interviewer'
);

CREATE TYPE public.assessment_status AS ENUM (
    'draft',
    'active',
    'archived'
);

CREATE TYPE public.candidate_assessment_status AS ENUM (
    'invited',
    'in_progress',
    'completed',
    'evaluated',
    'expired'
);

CREATE TYPE public.experience_level AS ENUM (
    'entry',
    'mid',
    'senior',
    'lead',
    'executive'
);

CREATE TYPE public.interview_mode AS ENUM (
    'in_person',
    'video',
    'phone'
);

CREATE TYPE public.interview_verdict AS ENUM (
    'proceeded',
    'rejected',
    'hold',
    'no_show'
);

CREATE TYPE public.job_status AS ENUM (
    'draft',
    'open',
    'paused',
    'closed',
    'cancelled'
);

CREATE TYPE public.job_type AS ENUM (
    'full_time',
    'part_time',
    'contract',
    'internship',
    'freelance'
);

CREATE TYPE public.question_type AS ENUM (
    'mcq',
    'coding',
    'subjective',
    'file_upload'
);

CREATE FUNCTION public._period_candidate_flags(p_start_ts timestamp with time zone, p_end_ts timestamp with time zone, p_recruiter_id uuid DEFAULT NULL::uuid, p_source_keys text[] DEFAULT NULL::text[], p_require_created_by boolean DEFAULT true) RETURNS TABLE(candidate_id uuid, candidate_name text, created_by uuid, job_id uuid, source text, in_pipeline boolean, any_proceeded boolean, any_pending boolean, pipeline_job_id uuid, highest_stage text, overall_verdict text, is_hired boolean, job_title text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.applicant_owns_job_application(_application_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.applicant_profiles ap ON lower(trim(ap.email)) = lower(trim(ja.applicant_email))
    WHERE ja.id = _application_id AND ap.user_id = auth.uid()
  );
$$;

CREATE FUNCTION public.applicant_profiles_bind_auth_email() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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

CREATE FUNCTION public.approve_pending_candidate(p_candidate_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_job_id uuid;
  v_status text;
  v_hired_at timestamptz;
  v_first_stage_id uuid;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.job_id, c.candidate_status, c.hired_at
  INTO v_job_id, v_status, v_hired_at
  FROM public.candidates c
  WHERE c.id = p_candidate_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or not assigned to a job';
  END IF;

  IF NOT public.can_decide_pending_approval(auth.uid(), v_job_id) THEN
    RAISE EXCEPTION 'Not authorized to approve pending candidates for this job';
  END IF;

  IF v_hired_at IS NOT NULL OR v_status IN ('backout', 'shortlisted', 'rejected') THEN
    RAISE EXCEPTION 'Candidate is not eligible for pending approval';
  END IF;

  SELECT jis.id
  INTO v_first_stage_id
  FROM public.job_interview_stages jis
  WHERE jis.job_id = v_job_id
  ORDER BY jis.order_index ASC
  LIMIT 1;

  IF v_first_stage_id IS NULL THEN
    RAISE EXCEPTION 'No interview stages configured for this job';
  END IF;

  SELECT ci.id
  INTO v_existing_id
  FROM public.candidate_interviews ci
  WHERE ci.candidate_id = p_candidate_id
    AND ci.job_interview_stage_id = v_first_stage_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.candidate_interviews
    SET
      removed_from_pipeline_at = NULL,
      removed_by = NULL,
      verdict = NULL,
      advanced_at = NULL,
      advanced_by = NULL,
      enrolled_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.candidate_interviews (candidate_id, job_interview_stage_id, enrolled_at)
    VALUES (p_candidate_id, v_first_stage_id, now());
  END IF;
END;
$$;

CREATE FUNCTION public.audit_candidate_interview_decision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _scores jsonb;
  _verdict_changed boolean;
  _advanced boolean;
BEGIN
  _verdict_changed := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.verdict IS NOT NULL
    ELSE NEW.verdict IS DISTINCT FROM OLD.verdict
  END;
  _advanced := TG_OP = 'UPDATE'
    AND NEW.advanced_at IS NOT NULL
    AND NEW.advanced_at IS DISTINCT FROM OLD.advanced_at;

  IF NOT (_verdict_changed OR _advanced) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'suitability_score', c.suitability_score,
    'credential_score', c.credential_score
  )
  INTO _scores
  FROM public.candidates c
  WHERE c.id = NEW.candidate_id;

  IF _verdict_changed THEN
    PERFORM public.audit_log_record(
      'interview.verdict_changed',
      'interview',
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('verdict', OLD.verdict) END,
      jsonb_build_object(
        'verdict', NEW.verdict,
        'candidate_id', NEW.candidate_id,
        'job_interview_stage_id', NEW.job_interview_stage_id,
        'overall_score', NEW.overall_score
      ) || COALESCE(_scores, '{}'::jsonb)
    );
  END IF;

  IF _advanced THEN
    PERFORM public.audit_log_record(
      'candidate.stage_advanced',
      'candidate',
      NEW.candidate_id,
      jsonb_build_object('advanced_at', OLD.advanced_at, 'advanced_by', OLD.advanced_by),
      jsonb_build_object(
        'interview_id', NEW.id,
        'from_stage_id', NEW.job_interview_stage_id,
        'verdict', NEW.verdict,
        'advanced_at', NEW.advanced_at,
        'advanced_by', NEW.advanced_by
      ) || COALESCE(_scores, '{}'::jsonb)
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.audit_candidate_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.candidate_status IS NOT DISTINCT FROM OLD.candidate_status
     AND NEW.hired_at IS NOT DISTINCT FROM OLD.hired_at THEN
    RETURN NULL;
  END IF;

  PERFORM public.audit_log_record(
    'candidate.status_changed',
    'candidate',
    NEW.id,
    jsonb_build_object(
      'candidate_status', OLD.candidate_status,
      'hired_at', OLD.hired_at
    ),
    jsonb_build_object(
      'candidate_status', NEW.candidate_status,
      'hired_at', NEW.hired_at,
      'job_id', NEW.job_id,
      'pending_approval_decline_reason', NEW.pending_approval_decline_reason,
      'suitability_score', NEW.suitability_score,
      'credential_score', NEW.credential_score
    )
  );

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.audit_job_application_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  PERFORM public.audit_log_record(
    'job_application.status_changed',
    'job_application',
    NEW.id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object(
      'status', NEW.status,
      'job_id', NEW.job_id,
      'candidate_id', NEW.candidate_id
    )
  );

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.audit_log_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501';
END;
$$;

CREATE FUNCTION public.audit_log_record(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, ip
  )
  VALUES (
    auth.uid(), _action, _entity_type, _entity_id, _before_data, _after_data,
    public.request_client_ip()
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE FUNCTION public.audit_user_role_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_log_record(
      'user_role.granted', 'user_role', NEW.user_id,
      NULL, jsonb_build_object('role', NEW.role)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_log_record(
      'user_role.revoked', 'user_role', OLD.user_id,
      jsonb_build_object('role', OLD.role), NULL
    );
  ELSIF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    PERFORM public.audit_log_record(
      'user_role.updated', 'user_role', NEW.user_id,
      jsonb_build_object('role', OLD.role, 'user_id', OLD.user_id),
      jsonb_build_object('role', NEW.role, 'user_id', NEW.user_id)
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.auto_assign_first_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'admin');
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.auto_create_candidate_from_application() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _existing_candidate_id uuid;
  _new_candidate_id uuid;
  _primary_recruiter_id uuid;
BEGIN
  SELECT recruiter_user_id INTO _primary_recruiter_id
  FROM public.job_recruiters
  WHERE job_id = NEW.job_id AND is_primary = true
  LIMIT 1;

  SELECT id INTO _existing_candidate_id
  FROM public.candidates
  WHERE lower(trim(email)) = lower(trim(NEW.applicant_email))
  LIMIT 1;

  IF _existing_candidate_id IS NOT NULL THEN
    NEW.candidate_id := _existing_candidate_id;
    UPDATE public.candidates
    SET job_id = COALESCE(job_id, NEW.job_id),
        source = COALESCE(source, 'portal')
    WHERE id = _existing_candidate_id;
  ELSE
    INSERT INTO public.candidates (name, email, phone, resume_url, job_id, source, candidate_status, uploaded_by)
    VALUES (
      NEW.applicant_name,
      trim(NEW.applicant_email),
      NEW.applicant_phone,
      NEW.resume_url,
      NEW.job_id,
      'portal',
      'new',
      _primary_recruiter_id
    )
    RETURNING id INTO _new_candidate_id;

    NEW.candidate_id := _new_candidate_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.auto_create_default_pipeline() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.job_interview_stages (job_id, stage_name, order_index, is_eliminatory)
  VALUES (NEW.id, 'Screening', 1, false);
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.auto_score_mcq_response() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    _question_type text;
    _correct_answer jsonb;
    _question_marks integer;
    _options jsonb;
    _correct_ids jsonb;
    _candidate_ids jsonb;
    _is_correct boolean := false;
BEGIN
    SELECT type, correct_answer, marks, options
    INTO _question_type, _correct_answer, _question_marks, _options
    FROM public.questions
    WHERE id = NEW.question_id;

    IF _question_type IS DISTINCT FROM 'mcq' THEN
        RETURN NEW;
    END IF;

    -- Resolve correct option id(s) into a jsonb array of strings
    IF _correct_answer IS NOT NULL THEN
        IF jsonb_typeof(_correct_answer) = 'array' THEN
            _correct_ids := _correct_answer;
        ELSIF jsonb_typeof(_correct_answer) = 'string' THEN
            _correct_ids := jsonb_build_array(_correct_answer #>> '{}');
        ELSIF jsonb_typeof(_correct_answer) = 'object' THEN
            IF jsonb_typeof(_correct_answer->'correct') = 'array' THEN
                _correct_ids := _correct_answer->'correct';
            ELSIF (_correct_answer->>'correct') IS NOT NULL THEN
                _correct_ids := jsonb_build_array(_correct_answer->>'correct');
            ELSE
                _correct_ids := '[]'::jsonb;
            END IF;
        ELSE
            _correct_ids := '[]'::jsonb;
        END IF;
    ELSIF _options IS NOT NULL AND jsonb_typeof(_options) = 'array' THEN
        -- Fallback: options[].is_correct = true
        SELECT COALESCE(jsonb_agg(opt->>'id'), '[]'::jsonb)
        INTO _correct_ids
        FROM jsonb_array_elements(_options) AS opt
        WHERE COALESCE((opt->>'is_correct')::boolean, false);
    ELSE
        _correct_ids := NULL;
    END IF;

    IF _correct_ids IS NULL OR _correct_ids = '[]'::jsonb THEN
        RETURN NEW;
    END IF;

    -- Normalize candidate response to a jsonb array of option id strings
    IF NEW.response IS NULL THEN
        _candidate_ids := '[]'::jsonb;
    ELSIF jsonb_typeof(NEW.response) = 'string' THEN
        _candidate_ids := jsonb_build_array(NEW.response #>> '{}');
    ELSIF jsonb_typeof(NEW.response) = 'object' THEN
        IF jsonb_typeof(NEW.response->'selected') = 'array' THEN
            _candidate_ids := NEW.response->'selected';
        ELSIF (NEW.response->>'selected') IS NOT NULL THEN
            _candidate_ids := jsonb_build_array(NEW.response->>'selected');
        ELSE
            _candidate_ids := '[]'::jsonb;
        END IF;
    ELSIF jsonb_typeof(NEW.response) = 'array' THEN
        _candidate_ids := NEW.response;
    ELSE
        _candidate_ids := '[]'::jsonb;
    END IF;

    -- Scoring (simple):
    --   one selected id  → full marks if that id is in the correct set
    --   multiple selected → full marks if non-empty and every selected id is correct
    -- Use ? (existence) for the single-id path — clearer than @> scalar and identical
    -- for string option ids. (`["c"]` @> `"c"` is also true in Postgres.)
    IF jsonb_array_length(_candidate_ids) = 1 THEN
        _is_correct := _correct_ids ? (_candidate_ids->>0);
    ELSIF jsonb_array_length(_candidate_ids) > 1 THEN
        _is_correct := (_candidate_ids <@ _correct_ids);
    ELSE
        _is_correct := false;
    END IF;

    IF _is_correct THEN
        NEW.auto_score := _question_marks;
    ELSE
        NEW.auto_score := 0;
    END IF;

    -- MCQs do not need manual review
    NEW.final_score := NEW.auto_score;

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    _total_score NUMERIC;
    _max_score NUMERIC;
    _percentage NUMERIC;
    _passing_score INTEGER;
    _passed BOOLEAN;
BEGIN
    -- Get total score from responses
    SELECT COALESCE(SUM(final_score), 0) INTO _total_score
    FROM public.candidate_responses
    WHERE candidate_assessment_id = _candidate_assessment_id;
    
    -- Get max possible score
    SELECT COALESCE(SUM(q.marks), 0) INTO _max_score
    FROM public.candidate_assessments ca
    JOIN public.assessments a ON ca.assessment_id = a.id
    JOIN public.assessment_sections s ON s.assessment_id = a.id
    JOIN public.questions q ON q.section_id = s.id
    WHERE ca.id = _candidate_assessment_id;
    
    -- Calculate percentage
    IF _max_score > 0 THEN
        _percentage = (_total_score / _max_score) * 100;
    ELSE
        _percentage = 0;
    END IF;
    
    -- Get passing score
    SELECT a.passing_score INTO _passing_score
    FROM public.candidate_assessments ca
    JOIN public.assessments a ON ca.assessment_id = a.id
    WHERE ca.id = _candidate_assessment_id;
    
    _passed = _percentage >= _passing_score;
    
    -- Update candidate assessment
    UPDATE public.candidate_assessments
    SET total_score = _total_score,
        percentage = _percentage,
        passed = _passed
    WHERE id = _candidate_assessment_id;
END;
$$;

CREATE FUNCTION public.calculate_response_final_score() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.final_score = COALESCE(NEW.manual_score, NEW.auto_score);
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.calculate_total_on_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- When status changes to 'completed', calculate total score
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        PERFORM public.calculate_assessment_total_score(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.caller_owns_resume_path(_resume_url text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT regexp_replace(regexp_replace(_resume_url, '^.*/resumes/', ''), '^resumes/', '')
           LIKE auth.uid()::text || '-%'
      OR EXISTS (
        SELECT 1 FROM public.applicant_profiles ap
        WHERE ap.user_id = auth.uid()
          AND ap.resume_url = _resume_url
      );
$$;

CREATE FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.is_admin_or_hr(_user_id)
    OR public.is_recruiter_for_job(_user_id, _job_id)
    OR public.is_interviewer_for_job(_user_id, _job_id);
$$;

CREATE FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.is_admin_or_hr(_user_id)
    OR public.is_recruiter_for_job(_user_id, _job_id)
    OR public.is_interviewer_for_job(_user_id, _job_id);
$$;

CREATE FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.is_interviewer_for_candidate(_user_id, _candidate_id)
    OR (
      _job_id IS NOT NULL
      AND public.is_interviewer_for_job(_user_id, _job_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.candidates c
      WHERE c.id = _candidate_id
        AND c.job_id IS NOT NULL
        AND public.is_interviewer_for_job(_user_id, c.job_id)
    );
$$;

CREATE FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text;
  v_note text;
  v_row public.candidate_interviews%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  IF v_reason NOT IN (
    'panel_unavailable',
    'candidate_emergency',
    'candidate_withdrew_slot',
    'other'
  ) THEN
    RAISE EXCEPTION 'Invalid cancellation reason';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_row
  FROM public.candidate_interviews
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;

  v_allowed :=
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'hr'::public.app_role)
    OR public.has_role(v_uid, 'recruiter'::public.app_role)
    OR v_row.interviewer_user_id = v_uid
    OR EXISTS (
      SELECT 1
      FROM public.candidate_interview_panelists cip
      WHERE cip.candidate_interview_id = p_id
        AND cip.interviewer_user_id = v_uid
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to cancel this interview';
  END IF;

  IF v_row.scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Interview is not scheduled';
  END IF;

  IF v_row.verdict IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cancel a completed interview';
  END IF;

  UPDATE public.candidate_interviews
  SET
    scheduled_at = NULL,
    cancelled_at = now(),
    cancelled_by = v_uid,
    cancellation_reason = v_reason,
    cancellation_meta = jsonb_build_object(
      'note', v_note,
      'previous_scheduled_at', v_row.scheduled_at
    )
  WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.candidate_interviews_freeze_completed_stage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.verdict IS NULL AND NEW.verdict IS NOT NULL AND NEW.stage_name_snapshot IS NULL THEN
    SELECT jis.stage_name
    INTO NEW.stage_name_snapshot
    FROM public.job_interview_stages jis
    WHERE jis.id = NEW.job_interview_stage_id;
  END IF;

  IF OLD.stage_name_snapshot IS NOT NULL THEN
    NEW.stage_name_snapshot := OLD.stage_name_snapshot;
  END IF;

  IF OLD.verdict IS NOT NULL
     AND NEW.job_interview_stage_id IS DISTINCT FROM OLD.job_interview_stage_id THEN
    NEW.job_interview_stage_id := OLD.job_interview_stage_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.candidate_interviews_snapshot_stage_on_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.stage_name_snapshot IS NULL AND NEW.job_interview_stage_id IS NOT NULL THEN
    SELECT jis.stage_name
    INTO NEW.stage_name_snapshot
    FROM public.job_interview_stages jis
    WHERE jis.id = NEW.job_interview_stage_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.chitra_resolve_feedback_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.verdict IS NOT NULL AND (OLD.verdict IS NULL OR TG_OP = 'INSERT') THEN
    UPDATE public.chitra_escalations
       SET resolved_at = NOW()
     WHERE violation_type = 'overdue_feedback'
       AND reference_id = NEW.id
       AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_job_id uuid;
  v_hired_at timestamptz;
  v_enrolled boolean;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A decline reason is required';
  END IF;

  SELECT c.job_id, c.hired_at
  INTO v_job_id, v_hired_at
  FROM public.candidates c
  WHERE c.id = p_candidate_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or not assigned to a job';
  END IF;

  IF NOT public.can_decide_pending_approval(auth.uid(), v_job_id) THEN
    RAISE EXCEPTION 'Not authorized to decline pending candidates for this job';
  END IF;

  IF v_hired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hired candidates cannot be declined from pending approval';
  END IF;

  -- Only decline if not actively enrolled in this job's pipeline
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    INNER JOIN public.job_interview_stages jis
      ON jis.id = ci.job_interview_stage_id
     AND jis.job_id = v_job_id
    WHERE ci.candidate_id = p_candidate_id
      AND ci.removed_from_pipeline_at IS NULL
  ) INTO v_enrolled;

  IF v_enrolled THEN
    RAISE EXCEPTION 'Candidate is already in the interview pipeline';
  END IF;

  UPDATE public.candidates
  SET
    candidate_status = 'rejected',
    pending_approval_decline_reason = v_reason
  WHERE id = p_candidate_id;
END;
$$;

CREATE FUNCTION public.enforce_portal_application_rate_limit(_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _email_hash text := encode(sha256(convert_to(_email, 'UTF8')), 'hex');
  _ip inet := public.request_client_ip();
  _client_hash text;
BEGIN
  IF _ip IS NOT NULL THEN
    _client_hash := encode(sha256(convert_to(host(_ip), 'UTF8')), 'hex');
  END IF;

  DELETE FROM public.portal_application_attempts
  WHERE created_at < now() - interval '1 day';

  IF (
    SELECT count(*) FROM public.portal_application_attempts
    WHERE created_at > now() - interval '1 minute'
  ) >= 60
  OR (
    SELECT count(*) FROM public.portal_application_attempts
    WHERE email_hash = _email_hash
      AND created_at > now() - interval '1 hour'
  ) >= 10
  OR (
    _client_hash IS NOT NULL
    AND (
      SELECT count(*) FROM public.portal_application_attempts
      WHERE client_hash = _client_hash
        AND created_at > now() - interval '1 hour'
    ) >= 30
  ) THEN
    RAISE EXCEPTION 'Too many applications submitted. Please try again in a few minutes.'
      USING ERRCODE = 'PT429';
  END IF;

  INSERT INTO public.portal_application_attempts (email_hash, client_hash)
  VALUES (_email_hash, _client_hash);
END;
$$;

CREATE FUNCTION public.enrich_applicant_from_candidate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    _candidate RECORD;
    _name_parts TEXT[];
BEGIN
    SELECT *
    INTO _candidate
    FROM public.candidates
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    ORDER BY updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    NEW.full_name := COALESCE(
        NULLIF(trim(NEW.full_name), ''),
        NULLIF(trim(NEW.full_name), NEW.email),
        NULLIF(trim(_candidate.name), ''),
        NEW.full_name
    );
    NEW.phone := COALESCE(NEW.phone, _candidate.phone);
    NEW.resume_url := COALESCE(NEW.resume_url, _candidate.resume_url);
    NEW.linkedin_url := COALESCE(NULLIF(trim(NEW.linkedin_url), ''), _candidate.linkedin_url);

    IF NEW.work_experience IS NULL OR NEW.work_experience = '[]'::jsonb THEN
        IF _candidate.work_experience IS NOT NULL AND _candidate.work_experience <> '[]'::jsonb THEN
            NEW.work_experience := _candidate.work_experience;
        END IF;
    END IF;

    IF NEW.education IS NULL OR NEW.education = '[]'::jsonb THEN
        IF _candidate.education IS NOT NULL AND _candidate.education <> '[]'::jsonb THEN
            NEW.education := _candidate.education;
        END IF;
    END IF;

    IF NEW.skills IS NULL OR NEW.skills = '[]'::jsonb THEN
        IF _candidate.skills IS NOT NULL AND _candidate.skills <> '[]'::jsonb THEN
            NEW.skills := _candidate.skills;
        ELSIF _candidate.skills_tags IS NOT NULL AND _candidate.skills_tags <> '[]'::jsonb THEN
            NEW.skills := _candidate.skills_tags;
        END IF;
    END IF;

    IF (NEW.first_name IS NULL OR trim(NEW.first_name) = '' OR NEW.first_name LIKE '%@%')
        AND _candidate.name IS NOT NULL
        AND trim(_candidate.name) <> '' THEN
        _name_parts := regexp_split_to_array(trim(_candidate.name), '\s+');
        NEW.first_name := _name_parts[1];
        IF array_length(_name_parts, 1) > 1 THEN
            NEW.last_name := _name_parts[array_length(_name_parts, 1)];
            IF array_length(_name_parts, 1) > 2 THEN
                NEW.middle_name := array_to_string(_name_parts[2:array_length(_name_parts, 1) - 1], ' ');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION public.format_notification_time(_ts timestamp with time zone, _user_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET "TimeZone" TO 'UTC'
    AS $$
BEGIN
  IF _ts IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_catalog.set_config('timezone', public.notification_timezone(_user_id), true);
  RETURN to_char(_ts, 'DD Mon, HH12:MI AM TZ');
END;
$$;

CREATE FUNCTION public.get_applicant_portal_auth_users() RETURNS TABLE(user_id uuid, email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE COALESCE(u.raw_user_meta_data ->> 'portal', '') = 'applicant'
    AND public.is_admin_or_hr(auth.uid());
$$;

CREATE FUNCTION public.get_dashboard_metrics(p_period text DEFAULT 'week'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
  -- is_staff: Index.tsx calls useDashboardMetrics for every staff role.
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

CREATE FUNCTION public.get_email_send_counts() RETURNS TABLE(sent_today bigint, sent_this_month bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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

CREATE FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) RETURNS TABLE(id uuid, candidate_id uuid, total_experience_years numeric, relevant_experience_years numeric, relevant_experience_domain text, current_location text, preferred_location text, comms_rating numeric, academics jsonb, nutshell text, screened_by uuid, screened_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    cp.id,
    cp.candidate_id,
    cp.total_experience_years,
    cp.relevant_experience_years,
    cp.relevant_experience_domain,
    cp.current_location,
    cp.preferred_location,
    cp.comms_rating,
    cp.academics,
    cp.nutshell,
    cp.screened_by,
    cp.screened_at,
    cp.created_at,
    cp.updated_at
  FROM public.candidate_prescreens cp
  WHERE cp.candidate_id = _candidate_id
    AND public.is_interviewer_for_candidate(auth.uid(), _candidate_id)
  LIMIT 1;
$$;

CREATE FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) RETURNS uuid[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_job_hiring(auth.uid(), p_job_id) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  RETURN coalesce(
    (
      SELECT array_agg(DISTINCT ci.candidate_id)
      FROM public.candidate_interviews ci
      INNER JOIN public.job_interview_stages jis
        ON jis.id = ci.job_interview_stage_id
        AND jis.job_id = p_job_id
      WHERE ci.removed_from_pipeline_at IS NULL
    ),
    ARRAY[]::uuid[]
  );
END;
$$;

CREATE FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_job_hiring(auth.uid(), p_job_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(row_data ORDER BY (row_data->'job_interview_stage'->>'order_index')::int ASC NULLS LAST),
    '[]'::jsonb
  )
  INTO result
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

  RETURN result;
END;
$$;

CREATE FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) RETURNS TABLE(job_id uuid, pending_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) RETURNS TABLE(job_id uuid, candidate_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) RETURNS TABLE(recruiter_id uuid, recruiter_name text, sourced integer, in_pipeline integer, conversion_pct integer, proceeded integer, hired integer, pending integer, job_count integer, rank integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_reports_job_pipeline_stats() RETURNS TABLE(job_id uuid, in_pipeline bigint, proceeded bigint, pending bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    jis.job_id,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ci.verdict = 'proceeded')::BIGINT,
    COUNT(*) FILTER (WHERE ci.scheduled_at IS NOT NULL AND ci.verdict IS NULL)::BIGINT
  FROM public.candidate_interviews ci
  JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  JOIN public.jobs j ON j.id = jis.job_id
  WHERE ci.removed_from_pipeline_at IS NULL
    AND j.status <> 'closed'
  GROUP BY jis.job_id;
$$;

CREATE FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 800) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
      AND (
        public.is_admin_or_hr(auth.uid())
        OR public.is_recruiter_for_job(auth.uid(), jis.job_id)
        OR ci.interviewer_user_id = auth.uid()
        OR public.is_panelist_for_interview(auth.uid(), ci.id)
        OR public.is_assigned_interviewer_for_interview(auth.uid(), ci.id)
      )
    ORDER BY ci.scheduled_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 800), 1500), 1)
  ) rows;
$$;

CREATE FUNCTION public.get_sourcing_trend(p_weeks integer DEFAULT 8) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_time_velocity_metrics(p_period_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) RETURNS TABLE(user_id uuid, email_confirmed boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT u.id, (u.email_confirmed_at IS NOT NULL)
  FROM auth.users u
  WHERE public.is_admin_or_hr(auth.uid())
    AND u.id = ANY(_user_ids);
$$;

CREATE FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) RETURNS TABLE(source_key text, submitted integer, in_pipeline integer, conversion_pct integer, shortlisted integer, hired integer, rank integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _full_name text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email);

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, _full_name, NEW.email);

  IF COALESCE(NEW.raw_user_meta_data ->> 'portal', '') = 'applicant' THEN
    INSERT INTO public.applicant_profiles (user_id, email, full_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(_full_name, split_part(COALESCE(NEW.email, ''), '@', 1), 'Applicant')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

CREATE FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb DEFAULT NULL::jsonb, _after_data jsonb DEFAULT NULL::jsonb, _ip inet DEFAULT NULL::inet) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_staff(_actor) OR NOT public.mfa_satisfied() THEN
    RAISE EXCEPTION 'Staff role required to write audit log' USING ERRCODE = '42501';
  END IF;

  IF _action = 'candidate.updated' AND _entity_type = 'candidate' THEN
    IF NOT EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = _entity_id) THEN
      RAISE EXCEPTION 'Unknown audit entity' USING ERRCODE = '22023';
    END IF;
  ELSIF _action = 'interview.scheduled' AND _entity_type = 'interview' THEN
    IF NOT EXISTS (SELECT 1 FROM public.candidate_interviews ci WHERE ci.id = _entity_id) THEN
      RAISE EXCEPTION 'Unknown audit entity' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Audit action % is recorded by the server', _action
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(pg_column_size(_before_data), 0) + COALESCE(pg_column_size(_after_data), 0) > 65536 THEN
    RAISE EXCEPTION 'Audit payload too large' USING ERRCODE = '22023';
  END IF;

  RETURN public.audit_log_record(_action, _entity_type, _entity_id, _before_data, _after_data);
END;
$$;

CREATE FUNCTION public.invoke_edge_function(p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _cfg jsonb;
  _base text;
  _bearer text;
BEGIN
  SELECT value INTO _cfg
  FROM public.internal_webhook_config
  WHERE key = 'edge_functions';

  IF _cfg IS NULL OR COALESCE((_cfg->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  _base := nullif(rtrim(trim(_cfg->>'base_url'), '/'), '');
  _bearer := nullif(trim(_cfg->>'bearer_token'), '');
  IF _base IS NULL OR _bearer IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _base || '/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _bearer
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE FUNCTION public.invoke_hire_email_webhook(p_candidate_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _hook jsonb;
  _url text;
  _bearer text;
BEGIN
  SELECT value INTO _hook
  FROM public.internal_webhook_config
  WHERE key = 'hire_email';

  IF _hook IS NULL OR COALESCE((_hook->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  _url := nullif(trim(_hook->>'url'), '');
  _bearer := nullif(trim(_hook->>'bearer_token'), '');
  IF _url IS NULL OR _bearer IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _bearer
      ),
      body := jsonb_build_object('candidate_id', p_candidate_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

CREATE FUNCTION public.invoke_staff_email_webhook(p_event text, p_interview_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _hook jsonb;
  _url text;
  _bearer text;
BEGIN
  SELECT value INTO _hook
  FROM public.internal_webhook_config
  WHERE key = 'staff_email';

  IF _hook IS NULL OR COALESCE((_hook->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  _url := nullif(trim(_hook->>'url'), '');
  _bearer := nullif(trim(_hook->>'bearer_token'), '');
  IF _url IS NULL OR _bearer IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _bearer
      ),
      body := jsonb_build_object(
        'event', p_event,
        'interview_id', p_interview_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

CREATE FUNCTION public.is_admin_or_hr(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'hr')
    )
$$;

CREATE FUNCTION public.is_anon_resume_upload_path(_path text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  SELECT COALESCE(_path ~* '^[0-9]{13}-[a-z0-9]{0,12}\.(pdf|docx?)$', false);
$_$;

CREATE FUNCTION public.is_applicant(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.applicant_profiles
        WHERE user_id = _user_id
    )
$$;

CREATE FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.candidate_interviewers cint ON cint.candidate_id = ci.candidate_id
    WHERE ci.id = _candidate_interview_id
      AND cint.interviewer_user_id = _user_id
  )
$$;

CREATE FUNCTION public.is_interview_pool_member(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'interviewer'::public.app_role
      AND COALESCE(p.can_conduct_interviews, false) = true
  );
$$;

CREATE FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidate_interviewers
    WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
  )
  OR EXISTS (
    SELECT 1 FROM public.candidate_interviews
    WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    JOIN public.candidate_interviews civ ON civ.id = cip.candidate_interview_id
    WHERE cip.interviewer_user_id = _user_id
      AND civ.candidate_id = _candidate_id
  );
$$;

CREATE FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviewers ci
    JOIN public.candidates c ON c.id = ci.candidate_id
    WHERE ci.interviewer_user_id = _user_id
      AND c.job_id = _job_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interviews civ
    JOIN public.job_interview_stages jis ON jis.id = civ.job_interview_stage_id
    WHERE civ.interviewer_user_id = _user_id
      AND jis.job_id = _job_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    JOIN public.candidate_interviews civ ON civ.id = cip.candidate_interview_id
    JOIN public.job_interview_stages jis ON jis.id = civ.job_interview_stage_id
    WHERE cip.interviewer_user_id = _user_id
      AND jis.job_id = _job_id
  );
$$;

CREATE FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = _candidate_interview_id
      AND cip.interviewer_user_id = _user_id
  )
$$;

CREATE FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.id = _candidate_interview_id
      AND ci.interviewer_user_id = _user_id
  )
$$;

CREATE FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.id = _candidate_interview_id
      AND public.is_recruiter_for_job(_user_id, jis.job_id)
  )
$$;

CREATE FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.job_recruiters
        WHERE recruiter_user_id = _user_id AND job_id = _job_id
    )
$$;

CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'hr', 'recruiter', 'interviewer')
    )
$$;

CREATE FUNCTION public.is_staff_user(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'hr', 'recruiter', 'interviewer')
  );
$$;

CREATE FUNCTION public.list_my_job_applications() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY sort_created_at DESC),
    '[]'::jsonb
  )
  INTO _result
  FROM (
    SELECT
      ja.created_at AS sort_created_at,
      to_jsonb(ja) || jsonb_build_object(
        'job',
        CASE
          WHEN j.id IS NOT NULL THEN jsonb_build_object(
            'id', j.id,
            'title', j.title,
            'department', j.department,
            'location', j.location,
            'job_type', j.job_type,
            'require_digital_application_form', j.require_digital_application_form
          )
          ELSE NULL
        END
      ) AS row_data
    FROM public.job_applications ja
    INNER JOIN public.applicant_profiles ap
      ON lower(trim(ap.email)) = lower(trim(ja.applicant_email))
    LEFT JOIN public.jobs j ON j.id = ja.job_id
    WHERE ap.user_id = auth.uid()
  ) rows;

  RETURN _result;
END;
$$;

CREATE FUNCTION public.lookup_applicant_avatars(p_emails text[]) RETURNS TABLE(email text, avatar_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT lower(trim(ap.email)) AS email, ap.avatar_url
  FROM public.applicant_profiles ap
  WHERE public.is_staff_user(auth.uid())
    AND ap.avatar_url IS NOT NULL
    AND lower(trim(ap.email)) IN (
      SELECT lower(trim(e))
      FROM unnest(COALESCE(p_emails, ARRAY[]::text[])) AS e
      WHERE e IS NOT NULL AND btrim(e) <> ''
    );
$$;

CREATE FUNCTION public.mfa_satisfied() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT EXISTS (
        SELECT 1
        FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid()
          AND f.status = 'verified'
      );
$$;

CREATE FUNCTION public.notification_timezone(_user_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _tz text;
BEGIN
  SELECT NULLIF(btrim(p.timezone), '')
  INTO _tz
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  IF _tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = _tz) THEN
    RETURN _tz;
  END IF;

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

CREATE FUNCTION public.notify_candidate_hired() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.hired_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.hired_at IS NOT DISTINCT FROM NEW.hired_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.invoke_hire_email_webhook(NEW.id);
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_interview_cancelled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_candidate_name text;
  v_panelist_id uuid;
  v_when_at timestamptz;
BEGIN
  IF NEW.cancelled_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.cancelled_at IS NOT DISTINCT FROM NEW.cancelled_at THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  v_when_at := COALESCE((NEW.cancellation_meta->>'previous_scheduled_at')::timestamptz, NEW.cancelled_at);

  FOR v_panelist_id IN
    SELECT cip.interviewer_user_id
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = NEW.id
    UNION
    SELECT NEW.interviewer_user_id
    WHERE NEW.interviewer_user_id IS NOT NULL
  LOOP
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = v_panelist_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || NEW.id || '%';

    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      v_panelist_id,
      'interview_cancelled',
      'Interview Cancelled',
      'Interview with ' || COALESCE(v_candidate_name, 'a candidate')
        || ' (' || public.format_notification_time(v_when_at, v_panelist_id) || ') was cancelled'
        || ' — interview_ref:' || NEW.id,
      '/calendar'
    );
  END LOOP;

  PERFORM public.invoke_staff_email_webhook('interview_cancelled', NEW.id);

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_interview_scheduled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _candidate_name TEXT;
  _scheduled_display TEXT;
BEGIN
  IF NEW.scheduled_at IS NULL OR NEW.interviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
       AND NEW.interviewer_user_id IS NOT DISTINCT FROM OLD.interviewer_user_id THEN
      RETURN NEW;
    END IF;
    DELETE FROM public.notifications
    WHERE type = 'interview_scheduled'
      AND user_id = OLD.interviewer_user_id
      AND is_read = false
      AND message LIKE '%interview_ref:' || OLD.id || '%';
  END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;
  _scheduled_display := public.format_notification_time(NEW.scheduled_at, NEW.interviewer_user_id);

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.interviewer_user_id,
    'interview_scheduled',
    'Interview Scheduled',
    'You have been assigned to interview ' || COALESCE(_candidate_name, 'a candidate')
      || ' on ' || _scheduled_display
      || ' — interview_ref:' || NEW.id,
    '/calendar'
  );

  PERFORM public.invoke_staff_email_webhook('interview_scheduled', NEW.id);

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_panelist_added() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  _scheduled_display := public.format_notification_time(_scheduled_at, NEW.interviewer_user_id);

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

  PERFORM public.invoke_staff_email_webhook('interview_scheduled', NEW.candidate_interview_id);

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_verdict_submitted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _candidate_name TEXT;
  _verdict_label  TEXT;
BEGIN
  IF NEW.verdict IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.verdict IS NOT NULL THEN RETURN NEW; END IF;

  SELECT name INTO _candidate_name FROM public.candidates WHERE id = NEW.candidate_id;

  _verdict_label := CASE NEW.verdict
    WHEN 'proceeded' THEN 'Proceed ✓'
    WHEN 'rejected'  THEN 'Reject ✗'
    WHEN 'hold'      THEN 'On Hold'
    WHEN 'no_show'   THEN 'No Show'
    ELSE NEW.verdict::TEXT
  END;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT
    jr.recruiter_user_id,
    'verdict_submitted',
    'Interview Feedback Submitted',
    COALESCE(_candidate_name, 'A candidate') || ': ' || _verdict_label,
    '/pipeline'
  FROM public.job_interview_stages jis
  JOIN public.job_recruiters jr ON jr.job_id = jis.job_id
  WHERE jis.id = NEW.job_interview_stage_id
    AND jr.recruiter_user_id IS DISTINCT FROM NEW.interviewer_user_id;

  PERFORM public.invoke_staff_email_webhook('verdict_submitted', NEW.id);

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text DEFAULT NULL::text, p_linkedin_url text DEFAULT NULL::text, p_resume_url text DEFAULT NULL::text, p_cover_letter text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

  IF NULLIF(trim(p_resume_url), '') IS NOT NULL THEN
    IF _is_anon THEN
      IF NOT public.is_anon_resume_upload_path(p_resume_url) THEN
        RAISE EXCEPTION 'Invalid resume reference' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT public.caller_owns_resume_path(p_resume_url) THEN
      RAISE EXCEPTION 'Invalid resume reference' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM public.enforce_portal_application_rate_limit(_norm_email);

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

CREATE FUNCTION public.prevent_interviewer_interview_identity_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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

CREATE FUNCTION public.prevent_interviewer_pipeline_stage_move() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.job_interview_stage_id IS NOT DISTINCT FROM OLD.job_interview_stage_id THEN
    RETURN NEW;
  END IF;

  -- Service role / system paths (no JWT user)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_or_hr(auth.uid())
     OR public.has_role(auth.uid(), 'recruiter'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Interviewers cannot move candidates between pipeline stages'
    USING ERRCODE = '42501';
END;
$$;

CREATE FUNCTION public.protect_profile_privilege_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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

CREATE FUNCTION public.protect_super_admin_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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

CREATE FUNCTION public.register_profile_as_applicant(_target_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  p record;
  existing_user_id uuid;
BEGIN
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT user_id, email, full_name INTO p
  FROM public.profiles
  WHERE user_id = _target_user_id;

  IF p IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p.email IS NULL OR trim(p.email) = '' THEN
    RAISE EXCEPTION 'Profile has no email';
  END IF;

  SELECT user_id INTO existing_user_id
  FROM public.applicant_profiles
  WHERE lower(trim(email)) = lower(trim(p.email))
    AND user_id != _target_user_id
  LIMIT 1;

  IF existing_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Applicant profile already exists for this email on another account';
  END IF;

  INSERT INTO public.applicant_profiles (user_id, email, full_name)
  VALUES (
    _target_user_id,
    trim(p.email),
    COALESCE(NULLIF(trim(p.full_name), ''), trim(p.email))
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE FUNCTION public.request_client_ip() RETURNS inet
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  _raw text;
BEGIN
  _raw := trim(split_part(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1
  ));
  RETURN NULLIF(_raw, '')::inet;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE FUNCTION public.require_mfa_on_write() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.mfa_satisfied() THEN
    RAISE EXCEPTION 'MFA verification required' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.restrict_applicant_assessment_scores() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.total_score := OLD.total_score;
  NEW.percentage := OLD.percentage;
  NEW.passed := OLD.passed;
  NEW.evaluator_notes := OLD.evaluator_notes;
  NEW.assessment_id := OLD.assessment_id;
  NEW.candidate_id := OLD.candidate_id;
  NEW.access_token := OLD.access_token;
  NEW.assigned_by := OLD.assigned_by;
  NEW.assigned_via := OLD.assigned_via;
  NEW.job_id := OLD.job_id;
  NEW.deadline := OLD.deadline;
  NEW.invited_at := OLD.invited_at;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.restrict_applicant_candidate_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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

  IF NEW.resume_url IS DISTINCT FROM OLD.resume_url
     AND NULLIF(trim(NEW.resume_url), '') IS NOT NULL
     AND NOT public.caller_owns_resume_path(NEW.resume_url) THEN
    RAISE EXCEPTION 'invalid resume reference' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.restrict_applicant_profile_resume_url() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NULLIF(trim(NEW.resume_url), '') IS NOT NULL
     AND NOT public.caller_owns_resume_path(NEW.resume_url) THEN
    RAISE EXCEPTION 'invalid resume reference' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.restrict_applicant_response_scores() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.auto_score := NULL;
    NEW.manual_score := NULL;
    NEW.final_score := NULL;
    NEW.feedback := NULL;
    NEW.evaluated_at := NULL;
    NEW.evaluated_by := NULL;
  ELSE
    NEW.auto_score := OLD.auto_score;
    NEW.manual_score := OLD.manual_score;
    NEW.final_score := OLD.final_score;
    NEW.feedback := OLD.feedback;
    NEW.evaluated_at := OLD.evaluated_at;
    NEW.evaluated_by := OLD.evaluated_by;
    NEW.candidate_assessment_id := OLD.candidate_assessment_id;
    NEW.question_id := OLD.question_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only admins/HR may call this
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE profiles
  SET can_conduct_interviews = _value
  WHERE user_id = _target_user_id;
END;
$$;

CREATE FUNCTION public.staff_can_access_job_application(_application_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.job_applications ja
      JOIN public.job_recruiters jr ON jr.job_id = ja.job_id
      WHERE ja.id = _application_id AND jr.recruiter_user_id = auth.uid()
    );
$$;

CREATE FUNCTION public.sync_job_application_from_candidate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _app_source TEXT;
BEGIN
  IF NEW.job_id IS NULL OR NEW.email IS NULL OR trim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.job_id IS NOT DISTINCT FROM NEW.job_id
     AND lower(trim(OLD.email)) IS NOT DISTINCT FROM lower(trim(NEW.email))
     AND OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.phone IS NOT DISTINCT FROM NEW.phone
     AND OLD.resume_url IS NOT DISTINCT FROM NEW.resume_url
     AND OLD.candidate_status IS NOT DISTINCT FROM NEW.candidate_status THEN
    RETURN NEW;
  END IF;

  -- Nested call from auto_create_candidate_from_application during job_applications INSERT.
  -- The parent INSERT will create the application row; syncing here races the unique index.
  IF pg_trigger_depth() > 1 THEN
    UPDATE public.job_applications ja
    SET
      candidate_id = COALESCE(ja.candidate_id, NEW.id),
      updated_at = now()
    WHERE ja.job_id = NEW.job_id
      AND lower(trim(ja.applicant_email)) = lower(trim(NEW.email));

    RETURN NEW;
  END IF;

  _app_source := CASE
    WHEN COALESCE(NEW.source, 'recruiter') = 'portal' THEN 'portal'
    ELSE 'recruiter'
  END;

  INSERT INTO public.job_applications (
    job_id,
    candidate_id,
    applicant_name,
    applicant_email,
    applicant_phone,
    resume_url,
    status,
    source
  )
  VALUES (
    NEW.job_id,
    NEW.id,
    NEW.name,
    trim(NEW.email),
    NEW.phone,
    NEW.resume_url,
    COALESCE(NULLIF(NEW.candidate_status, ''), 'new'),
    _app_source
  )
  ON CONFLICT (job_id, lower(trim(applicant_email))) DO UPDATE SET
    candidate_id = COALESCE(public.job_applications.candidate_id, EXCLUDED.candidate_id),
    applicant_name = EXCLUDED.applicant_name,
    applicant_phone = COALESCE(EXCLUDED.applicant_phone, public.job_applications.applicant_phone),
    resume_url = COALESCE(EXCLUDED.resume_url, public.job_applications.resume_url),
    source = CASE
      WHEN public.job_applications.source = 'portal' THEN 'portal'
      ELSE EXCLUDED.source
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message text NOT NULL,
    link_label text,
    link_url text,
    type text DEFAULT 'info'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT announcements_type_check CHECK ((type = ANY (ARRAY['info'::text, 'warning'::text, 'release'::text, 'maintenance'::text])))
);

CREATE TABLE public.applicant_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    linkedin_url text,
    resume_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    work_experience jsonb DEFAULT '[]'::jsonb,
    education jsonb DEFAULT '[]'::jsonb,
    skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    notification_prefs jsonb DEFAULT '{"marketing": false, "application_updates": true, "assessment_reminders": true}'::jsonb NOT NULL,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    middle_name text,
    dob_actual date,
    dob_documented date,
    gender text,
    marital_status text,
    blood_group text,
    emergency_phone text,
    first_name text,
    last_name text,
    avatar_url text,
    sensitive_data_consent_at timestamp with time zone,
    sensitive_data_consent_source text
);

CREATE VIEW public.assessment_details AS
SELECT
    NULL::uuid AS id,
    NULL::text AS title,
    NULL::text AS description,
    NULL::integer AS duration_minutes,
    NULL::integer AS passing_score,
    NULL::jsonb AS settings,
    NULL::bigint AS section_count,
    NULL::bigint AS question_count,
    NULL::bigint AS total_marks;

CREATE TABLE public.assessment_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    order_index integer DEFAULT 0 NOT NULL,
    weightage integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skill_tags jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE public.assessment_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    template_data jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    created_by uuid,
    duration_minutes integer DEFAULT 60 NOT NULL,
    passing_score integer DEFAULT 60 NOT NULL,
    status public.assessment_status DEFAULT 'draft'::public.assessment_status NOT NULL,
    settings jsonb DEFAULT '{"allow_review": false, "randomize_questions": false, "show_score_immediately": false}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_job_id uuid,
    ai_generated boolean DEFAULT false NOT NULL
);

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    before_data jsonb,
    after_data jsonb,
    ip inet
);

CREATE TABLE public.candidate_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    assessment_id uuid NOT NULL,
    access_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    status public.candidate_assessment_status DEFAULT 'invited'::public.candidate_assessment_status NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_score numeric(5,2),
    percentage numeric(5,2),
    passed boolean,
    integrity_log jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluator_notes text,
    token_expires_at timestamp with time zone,
    job_id uuid,
    assigned_by uuid,
    assigned_via text,
    consent_given boolean DEFAULT false NOT NULL,
    consent_given_at timestamp with time zone,
    consent_source text,
    CONSTRAINT candidate_assessments_assigned_via_check CHECK ((assigned_via = ANY (ARRAY['manual'::text, 'job_default'::text, 'auto_stage'::text])))
);

CREATE TABLE public.candidate_interview_panelists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_interview_id uuid NOT NULL,
    interviewer_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.candidate_interviewers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    interviewer_user_id uuid NOT NULL,
    assigned_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.candidate_interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    job_interview_stage_id uuid,
    interviewer_user_id uuid,
    verdict public.interview_verdict,
    overall_score numeric(3,1),
    rating_categories jsonb DEFAULT '{}'::jsonb,
    feedback text,
    interview_mode public.interview_mode,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    advanced_by uuid,
    advanced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    meeting_link text,
    rejection_reason text,
    removed_from_pipeline_at timestamp with time zone,
    removed_by uuid,
    round integer DEFAULT 1 NOT NULL,
    artifacts jsonb DEFAULT '[]'::jsonb,
    interview_notes text,
    enrolled_at timestamp with time zone,
    stage_name_snapshot text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancellation_reason text,
    cancellation_meta jsonb,
    CONSTRAINT candidate_interviews_overall_score_check CHECK (((overall_score IS NULL) OR ((overall_score >= (1)::numeric) AND (overall_score <= (5)::numeric))))
);

CREATE TABLE public.candidate_prescreens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    total_experience_years numeric,
    relevant_experience_years numeric,
    relevant_experience_domain text,
    current_ctc text,
    expected_ctc text,
    notice_period text,
    lwd text,
    current_location text,
    preferred_location text,
    comms_rating numeric,
    nutshell text,
    academics jsonb DEFAULT '[]'::jsonb,
    screened_by uuid,
    screened_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    open_to_relocation text,
    work_mode_preference text[],
    CONSTRAINT candidate_prescreens_comms_rating_check CHECK (((comms_rating >= (0)::numeric) AND (comms_rating <= (10)::numeric)))
);

CREATE TABLE public.candidate_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_assessment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    response jsonb,
    auto_score numeric(5,2),
    manual_score numeric(5,2),
    final_score numeric(5,2),
    evaluated_by uuid,
    feedback text,
    evaluated_at timestamp with time zone,
    time_spent_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.candidate_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_tags_tag_not_empty CHECK ((char_length(TRIM(BOTH FROM tag)) > 0))
);

CREATE TABLE public.candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    role_applied text,
    resume_url text,
    skills jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_id uuid,
    source text DEFAULT 'manual'::text,
    parse_score integer DEFAULT 0,
    experience_years numeric,
    candidate_current_role text,
    candidate_current_company text,
    enrichment_score integer,
    skills_tags jsonb DEFAULT '[]'::jsonb,
    last_enriched_at timestamp with time zone,
    suitability_score integer,
    suitability_analysis jsonb,
    last_analyzed_at timestamp with time zone,
    structured_skills jsonb DEFAULT '[]'::jsonb,
    work_experience jsonb,
    education jsonb,
    certifications jsonb DEFAULT '[]'::jsonb,
    awards jsonb DEFAULT '[]'::jsonb,
    credential_score integer,
    candidate_status text DEFAULT 'new'::text NOT NULL,
    linkedin_url text,
    ai_summary text,
    uploaded_by uuid,
    red_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    referred_by text,
    pending_approval_decline_reason text,
    hired_at timestamp with time zone,
    CONSTRAINT enrichment_score_range CHECK (((enrichment_score IS NULL) OR ((enrichment_score >= 0) AND (enrichment_score <= 100)))),
    CONSTRAINT parse_score_range CHECK (((parse_score >= 0) AND (parse_score <= 100)))
);

CREATE TABLE public.chitra_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    violation_type text DEFAULT 'overdue_feedback'::text NOT NULL,
    subject_user_id uuid,
    reference_id uuid NOT NULL,
    escalation_level integer DEFAULT 0 NOT NULL,
    last_escalated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient text NOT NULL,
    subject text NOT NULL,
    template_type text NOT NULL,
    status text NOT NULL,
    provider text DEFAULT 'resend'::text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT email_delivery_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text, 'quota_blocked'::text])))
);

CREATE TABLE public.external_refs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    external_url text,
    synced_at timestamp with time zone,
    CONSTRAINT external_refs_entity_type_check CHECK ((entity_type = ANY (ARRAY['candidate'::text, 'job'::text, 'application'::text, 'interview'::text])))
);

CREATE TABLE public.internal_webhook_config (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.interview_kits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_interview_id uuid NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    source text NOT NULL,
    scorecard_template_id uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT interview_kits_source_check CHECK ((source = ANY (ARRAY['template'::text, 'gemini'::text])))
);

CREATE TABLE public.interview_stage_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    stages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.job_application_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_application_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_question_keys text[] DEFAULT '{}'::text[] NOT NULL,
    employment_references jsonb DEFAULT '[]'::jsonb NOT NULL,
    filled_by_recruiter boolean DEFAULT false NOT NULL,
    filled_by_user_id uuid,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_application_forms_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text])))
);

CREATE TABLE public.job_application_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    question_key text NOT NULL,
    answer_text text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.job_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    candidate_id uuid,
    applicant_name text NOT NULL,
    applicant_email text NOT NULL,
    applicant_phone text,
    resume_url text,
    cover_letter text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    linkedin_url text,
    source text DEFAULT 'portal'::text NOT NULL,
    form_sent_at timestamp with time zone,
    jd_sent_at timestamp with time zone,
    CONSTRAINT job_applications_source_check CHECK ((source = ANY (ARRAY['portal'::text, 'recruiter'::text, 'import'::text])))
);

CREATE TABLE public.job_interview_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    stage_name text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    is_eliminatory boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.job_recruiters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    recruiter_user_id uuid NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    department text,
    location text,
    job_type public.job_type DEFAULT 'full_time'::public.job_type NOT NULL,
    experience_level public.experience_level,
    salary_min numeric,
    salary_max numeric,
    salary_currency text DEFAULT 'INR'::text,
    required_skills jsonb DEFAULT '[]'::jsonb,
    benefits jsonb DEFAULT '[]'::jsonb,
    application_deadline timestamp with time zone,
    status public.job_status DEFAULT 'draft'::public.job_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    domain text,
    experience_years_range text,
    position_type text DEFAULT 'tech'::text,
    total_openings integer DEFAULT 1,
    positions_filled integer DEFAULT 0 NOT NULL,
    require_digital_application_form boolean DEFAULT true NOT NULL,
    assessment_enabled boolean DEFAULT false NOT NULL,
    default_assessment_id uuid,
    assessment_config jsonb DEFAULT '{"deadline_days": 7, "pass_threshold_override": null, "notify_recruiter_on_complete": true, "require_pass_before_interview": true}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status_note text
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'system'::text NOT NULL,
    action_buttons jsonb
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;

CREATE TABLE public.pipeline_analysis_cache (
    job_id uuid NOT NULL,
    result jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.portal_application_attempts (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email_hash text NOT NULL,
    client_hash text
);

ALTER TABLE public.portal_application_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.portal_application_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.prescreen_question_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_key text NOT NULL,
    question_text text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_hint integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    CONSTRAINT prescreen_question_bank_category_check CHECK ((category = ANY (ARRAY['about_you'::text, 'current_role'::text, 'achievements'::text, 'motivation'::text, 'career_goals'::text, 'workplace'::text, 'judgment'::text, 'challenges'::text])))
);

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL,
    can_conduct_interviews boolean DEFAULT false NOT NULL,
    timezone text,
    is_active boolean DEFAULT true NOT NULL,
    deactivated_at timestamp with time zone,
    deactivated_by uuid
);

CREATE VIEW public.public_job_listings WITH (security_invoker='on') AS
 SELECT id,
    title,
    description,
    domain,
    department,
    location,
    job_type,
    experience_level,
    experience_years_range,
    application_deadline,
    created_at,
    updated_at
   FROM public.jobs
  WHERE (status = 'open'::public.job_status);

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    type public.question_type NOT NULL,
    question_text text NOT NULL,
    options jsonb,
    correct_answer jsonb,
    marks integer DEFAULT 1 NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    coding_language text,
    coding_starter_code text,
    coding_test_cases jsonb,
    subjective_max_words integer,
    subjective_rubric text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    file_config jsonb
);

CREATE TABLE public.scorecard_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_key text NOT NULL,
    display_name text NOT NULL,
    criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    prompt_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.system_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_key text NOT NULL,
    config_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    source_key text NOT NULL,
    contact_name text,
    contact_email text,
    fee_pct numeric(5,2),
    guarantee_days integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.applicant_profiles
    ADD CONSTRAINT applicant_profiles_email_key UNIQUE (email);

ALTER TABLE ONLY public.applicant_profiles
    ADD CONSTRAINT applicant_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.applicant_profiles
    ADD CONSTRAINT applicant_profiles_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.assessment_sections
    ADD CONSTRAINT assessment_sections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessment_templates
    ADD CONSTRAINT assessment_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_access_token_key UNIQUE (access_token);

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_candidate_id_assessment_id_key UNIQUE (candidate_id, assessment_id);

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_interview_panelists
    ADD CONSTRAINT candidate_interview_panelists_candidate_interview_id_interv_key UNIQUE (candidate_interview_id, interviewer_user_id);

ALTER TABLE ONLY public.candidate_interview_panelists
    ADD CONSTRAINT candidate_interview_panelists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_interviewers
    ADD CONSTRAINT candidate_interviewers_candidate_id_interviewer_user_id_key UNIQUE (candidate_id, interviewer_user_id);

ALTER TABLE ONLY public.candidate_interviewers
    ADD CONSTRAINT candidate_interviewers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_prescreens
    ADD CONSTRAINT candidate_prescreens_candidate_id_key UNIQUE (candidate_id);

ALTER TABLE ONLY public.candidate_prescreens
    ADD CONSTRAINT candidate_prescreens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_responses
    ADD CONSTRAINT candidate_responses_candidate_assessment_id_question_id_key UNIQUE (candidate_assessment_id, question_id);

ALTER TABLE ONLY public.candidate_responses
    ADD CONSTRAINT candidate_responses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidate_tags
    ADD CONSTRAINT candidate_tags_candidate_tag_unique UNIQUE (candidate_id, tag);

ALTER TABLE ONLY public.candidate_tags
    ADD CONSTRAINT candidate_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_email_key UNIQUE (email);

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chitra_escalations
    ADD CONSTRAINT chitra_escalations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_delivery_log
    ADD CONSTRAINT email_delivery_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_refs
    ADD CONSTRAINT external_refs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_refs
    ADD CONSTRAINT external_refs_provider_entity_type_external_id_key UNIQUE (provider, entity_type, external_id);

ALTER TABLE ONLY public.internal_webhook_config
    ADD CONSTRAINT internal_webhook_config_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.interview_kits
    ADD CONSTRAINT interview_kits_candidate_interview_id_key UNIQUE (candidate_interview_id);

ALTER TABLE ONLY public.interview_kits
    ADD CONSTRAINT interview_kits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.interview_stage_templates
    ADD CONSTRAINT interview_stage_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_application_forms
    ADD CONSTRAINT job_application_forms_job_application_id_key UNIQUE (job_application_id);

ALTER TABLE ONLY public.job_application_forms
    ADD CONSTRAINT job_application_forms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_application_responses
    ADD CONSTRAINT job_application_responses_form_id_question_key_key UNIQUE (form_id, question_key);

ALTER TABLE ONLY public.job_application_responses
    ADD CONSTRAINT job_application_responses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_interview_stages
    ADD CONSTRAINT job_interview_stages_job_id_stage_name_key UNIQUE (job_id, stage_name);

ALTER TABLE ONLY public.job_interview_stages
    ADD CONSTRAINT job_interview_stages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_recruiters
    ADD CONSTRAINT job_recruiters_job_id_recruiter_user_id_key UNIQUE (job_id, recruiter_user_id);

ALTER TABLE ONLY public.job_recruiters
    ADD CONSTRAINT job_recruiters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pipeline_analysis_cache
    ADD CONSTRAINT pipeline_analysis_cache_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY public.portal_application_attempts
    ADD CONSTRAINT portal_application_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.prescreen_question_bank
    ADD CONSTRAINT prescreen_question_bank_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.prescreen_question_bank
    ADD CONSTRAINT prescreen_question_bank_question_key_key UNIQUE (question_key);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scorecard_templates
    ADD CONSTRAINT scorecard_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scorecard_templates
    ADD CONSTRAINT scorecard_templates_stage_key_key UNIQUE (stage_key);

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_config_key_key UNIQUE (config_key);

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_source_key_key UNIQUE (source_key);

CREATE UNIQUE INDEX applicant_profiles_email_lower_trim_idx ON public.applicant_profiles USING btree (lower(TRIM(BOTH FROM email)));

CREATE INDEX idx_assessment_sections_assessment_id ON public.assessment_sections USING btree (assessment_id);

CREATE INDEX idx_assessment_sections_skill_tags ON public.assessment_sections USING gin (skill_tags);

CREATE INDEX idx_assessments_created_by ON public.assessments USING btree (created_by);

CREATE INDEX idx_assessments_source_job_id ON public.assessments USING btree (source_job_id) WHERE (source_job_id IS NOT NULL);

CREATE INDEX idx_assessments_status ON public.assessments USING btree (status);

CREATE INDEX idx_audit_log_actor ON public.audit_log USING btree (actor_id);

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);

CREATE INDEX idx_candidate_assessments_access_token ON public.candidate_assessments USING btree (access_token);

CREATE INDEX idx_candidate_assessments_assessment_id ON public.candidate_assessments USING btree (assessment_id);

CREATE INDEX idx_candidate_assessments_candidate_id ON public.candidate_assessments USING btree (candidate_id);

CREATE INDEX idx_candidate_assessments_candidate_job ON public.candidate_assessments USING btree (candidate_id, job_id);

CREATE INDEX idx_candidate_assessments_job_id ON public.candidate_assessments USING btree (job_id);

CREATE INDEX idx_candidate_assessments_status ON public.candidate_assessments USING btree (status);

CREATE INDEX idx_candidate_interview_panelists_interview ON public.candidate_interview_panelists USING btree (candidate_interview_id);

CREATE INDEX idx_candidate_interview_panelists_user ON public.candidate_interview_panelists USING btree (interviewer_user_id);

CREATE INDEX idx_candidate_interviewers_candidate ON public.candidate_interviewers USING btree (candidate_id);

CREATE INDEX idx_candidate_interviewers_user ON public.candidate_interviewers USING btree (interviewer_user_id);

CREATE INDEX idx_candidate_interviews_active_stage ON public.candidate_interviews USING btree (job_interview_stage_id) WHERE (removed_from_pipeline_at IS NULL);

CREATE INDEX idx_candidate_interviews_candidate ON public.candidate_interviews USING btree (candidate_id);

CREATE INDEX idx_candidate_interviews_interviewer ON public.candidate_interviews USING btree (interviewer_user_id);

CREATE INDEX idx_candidate_interviews_not_removed ON public.candidate_interviews USING btree (job_interview_stage_id) WHERE (removed_from_pipeline_at IS NULL);

CREATE INDEX idx_candidate_interviews_round ON public.candidate_interviews USING btree (candidate_id, job_interview_stage_id, round DESC);

CREATE INDEX idx_candidate_interviews_scheduled_active ON public.candidate_interviews USING btree (scheduled_at) WHERE ((scheduled_at IS NOT NULL) AND (removed_from_pipeline_at IS NULL));

CREATE INDEX idx_candidate_interviews_stage ON public.candidate_interviews USING btree (job_interview_stage_id);

CREATE INDEX idx_candidate_responses_candidate_assessment_id ON public.candidate_responses USING btree (candidate_assessment_id);

CREATE INDEX idx_candidate_responses_question_id ON public.candidate_responses USING btree (question_id);

CREATE INDEX idx_candidate_tags_candidate_id ON public.candidate_tags USING btree (candidate_id);

CREATE INDEX idx_candidate_tags_tag ON public.candidate_tags USING btree (tag);

CREATE INDEX idx_candidates_created_at_desc ON public.candidates USING btree (created_at DESC);

CREATE INDEX idx_candidates_email ON public.candidates USING btree (email);

CREATE INDEX idx_candidates_email_trgm ON public.candidates USING gin (email public.gin_trgm_ops);

CREATE INDEX idx_candidates_enrichment_score ON public.candidates USING btree (enrichment_score DESC NULLS LAST);

CREATE INDEX idx_candidates_hired_at ON public.candidates USING btree (hired_at) WHERE (hired_at IS NOT NULL);

CREATE INDEX idx_candidates_job_id ON public.candidates USING btree (job_id);

CREATE INDEX idx_candidates_name_trgm ON public.candidates USING gin (name public.gin_trgm_ops);

CREATE INDEX idx_candidates_parse_score ON public.candidates USING btree (parse_score DESC);

CREATE INDEX idx_candidates_source ON public.candidates USING btree (source);

CREATE INDEX idx_candidates_structured_skills ON public.candidates USING gin (structured_skills);

CREATE INDEX idx_chitra_escalations_open ON public.chitra_escalations USING btree (violation_type, last_escalated_at) WHERE (resolved_at IS NULL);

CREATE INDEX idx_chitra_escalations_reference_open ON public.chitra_escalations USING btree (reference_id, violation_type) WHERE (resolved_at IS NULL);

CREATE INDEX idx_email_delivery_log_created_at ON public.email_delivery_log USING btree (created_at DESC);

CREATE INDEX idx_email_delivery_log_quota ON public.email_delivery_log USING btree (created_at, status) WHERE (status = 'sent'::text);

CREATE INDEX idx_external_refs_entity ON public.external_refs USING btree (entity_type, entity_id);

CREATE INDEX idx_interview_kits_interview ON public.interview_kits USING btree (candidate_interview_id);

CREATE INDEX idx_job_application_forms_job_application_id ON public.job_application_forms USING btree (job_application_id);

CREATE INDEX idx_job_application_forms_status ON public.job_application_forms USING btree (status);

CREATE INDEX idx_job_application_responses_form_id ON public.job_application_responses USING btree (form_id);

CREATE INDEX idx_job_applications_job_id ON public.job_applications USING btree (job_id);

CREATE INDEX idx_job_interview_stages_job ON public.job_interview_stages USING btree (job_id);

CREATE INDEX idx_job_recruiters_job ON public.job_recruiters USING btree (job_id);

CREATE INDEX idx_job_recruiters_primary ON public.job_recruiters USING btree (job_id, is_primary) WHERE (is_primary = true);

CREATE INDEX idx_job_recruiters_user ON public.job_recruiters USING btree (recruiter_user_id);

CREATE INDEX idx_jobs_assessment_enabled ON public.jobs USING btree (assessment_enabled) WHERE (assessment_enabled = true);

CREATE INDEX idx_jobs_created_at_desc ON public.jobs USING btree (created_at DESC);

CREATE INDEX idx_jobs_default_assessment_id ON public.jobs USING btree (default_assessment_id) WHERE (default_assessment_id IS NOT NULL);

CREATE INDEX idx_jobs_department ON public.jobs USING btree (department);

CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at DESC);

CREATE INDEX idx_pipeline_analysis_cache_generated_at ON public.pipeline_analysis_cache USING btree (generated_at DESC);

CREATE INDEX idx_portal_application_attempts_client ON public.portal_application_attempts USING btree (client_hash, created_at) WHERE (client_hash IS NOT NULL);

CREATE INDEX idx_portal_application_attempts_created_at ON public.portal_application_attempts USING btree (created_at);

CREATE INDEX idx_portal_application_attempts_email ON public.portal_application_attempts USING btree (email_hash, created_at);

CREATE INDEX idx_prescreen_question_bank_category ON public.prescreen_question_bank USING btree (category) WHERE (is_active = true);

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);

CREATE INDEX idx_questions_section_id ON public.questions USING btree (section_id);

CREATE INDEX idx_scorecard_templates_stage_key ON public.scorecard_templates USING btree (stage_key);

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);

CREATE UNIQUE INDEX job_applications_job_id_applicant_email_key ON public.job_applications USING btree (job_id, lower(TRIM(BOTH FROM applicant_email)));

CREATE INDEX jobs_sort_order_idx ON public.jobs USING btree (sort_order);

CREATE INDEX profiles_is_active_idx ON public.profiles USING btree (is_active);

CREATE OR REPLACE VIEW public.assessment_details WITH (security_invoker='on') AS
 SELECT a.id,
    a.title,
    a.description,
    a.duration_minutes,
    a.passing_score,
    a.settings,
    count(DISTINCT s.id) AS section_count,
    count(DISTINCT q.id) AS question_count,
    sum(q.marks) AS total_marks
   FROM ((public.assessments a
     LEFT JOIN public.assessment_sections s ON ((s.assessment_id = a.id)))
     LEFT JOIN public.questions q ON ((q.section_id = s.id)))
  WHERE (a.status = 'active'::public.assessment_status)
  GROUP BY a.id;

CREATE TRIGGER aa_restrict_applicant_assessment_scores BEFORE UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.restrict_applicant_assessment_scores();

CREATE TRIGGER aa_restrict_applicant_response_scores BEFORE INSERT OR UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.restrict_applicant_response_scores();

CREATE TRIGGER applicant_profiles_bind_auth_email BEFORE INSERT OR UPDATE ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.applicant_profiles_bind_auth_email();

CREATE TRIGGER auto_candidate_on_application BEFORE INSERT ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.auto_create_candidate_from_application();

CREATE TRIGGER auto_score_mcq_on_insert BEFORE INSERT ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.auto_score_mcq_response();

CREATE TRIGGER auto_score_mcq_on_update BEFORE UPDATE ON public.candidate_responses FOR EACH ROW WHEN ((old.response IS DISTINCT FROM new.response)) EXECUTE FUNCTION public.auto_score_mcq_response();

CREATE TRIGGER calculate_response_score BEFORE INSERT OR UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.calculate_response_final_score();

CREATE TRIGGER calculate_total_on_completion AFTER UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.calculate_total_on_completion();

CREATE TRIGGER candidate_interviews_freeze_completed_stage BEFORE UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.candidate_interviews_freeze_completed_stage();

CREATE TRIGGER candidate_interviews_snapshot_stage_on_insert BEFORE INSERT ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.candidate_interviews_snapshot_stage_on_insert();

CREATE TRIGGER enrich_applicant_from_candidate_trigger BEFORE INSERT ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.enrich_applicant_from_candidate();

CREATE TRIGGER on_feedback_resolves_chitra_escalation AFTER INSERT OR UPDATE OF verdict ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.chitra_resolve_feedback_escalation();

CREATE TRIGGER on_interview_scheduled AFTER INSERT OR UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.notify_interview_scheduled();

CREATE TRIGGER on_job_created AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.auto_create_default_pipeline();

CREATE TRIGGER on_new_job_application BEFORE INSERT ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.auto_create_candidate_from_application();

CREATE TRIGGER on_panelist_added AFTER INSERT ON public.candidate_interview_panelists FOR EACH ROW EXECUTE FUNCTION public.notify_panelist_added();

CREATE TRIGGER on_profile_created_assign_admin AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_assign_first_admin();

CREATE TRIGGER on_verdict_submitted AFTER INSERT OR UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.notify_verdict_submitted();

CREATE TRIGGER sync_job_application_on_candidate AFTER INSERT OR UPDATE OF job_id, email, name, phone, resume_url, candidate_status ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.sync_job_application_from_candidate();

CREATE TRIGGER trg_audit_candidate_interview_decision AFTER INSERT OR UPDATE OF verdict, advanced_at ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.audit_candidate_interview_decision();

CREATE TRIGGER trg_audit_candidate_status_change AFTER UPDATE OF candidate_status, hired_at ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.audit_candidate_status_change();

CREATE TRIGGER trg_audit_job_application_status_change AFTER UPDATE OF status ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.audit_job_application_status_change();

CREATE TRIGGER trg_audit_log_block_mutation BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

CREATE TRIGGER trg_audit_log_block_truncate BEFORE TRUNCATE ON public.audit_log FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_block_mutation();

CREATE TRIGGER trg_audit_user_role_change AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_user_role_change();

CREATE TRIGGER trg_notify_candidate_hired AFTER INSERT OR UPDATE OF hired_at ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_hired();

CREATE TRIGGER trg_notify_interview_cancelled AFTER UPDATE OF cancelled_at ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.notify_interview_cancelled();

CREATE TRIGGER trg_prevent_interviewer_interview_identity_change BEFORE UPDATE OF candidate_id, interviewer_user_id ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.prevent_interviewer_interview_identity_change();

CREATE TRIGGER trg_prevent_interviewer_pipeline_stage_move BEFORE UPDATE OF job_interview_stage_id ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.prevent_interviewer_pipeline_stage_move();

CREATE TRIGGER trg_protect_profile_privilege_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privilege_columns();

CREATE TRIGGER trg_protect_super_admin_role BEFORE DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_role();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.applicant_profiles FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.candidate_interviews FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.candidates FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.job_applications FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.system_config FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_require_mfa_on_write BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION public.require_mfa_on_write();

CREATE TRIGGER trg_restrict_applicant_candidate_update BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.restrict_applicant_candidate_update();

CREATE TRIGGER trg_restrict_applicant_profile_resume_url BEFORE INSERT OR UPDATE OF resume_url ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.restrict_applicant_profile_resume_url();

CREATE TRIGGER update_applicant_profiles_updated_at BEFORE UPDATE ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assessment_sections_updated_at BEFORE UPDATE ON public.assessment_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assessment_templates_updated_at BEFORE UPDATE ON public.assessment_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_assessments_updated_at BEFORE UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_interviews_updated_at BEFORE UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_prescreens_updated_at BEFORE UPDATE ON public.candidate_prescreens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_responses_updated_at BEFORE UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interview_stage_templates_updated_at BEFORE UPDATE ON public.interview_stage_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_application_forms_updated_at BEFORE UPDATE ON public.job_application_forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_application_responses_updated_at BEFORE UPDATE ON public.job_application_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_applications_updated_at BEFORE UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_interview_stages_updated_at BEFORE UPDATE ON public.job_interview_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scorecard_templates_updated_at BEFORE UPDATE ON public.scorecard_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.applicant_profiles
    ADD CONSTRAINT applicant_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assessment_sections
    ADD CONSTRAINT assessment_sections_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assessment_templates
    ADD CONSTRAINT assessment_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_source_job_id_fkey FOREIGN KEY (source_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_assessments
    ADD CONSTRAINT candidate_assessments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidate_interview_panelists
    ADD CONSTRAINT candidate_interview_panelists_candidate_interview_id_fkey FOREIGN KEY (candidate_interview_id) REFERENCES public.candidate_interviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_interview_panelists
    ADD CONSTRAINT candidate_interview_panelists_interviewer_user_id_fkey FOREIGN KEY (interviewer_user_id) REFERENCES public.profiles(user_id);

ALTER TABLE ONLY public.candidate_interviewers
    ADD CONSTRAINT candidate_interviewers_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_interviewer_user_id_fkey FOREIGN KEY (interviewer_user_id) REFERENCES public.profiles(user_id);

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_job_interview_stage_id_fkey FOREIGN KEY (job_interview_stage_id) REFERENCES public.job_interview_stages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidate_interviews
    ADD CONSTRAINT candidate_interviews_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.candidate_prescreens
    ADD CONSTRAINT candidate_prescreens_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_prescreens
    ADD CONSTRAINT candidate_prescreens_screened_by_fkey FOREIGN KEY (screened_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.candidate_responses
    ADD CONSTRAINT candidate_responses_candidate_assessment_id_fkey FOREIGN KEY (candidate_assessment_id) REFERENCES public.candidate_assessments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_responses
    ADD CONSTRAINT candidate_responses_evaluated_by_fkey FOREIGN KEY (evaluated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidate_responses
    ADD CONSTRAINT candidate_responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidate_tags
    ADD CONSTRAINT candidate_tags_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.chitra_escalations
    ADD CONSTRAINT chitra_escalations_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.interview_kits
    ADD CONSTRAINT interview_kits_candidate_interview_id_fkey FOREIGN KEY (candidate_interview_id) REFERENCES public.candidate_interviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.interview_kits
    ADD CONSTRAINT interview_kits_scorecard_template_id_fkey FOREIGN KEY (scorecard_template_id) REFERENCES public.scorecard_templates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_application_forms
    ADD CONSTRAINT job_application_forms_filled_by_user_id_fkey FOREIGN KEY (filled_by_user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.job_application_forms
    ADD CONSTRAINT job_application_forms_job_application_id_fkey FOREIGN KEY (job_application_id) REFERENCES public.job_applications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_application_responses
    ADD CONSTRAINT job_application_responses_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.job_application_forms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_interview_stages
    ADD CONSTRAINT job_interview_stages_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_recruiters
    ADD CONSTRAINT job_recruiters_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_default_assessment_id_fkey FOREIGN KEY (default_assessment_id) REFERENCES public.assessments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pipeline_analysis_cache
    ADD CONSTRAINT pipeline_analysis_cache_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.assessment_sections(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Admin HR read email delivery log" ON public.email_delivery_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role)));

CREATE POLICY "Admin HR recruiter can view assessment sections" ON public.assessment_sections FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role))))));

CREATE POLICY "Admin HR recruiter can view assessments" ON public.assessments FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role))))));

CREATE POLICY "Admin HR recruiters manage panelists" ON public.candidate_interview_panelists USING ((public.is_admin_or_hr(auth.uid()) OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_id))) WITH CHECK ((public.is_admin_or_hr(auth.uid()) OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_id)));

CREATE POLICY "Admin and HR can manage candidate_interviewers" ON public.candidate_interviewers USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role]))))));

CREATE POLICY "Admin and HR read audit_log" ON public.audit_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_super_admin = true))))));

CREATE POLICY "Admin can delete config" ON public.system_config FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can insert business branding" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = 'business_branding'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin can manage all interviews" ON public.candidate_interviews USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage config" ON public.system_config TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage job stages" ON public.job_interview_stages USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage job_recruiters" ON public.job_recruiters USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage scorecard templates" ON public.scorecard_templates USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can manage stage templates" ON public.interview_stage_templates USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can update business branding" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = 'business_branding'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((config_key = 'business_branding'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin insert assessment generation settings" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = 'assessment_generation_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin insert assessment org defaults" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = 'assessment_org_defaults'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin insert compliance settings" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = ANY (ARRAY['compliance_settings'::text, 'sso_settings'::text])) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_super_admin = true)))))));

CREATE POLICY "Admin insert email notification settings" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = 'email_notification_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin insert email settings" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = 'email_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin read assessment generation settings" ON public.system_config FOR SELECT TO authenticated USING (((config_key = 'assessment_generation_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin read assessment org defaults" ON public.system_config FOR SELECT TO authenticated USING (((config_key = 'assessment_org_defaults'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin read compliance settings" ON public.system_config FOR SELECT TO authenticated USING (((config_key = ANY (ARRAY['compliance_settings'::text, 'sso_settings'::text])) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_super_admin = true)))))));

CREATE POLICY "Admin read email notification settings" ON public.system_config FOR SELECT TO authenticated USING (((config_key = 'email_notification_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin read email settings" ON public.system_config FOR SELECT TO authenticated USING (((config_key = 'email_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin update assessment generation settings" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = 'assessment_generation_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((config_key = 'assessment_generation_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin update assessment org defaults" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = 'assessment_org_defaults'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((config_key = 'assessment_org_defaults'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin update compliance settings" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = ANY (ARRAY['compliance_settings'::text, 'sso_settings'::text])) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_super_admin = true))))))) WITH CHECK (((config_key = ANY (ARRAY['compliance_settings'::text, 'sso_settings'::text])) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_super_admin = true)))))));

CREATE POLICY "Admin update email notification settings" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = 'email_notification_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((config_key = 'email_notification_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin update email settings" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = 'email_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((config_key = 'email_settings'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Admin/HR can create assessments" ON public.assessments FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create candidate assessments" ON public.candidate_assessments FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create candidates" ON public.candidates FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create jobs" ON public.jobs FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create prescreens" ON public.candidate_prescreens FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create questions" ON public.questions FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create responses" ON public.candidate_responses FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create sections" ON public.assessment_sections FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete applications" ON public.job_applications FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete assessments" ON public.assessments FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidate assessments" ON public.candidate_assessments FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidate_tags" ON public.candidate_tags FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidates" ON public.candidates FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete jobs" ON public.jobs FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete prescreens" ON public.candidate_prescreens FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete questions" ON public.questions FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete responses" ON public.candidate_responses FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete sections" ON public.assessment_sections FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can insert candidate_tags" ON public.candidate_tags FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can manage question bank" ON public.prescreen_question_bank USING (public.is_admin_or_hr(auth.uid())) WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update applications" ON public.job_applications FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update assessments" ON public.assessments FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update candidate assessments" ON public.candidate_assessments FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update candidates" ON public.candidates FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update jobs" ON public.jobs FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update prescreens" ON public.candidate_prescreens FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update questions" ON public.questions FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update responses" ON public.candidate_responses FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update sections" ON public.assessment_sections FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all applicant profiles" ON public.applicant_profiles FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all applications" ON public.job_applications FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all assessments" ON public.assessments FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all candidate assessments" ON public.candidate_assessments FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all candidates" ON public.candidates FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all jobs" ON public.jobs FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all prescreens" ON public.candidate_prescreens FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all questions" ON public.questions FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all responses" ON public.candidate_responses FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all sections" ON public.assessment_sections FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view candidate_tags" ON public.candidate_tags FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view roles" ON public.user_roles FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admins can read chitra escalations" ON public.chitra_escalations FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anon can read business branding" ON public.system_config FOR SELECT TO anon USING ((config_key = 'business_branding'::text));

CREATE POLICY "Anyone can read active question bank" ON public.prescreen_question_bank FOR SELECT USING ((is_active = true));

CREATE POLICY "Applicants can insert own application forms" ON public.job_application_forms FOR INSERT WITH CHECK (public.applicant_owns_job_application(job_application_id));

CREATE POLICY "Applicants can insert own application responses" ON public.job_application_responses FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.job_application_forms jaf
  WHERE ((jaf.id = job_application_responses.form_id) AND public.applicant_owns_job_application(jaf.job_application_id) AND (jaf.status = 'pending'::text)))));

CREATE POLICY "Applicants can insert own profile" ON public.applicant_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Applicants can insert own responses" ON public.candidate_responses FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (ap.user_id = auth.uid())))));

CREATE POLICY "Applicants can update own application responses" ON public.job_application_responses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.job_application_forms jaf
  WHERE ((jaf.id = job_application_responses.form_id) AND public.applicant_owns_job_application(jaf.job_application_id) AND (jaf.status = 'pending'::text)))));

CREATE POLICY "Applicants can update own assessments" ON public.candidate_assessments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((c.id = candidate_assessments.candidate_id) AND (ap.user_id = auth.uid())))));

CREATE POLICY "Applicants can update own candidate record" ON public.candidates FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.applicant_profiles ap
  WHERE ((ap.user_id = auth.uid()) AND (lower(TRIM(BOTH FROM ap.email)) = lower(TRIM(BOTH FROM candidates.email)))))));

CREATE POLICY "Applicants can update own pending application forms" ON public.job_application_forms FOR UPDATE USING ((public.applicant_owns_job_application(job_application_id) AND (status = 'pending'::text))) WITH CHECK ((public.applicant_owns_job_application(job_application_id) AND (status = ANY (ARRAY['pending'::text, 'submitted'::text]))));

CREATE POLICY "Applicants can update own profile" ON public.applicant_profiles FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Applicants can update own responses" ON public.candidate_responses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (ap.user_id = auth.uid())))));

CREATE POLICY "Applicants can view assigned assessment metadata" ON public.assessments FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((ca.assessment_id = assessments.id) AND (ap.user_id = auth.uid()))))));

CREATE POLICY "Applicants can view assigned assessment questions" ON public.questions FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR (EXISTS ( SELECT 1
   FROM (((public.assessment_sections s
     JOIN public.candidate_assessments ca ON ((ca.assessment_id = s.assessment_id)))
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((s.id = questions.section_id) AND (ap.user_id = auth.uid()))))));

CREATE POLICY "Applicants can view assigned assessment sections" ON public.assessment_sections FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((ca.assessment_id = assessment_sections.assessment_id) AND (ap.user_id = auth.uid()))))));

CREATE POLICY "Applicants can view own application forms" ON public.job_application_forms FOR SELECT USING (public.applicant_owns_job_application(job_application_id));

CREATE POLICY "Applicants can view own application responses" ON public.job_application_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.job_application_forms jaf
  WHERE ((jaf.id = job_application_responses.form_id) AND public.applicant_owns_job_application(jaf.job_application_id)))));

CREATE POLICY "Applicants can view own applications" ON public.job_applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.applicant_profiles ap
  WHERE ((ap.user_id = auth.uid()) AND (lower(TRIM(BOTH FROM ap.email)) = lower(TRIM(BOTH FROM job_applications.applicant_email)))))));

CREATE POLICY "Applicants can view own assessments" ON public.candidate_assessments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((c.id = candidate_assessments.candidate_id) AND (ap.user_id = auth.uid())))));

CREATE POLICY "Applicants can view own candidate record" ON public.candidates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.applicant_profiles ap
  WHERE ((ap.user_id = auth.uid()) AND (lower(TRIM(BOTH FROM ap.email)) = lower(TRIM(BOTH FROM candidates.email)))))));

CREATE POLICY "Applicants can view own profile" ON public.applicant_profiles FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Applicants can view own responses" ON public.candidate_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.applicant_profiles ap ON ((ap.email = c.email)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (ap.user_id = auth.uid())))));

CREATE POLICY "Authenticated can read lookup config" ON public.system_config FOR SELECT TO authenticated USING ((config_key = ANY (ARRAY['cert_tiers'::text, 'tier1_colleges'::text, 'job_domains'::text, 'job_teams'::text, 'assessment_org_defaults'::text])));

CREATE POLICY "HR can insert lookup config" ON public.system_config FOR INSERT TO authenticated WITH CHECK (((config_key = ANY (ARRAY['cert_tiers'::text, 'tier1_colleges'::text, 'job_domains'::text, 'job_teams'::text, 'red_flag_rules'::text])) AND public.has_role(auth.uid(), 'hr'::public.app_role)));

CREATE POLICY "HR can manage all interviews" ON public.candidate_interviews USING (public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "HR can manage job stages" ON public.job_interview_stages USING (public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "HR can manage job_recruiters" ON public.job_recruiters USING (public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "HR can read lookup config" ON public.system_config FOR SELECT TO authenticated USING (((config_key = ANY (ARRAY['cert_tiers'::text, 'tier1_colleges'::text, 'job_domains'::text, 'job_teams'::text, 'red_flag_rules'::text])) AND public.has_role(auth.uid(), 'hr'::public.app_role)));

CREATE POLICY "HR can update lookup config" ON public.system_config FOR UPDATE TO authenticated USING (((config_key = ANY (ARRAY['cert_tiers'::text, 'tier1_colleges'::text, 'job_domains'::text, 'job_teams'::text, 'red_flag_rules'::text])) AND public.has_role(auth.uid(), 'hr'::public.app_role))) WITH CHECK (((config_key = ANY (ARRAY['cert_tiers'::text, 'tier1_colleges'::text, 'job_domains'::text, 'job_teams'::text, 'red_flag_rules'::text])) AND public.has_role(auth.uid(), 'hr'::public.app_role)));

CREATE POLICY "Interviewers can create interviews for assigned candidates" ON public.candidate_interviews FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.candidate_interviewers ci
  WHERE ((ci.candidate_id = candidate_interviews.candidate_id) AND (ci.interviewer_user_id = auth.uid())))) AND (interviewer_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.job_interview_stages jis
     JOIN public.candidates c ON ((c.id = candidate_interviews.candidate_id)))
  WHERE ((jis.id = candidate_interviews.job_interview_stage_id) AND ((NOT (c.job_id IS DISTINCT FROM jis.job_id)) OR (EXISTS ( SELECT 1
           FROM public.job_applications ja
          WHERE ((ja.candidate_id = c.id) AND (ja.job_id = jis.job_id))))))))));

CREATE POLICY "Interviewers can insert responses for assigned candidates" ON public.candidate_responses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.candidate_assessments ca
     JOIN public.candidate_interviewers ci ON ((ci.candidate_id = ca.candidate_id)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (ci.interviewer_user_id = auth.uid())))));

CREATE POLICY "Interviewers can update assigned candidate_assessments" ON public.candidate_assessments FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.candidate_interviewers ci
  WHERE ((ci.candidate_id = candidate_assessments.candidate_id) AND (ci.interviewer_user_id = auth.uid())))));

CREATE POLICY "Interviewers can update assigned interviews" ON public.candidate_interviews FOR UPDATE USING (((interviewer_user_id = auth.uid()) OR public.is_panelist_for_interview(auth.uid(), id))) WITH CHECK (((interviewer_user_id = auth.uid()) OR public.is_panelist_for_interview(auth.uid(), id)));

CREATE POLICY "Interviewers can update responses for assigned candidates" ON public.candidate_responses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.candidate_assessments ca
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND public.can_interviewer_view_candidate_assessment(auth.uid(), ca.candidate_id, ca.job_id)))));

CREATE POLICY "Interviewers can view assessments for assigned work" ON public.assessments FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.candidate_assessments ca
  WHERE ((ca.assessment_id = assessments.id) AND public.can_interviewer_view_candidate_assessment(auth.uid(), ca.candidate_id, ca.job_id)))) OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.default_assessment_id = assessments.id) AND public.is_interviewer_for_job(auth.uid(), j.id))))));

CREATE POLICY "Interviewers can view assigned candidate_assessments" ON public.candidate_assessments FOR SELECT USING (public.can_interviewer_view_candidate_assessment(auth.uid(), candidate_id, job_id));

CREATE POLICY "Interviewers can view assigned candidates" ON public.candidates FOR SELECT USING (public.is_interviewer_for_candidate(auth.uid(), id));

CREATE POLICY "Interviewers can view assigned jobs" ON public.jobs FOR SELECT USING (public.is_interviewer_for_job(auth.uid(), id));

CREATE POLICY "Interviewers can view candidates for assigned jobs" ON public.candidates FOR SELECT USING (((job_id IS NOT NULL) AND public.is_interviewer_for_job(auth.uid(), job_id)));

CREATE POLICY "Interviewers can view interviews for assigned candidates" ON public.candidate_interviews FOR SELECT USING (((interviewer_user_id = auth.uid()) OR public.is_panelist_for_interview(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM public.candidate_interviewers ci
  WHERE ((ci.candidate_id = candidate_interviews.candidate_id) AND (ci.interviewer_user_id = auth.uid()))))));

CREATE POLICY "Interviewers can view own assignments" ON public.candidate_interviewers FOR SELECT USING ((interviewer_user_id = auth.uid()));

CREATE POLICY "Interviewers can view questions for assigned candidates" ON public.questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.assessment_sections s
     JOIN public.candidate_assessments ca ON ((ca.assessment_id = s.assessment_id)))
     JOIN public.candidate_interviewers ci ON ((ci.candidate_id = ca.candidate_id)))
  WHERE ((s.id = questions.section_id) AND (ci.interviewer_user_id = auth.uid())))));

CREATE POLICY "Interviewers can view responses for assigned candidates" ON public.candidate_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.candidate_assessments ca
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND public.can_interviewer_view_candidate_assessment(auth.uid(), ca.candidate_id, ca.job_id)))));

CREATE POLICY "Interviewers can view sections for assigned candidates" ON public.assessment_sections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.candidate_assessments ca
     JOIN public.candidate_interviewers ci ON ((ci.candidate_id = ca.candidate_id)))
  WHERE ((ca.assessment_id = assessment_sections.assessment_id) AND (ci.interviewer_user_id = auth.uid())))));

CREATE POLICY "Public and applicants can view open jobs" ON public.jobs FOR SELECT USING (((status = 'open'::public.job_status) AND (NOT public.is_staff(auth.uid()))));

CREATE POLICY "Public read compliance footer settings" ON public.system_config FOR SELECT TO authenticated, anon USING ((config_key = 'compliance_settings'::text));

CREATE POLICY "Recruiters can create candidate_assessments for assigned jobs" ON public.candidate_assessments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((c.id = candidate_assessments.candidate_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can create candidates" ON public.candidates FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can create prescreens for assigned jobs" ON public.candidate_prescreens FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((c.id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM ((public.candidate_interviews ci
     JOIN public.job_interview_stages jis ON ((jis.id = ci.job_interview_stage_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = jis.job_id)))
  WHERE ((ci.candidate_id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid()))))));

CREATE POLICY "Recruiters can delete candidate_tags" ON public.candidate_tags FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can insert candidate_tags" ON public.candidate_tags FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can insert responses for assigned jobs" ON public.candidate_responses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can manage candidate_assessments" ON public.candidate_assessments USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can manage candidate_interviewers" ON public.candidate_interviewers USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can manage interviews for assigned jobs" ON public.candidate_interviews USING ((EXISTS ( SELECT 1
   FROM (public.job_interview_stages jis
     JOIN public.job_recruiters jr ON ((jr.job_id = jis.job_id)))
  WHERE ((jis.id = candidate_interviews.job_interview_stage_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can manage stages for assigned jobs" ON public.job_interview_stages USING (public.is_recruiter_for_job(auth.uid(), job_id));

CREATE POLICY "Recruiters can update applications for assigned jobs" ON public.job_applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.job_recruiters jr
  WHERE ((jr.job_id = job_applications.job_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can update candidate_assessments for assigned jobs" ON public.candidate_assessments FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((c.id = candidate_assessments.candidate_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can update candidates" ON public.candidates FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can update prescreens for assigned jobs" ON public.candidate_prescreens FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((c.id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM ((public.candidate_interviews ci
     JOIN public.job_interview_stages jis ON ((jis.id = ci.job_interview_stage_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = jis.job_id)))
  WHERE ((ci.candidate_id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid()))))));

CREATE POLICY "Recruiters can update responses for assigned jobs" ON public.candidate_responses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can view all candidate_assessments" ON public.candidate_assessments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can view all candidates" ON public.candidates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can view applications for assigned jobs" ON public.job_applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.job_recruiters jr
  WHERE ((jr.job_id = job_applications.job_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can view assigned jobs" ON public.jobs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.job_recruiters
  WHERE ((job_recruiters.job_id = jobs.id) AND (job_recruiters.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can view candidate_tags" ON public.candidate_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'recruiter'::public.app_role)))));

CREATE POLICY "Recruiters can view own assignments" ON public.job_recruiters FOR SELECT USING ((recruiter_user_id = auth.uid()));

CREATE POLICY "Recruiters can view prescreens for assigned jobs" ON public.candidate_prescreens FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.candidates c
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((c.id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM ((public.candidate_interviews ci
     JOIN public.job_interview_stages jis ON ((jis.id = ci.job_interview_stage_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = jis.job_id)))
  WHERE ((ci.candidate_id = candidate_prescreens.candidate_id) AND (jr.recruiter_user_id = auth.uid()))))));

CREATE POLICY "Recruiters can view questions for assigned jobs" ON public.questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (((public.assessment_sections s
     JOIN public.candidate_assessments ca ON ((ca.assessment_id = s.assessment_id)))
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((s.id = questions.section_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can view responses for assigned jobs" ON public.candidate_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.candidate_assessments ca
     JOIN public.candidates c ON ((c.id = ca.candidate_id)))
     JOIN public.job_recruiters jr ON ((jr.job_id = c.job_id)))
  WHERE ((ca.id = candidate_responses.candidate_assessment_id) AND (jr.recruiter_user_id = auth.uid())))));

CREATE POLICY "Recruiters can view user roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'recruiter'::public.app_role));

CREATE POLICY "Require MFA to delete user roles" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA to insert user roles" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA to read other user roles" ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ( SELECT public.mfa_satisfied() AS mfa_satisfied)));

CREATE POLICY "Require MFA to update user roles" ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.applicant_profiles AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.audit_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.candidate_interviews AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.candidates AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.job_applications AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Require MFA when enrolled" ON public.system_config AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "Service role manages portal application attempts" ON public.portal_application_attempts TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff can insert application forms for assigned jobs" ON public.job_application_forms FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.job_applications ja
  WHERE ((ja.id = job_application_forms.job_application_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can insert application responses for assigned jobs" ON public.job_application_responses FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.job_application_forms jaf
     JOIN public.job_applications ja ON ((ja.id = jaf.job_application_id)))
  WHERE ((jaf.id = job_application_responses.form_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can read business branding" ON public.system_config FOR SELECT TO authenticated USING (((config_key = 'business_branding'::text) AND public.is_staff_user(auth.uid())));

CREATE POLICY "Staff can update application forms for assigned jobs" ON public.job_application_forms FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.job_applications ja
  WHERE ((ja.id = job_application_forms.job_application_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can update application responses for assigned jobs" ON public.job_application_responses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.job_application_forms jaf
     JOIN public.job_applications ja ON ((ja.id = jaf.job_application_id)))
  WHERE ((jaf.id = job_application_responses.form_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can view all profiles" ON public.profiles FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view application forms for assigned jobs" ON public.job_application_forms FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.job_applications ja
  WHERE ((ja.id = job_application_forms.job_application_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can view application responses for assigned jobs" ON public.job_application_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.job_application_forms jaf
     JOIN public.job_applications ja ON ((ja.id = jaf.job_application_id)))
  WHERE ((jaf.id = job_application_responses.form_id) AND public.staff_can_access_job_application(ja.id)))));

CREATE POLICY "Staff can view interview kits for visible interviews" ON public.interview_kits FOR SELECT USING ((public.is_admin_or_hr(auth.uid()) OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_id) OR public.is_primary_interviewer_for_interview(auth.uid(), candidate_interview_id) OR public.is_panelist_for_interview(auth.uid(), candidate_interview_id) OR public.is_assigned_interviewer_for_interview(auth.uid(), candidate_interview_id)));

CREATE POLICY "Staff can view job stages" ON public.job_interview_stages FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view pipeline analysis cache" ON public.pipeline_analysis_cache FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view scorecard templates" ON public.scorecard_templates FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can view stage templates" ON public.interview_stage_templates FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert external_refs" ON public.external_refs FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role) OR public.has_role(auth.uid(), 'recruiter'::public.app_role)));

CREATE POLICY "Staff read external_refs" ON public.external_refs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role) OR public.has_role(auth.uid(), 'recruiter'::public.app_role)));

CREATE POLICY "Staff update external_refs" ON public.external_refs FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role) OR public.has_role(auth.uid(), 'recruiter'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role) OR public.has_role(auth.uid(), 'recruiter'::public.app_role)));

CREATE POLICY "Templates are viewable by authenticated users" ON public.assessment_templates FOR SELECT TO authenticated USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be created by authenticated users" ON public.assessment_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be deleted by creator or admin" ON public.assessment_templates FOR DELETE TO authenticated USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Templates can be updated by creator or admin" ON public.assessment_templates FOR UPDATE TO authenticated USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view panelists for visible interviews" ON public.candidate_interview_panelists FOR SELECT USING (((interviewer_user_id = auth.uid()) OR public.is_admin_or_hr(auth.uid()) OR public.is_recruiter_for_interview(auth.uid(), candidate_interview_id) OR public.is_primary_interviewer_for_interview(auth.uid(), candidate_interview_id) OR public.is_panelist_for_interview(auth.uid(), candidate_interview_id)));

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY admin_hr_manage_vendors ON public.vendors USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role]))))));

CREATE POLICY "admins can manage announcements" ON public.announcements TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_super_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.is_super_admin = true))))));

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.applicant_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessment_sections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read announcements" ON public.announcements FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_read_vendors ON public.vendors FOR SELECT USING ((auth.role() = 'authenticated'::text));

ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_interview_panelists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_interviewers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_prescreens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chitra_escalations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_refs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.internal_webhook_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.interview_kits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.interview_stage_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_application_forms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_application_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_interview_stages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_recruiters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pipeline_analysis_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.portal_application_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.prescreen_question_bank ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scorecard_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public._period_candidate_flags(p_start_ts timestamp with time zone, p_end_ts timestamp with time zone, p_recruiter_id uuid, p_source_keys text[], p_require_created_by boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public._period_candidate_flags(p_start_ts timestamp with time zone, p_end_ts timestamp with time zone, p_recruiter_id uuid, p_source_keys text[], p_require_created_by boolean) TO service_role;

REVOKE ALL ON FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) TO service_role;

GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO anon;
GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO anon;
GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO authenticated;
GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO service_role;

GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO anon;
GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO authenticated;
GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO service_role;

GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO anon;
GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO service_role;

GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO anon;
GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO service_role;

GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO anon;
GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO service_role;

REVOKE ALL ON FUNCTION public.audit_log_record(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.audit_log_record(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb) TO service_role;

GRANT ALL ON FUNCTION public.audit_user_role_change() TO anon;
GRANT ALL ON FUNCTION public.audit_user_role_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_user_role_change() TO service_role;

GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO anon;
GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO authenticated;
GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO service_role;

GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO anon;
GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO service_role;

GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO anon;
GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO service_role;

GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO anon;
GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO authenticated;
GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO service_role;

REVOKE ALL ON FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.calculate_response_final_score() TO anon;
GRANT ALL ON FUNCTION public.calculate_response_final_score() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_response_final_score() TO service_role;

GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO anon;
GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO service_role;

GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO anon;
GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO authenticated;
GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO service_role;

GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO anon;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO service_role;

GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO anon;
GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO authenticated;
GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO service_role;

GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO anon;
GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO service_role;

GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO anon;
GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO authenticated;
GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO service_role;

GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_portal_application_rate_limit(_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_portal_application_rate_limit(_email text) TO service_role;

GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO anon;
GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO authenticated;
GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO service_role;

REVOKE ALL ON FUNCTION public.format_notification_time(_ts timestamp with time zone, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.format_notification_time(_ts timestamp with time zone, _user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_applicant_portal_auth_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO anon;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO authenticated;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics(p_period text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_metrics(p_period text) TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_metrics(p_period text) TO service_role;

REVOKE ALL ON FUNCTION public.get_email_send_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_email_send_counts() TO authenticated;
GRANT ALL ON FUNCTION public.get_email_send_counts() TO service_role;

REVOKE ALL ON FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) TO service_role;

REVOKE ALL ON FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) TO service_role;

GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO anon;
GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO service_role;

GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_sourcing_trend(p_weeks integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_sourcing_trend(p_weeks integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_sourcing_trend(p_weeks integer) TO service_role;

GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) TO service_role;

REVOKE ALL ON FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) TO service_role;

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb, _ip inet) FROM PUBLIC;
GRANT ALL ON FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb, _ip inet) TO authenticated;
GRANT ALL ON FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb, _ip inet) TO service_role;

REVOKE ALL ON FUNCTION public.invoke_edge_function(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invoke_edge_function(p_name text) TO service_role;

REVOKE ALL ON FUNCTION public.invoke_hire_email_webhook(p_candidate_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invoke_hire_email_webhook(p_candidate_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.invoke_staff_email_webhook(p_event text, p_interview_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invoke_staff_email_webhook(p_event text, p_interview_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO anon;
GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO authenticated;
GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO service_role;

GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.list_my_job_applications() TO anon;
GRANT ALL ON FUNCTION public.list_my_job_applications() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_job_applications() TO service_role;

REVOKE ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO anon;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO authenticated;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO service_role;

GRANT ALL ON FUNCTION public.mfa_satisfied() TO anon;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO service_role;

REVOKE ALL ON FUNCTION public.notification_timezone(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notification_timezone(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.notify_candidate_hired() TO anon;
GRANT ALL ON FUNCTION public.notify_candidate_hired() TO authenticated;
GRANT ALL ON FUNCTION public.notify_candidate_hired() TO service_role;

GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO anon;
GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO authenticated;
GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO service_role;

GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO anon;
GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO authenticated;
GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO service_role;

GRANT ALL ON FUNCTION public.notify_panelist_added() TO anon;
GRANT ALL ON FUNCTION public.notify_panelist_added() TO authenticated;
GRANT ALL ON FUNCTION public.notify_panelist_added() TO service_role;

GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO anon;
GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO authenticated;
GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO service_role;

GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO anon;
GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO authenticated;
GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO service_role;

GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO service_role;

GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO anon;
GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO service_role;

GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO anon;
GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO authenticated;
GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO service_role;

GRANT ALL ON FUNCTION public.protect_super_admin_role() TO anon;
GRANT ALL ON FUNCTION public.protect_super_admin_role() TO authenticated;
GRANT ALL ON FUNCTION public.protect_super_admin_role() TO service_role;

GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_client_ip() TO service_role;

GRANT ALL ON FUNCTION public.require_mfa_on_write() TO anon;
GRANT ALL ON FUNCTION public.require_mfa_on_write() TO authenticated;
GRANT ALL ON FUNCTION public.require_mfa_on_write() TO service_role;

GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO service_role;

GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO service_role;

GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO service_role;

GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO service_role;

GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO anon;
GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO service_role;

GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO anon;
GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO anon;
GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO authenticated;
GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO service_role;

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;

GRANT ALL ON TABLE public.applicant_profiles TO anon;
GRANT ALL ON TABLE public.applicant_profiles TO authenticated;
GRANT ALL ON TABLE public.applicant_profiles TO service_role;

GRANT ALL ON TABLE public.assessment_details TO anon;
GRANT ALL ON TABLE public.assessment_details TO authenticated;
GRANT ALL ON TABLE public.assessment_details TO service_role;

GRANT ALL ON TABLE public.assessment_sections TO anon;
GRANT ALL ON TABLE public.assessment_sections TO authenticated;
GRANT ALL ON TABLE public.assessment_sections TO service_role;

GRANT ALL ON TABLE public.assessment_templates TO anon;
GRANT ALL ON TABLE public.assessment_templates TO authenticated;
GRANT ALL ON TABLE public.assessment_templates TO service_role;

GRANT ALL ON TABLE public.assessments TO anon;
GRANT ALL ON TABLE public.assessments TO authenticated;
GRANT ALL ON TABLE public.assessments TO service_role;

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;

GRANT ALL ON TABLE public.candidate_assessments TO anon;
GRANT ALL ON TABLE public.candidate_assessments TO authenticated;
GRANT ALL ON TABLE public.candidate_assessments TO service_role;

GRANT ALL ON TABLE public.candidate_interview_panelists TO anon;
GRANT ALL ON TABLE public.candidate_interview_panelists TO authenticated;
GRANT ALL ON TABLE public.candidate_interview_panelists TO service_role;

GRANT ALL ON TABLE public.candidate_interviewers TO anon;
GRANT ALL ON TABLE public.candidate_interviewers TO authenticated;
GRANT ALL ON TABLE public.candidate_interviewers TO service_role;

GRANT ALL ON TABLE public.candidate_interviews TO anon;
GRANT ALL ON TABLE public.candidate_interviews TO authenticated;
GRANT ALL ON TABLE public.candidate_interviews TO service_role;

GRANT ALL ON TABLE public.candidate_prescreens TO anon;
GRANT ALL ON TABLE public.candidate_prescreens TO authenticated;
GRANT ALL ON TABLE public.candidate_prescreens TO service_role;

GRANT ALL ON TABLE public.candidate_responses TO anon;
GRANT ALL ON TABLE public.candidate_responses TO authenticated;
GRANT ALL ON TABLE public.candidate_responses TO service_role;

GRANT ALL ON TABLE public.candidate_tags TO anon;
GRANT ALL ON TABLE public.candidate_tags TO authenticated;
GRANT ALL ON TABLE public.candidate_tags TO service_role;

GRANT ALL ON TABLE public.candidates TO anon;
GRANT ALL ON TABLE public.candidates TO authenticated;
GRANT ALL ON TABLE public.candidates TO service_role;

GRANT ALL ON TABLE public.chitra_escalations TO anon;
GRANT ALL ON TABLE public.chitra_escalations TO authenticated;
GRANT ALL ON TABLE public.chitra_escalations TO service_role;

GRANT ALL ON TABLE public.email_delivery_log TO anon;
GRANT ALL ON TABLE public.email_delivery_log TO authenticated;
GRANT ALL ON TABLE public.email_delivery_log TO service_role;

GRANT ALL ON TABLE public.external_refs TO anon;
GRANT ALL ON TABLE public.external_refs TO authenticated;
GRANT ALL ON TABLE public.external_refs TO service_role;

GRANT ALL ON TABLE public.internal_webhook_config TO anon;
GRANT ALL ON TABLE public.internal_webhook_config TO authenticated;
GRANT ALL ON TABLE public.internal_webhook_config TO service_role;

GRANT ALL ON TABLE public.interview_kits TO anon;
GRANT ALL ON TABLE public.interview_kits TO authenticated;
GRANT ALL ON TABLE public.interview_kits TO service_role;

GRANT ALL ON TABLE public.interview_stage_templates TO anon;
GRANT ALL ON TABLE public.interview_stage_templates TO authenticated;
GRANT ALL ON TABLE public.interview_stage_templates TO service_role;

GRANT ALL ON TABLE public.job_application_forms TO anon;
GRANT ALL ON TABLE public.job_application_forms TO authenticated;
GRANT ALL ON TABLE public.job_application_forms TO service_role;

GRANT ALL ON TABLE public.job_application_responses TO anon;
GRANT ALL ON TABLE public.job_application_responses TO authenticated;
GRANT ALL ON TABLE public.job_application_responses TO service_role;

GRANT ALL ON TABLE public.job_applications TO anon;
GRANT ALL ON TABLE public.job_applications TO authenticated;
GRANT ALL ON TABLE public.job_applications TO service_role;

GRANT ALL ON TABLE public.job_interview_stages TO anon;
GRANT ALL ON TABLE public.job_interview_stages TO authenticated;
GRANT ALL ON TABLE public.job_interview_stages TO service_role;

GRANT ALL ON TABLE public.job_recruiters TO anon;
GRANT ALL ON TABLE public.job_recruiters TO authenticated;
GRANT ALL ON TABLE public.job_recruiters TO service_role;

GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

GRANT ALL ON TABLE public.pipeline_analysis_cache TO anon;
GRANT ALL ON TABLE public.pipeline_analysis_cache TO authenticated;
GRANT ALL ON TABLE public.pipeline_analysis_cache TO service_role;

GRANT ALL ON TABLE public.portal_application_attempts TO service_role;

GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO service_role;

GRANT ALL ON TABLE public.prescreen_question_bank TO anon;
GRANT ALL ON TABLE public.prescreen_question_bank TO authenticated;
GRANT ALL ON TABLE public.prescreen_question_bank TO service_role;

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT ALL ON TABLE public.public_job_listings TO anon;
GRANT ALL ON TABLE public.public_job_listings TO authenticated;
GRANT ALL ON TABLE public.public_job_listings TO service_role;

GRANT ALL ON TABLE public.questions TO anon;
GRANT ALL ON TABLE public.questions TO authenticated;
GRANT ALL ON TABLE public.questions TO service_role;

GRANT ALL ON TABLE public.scorecard_templates TO anon;
GRANT ALL ON TABLE public.scorecard_templates TO authenticated;
GRANT ALL ON TABLE public.scorecard_templates TO service_role;

GRANT ALL ON TABLE public.system_config TO anon;
GRANT ALL ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

GRANT ALL ON TABLE public.vendors TO anon;
GRANT ALL ON TABLE public.vendors TO authenticated;
GRANT ALL ON TABLE public.vendors TO service_role;
-- Privileges --------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', f);
  END LOOP;
END
$$;

GRANT ALL ON FUNCTION public._period_candidate_flags(p_start_ts timestamp with time zone, p_end_ts timestamp with time zone, p_recruiter_id uuid, p_source_keys text[], p_require_created_by boolean) TO service_role;
GRANT ALL ON FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.advance_candidate_stage(p_candidate_id uuid, p_from_stage_id uuid, p_to_stage_id uuid, p_advanced_by uuid) TO service_role;
GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO anon;
GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.applicant_owns_job_application(_application_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO anon;
GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO authenticated;
GRANT ALL ON FUNCTION public.applicant_profiles_bind_auth_email() TO service_role;
GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_pending_candidate(p_candidate_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO anon;
GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO authenticated;
GRANT ALL ON FUNCTION public.audit_candidate_interview_decision() TO service_role;
GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO anon;
GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_candidate_status_change() TO service_role;
GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO anon;
GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_job_application_status_change() TO service_role;
GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO anon;
GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.audit_log_block_mutation() TO service_role;
GRANT ALL ON FUNCTION public.audit_log_record(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb) TO service_role;
GRANT ALL ON FUNCTION public.audit_user_role_change() TO anon;
GRANT ALL ON FUNCTION public.audit_user_role_change() TO authenticated;
GRANT ALL ON FUNCTION public.audit_user_role_change() TO service_role;
GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO anon;
GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO authenticated;
GRANT ALL ON FUNCTION public.auto_assign_first_admin() TO service_role;
GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO anon;
GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_candidate_from_application() TO service_role;
GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO anon;
GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_default_pipeline() TO service_role;
GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO anon;
GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO authenticated;
GRANT ALL ON FUNCTION public.auto_score_mcq_response() TO service_role;
GRANT ALL ON FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_response_final_score() TO anon;
GRANT ALL ON FUNCTION public.calculate_response_final_score() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_response_final_score() TO service_role;
GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO anon;
GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_total_on_completion() TO service_role;
GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO anon;
GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO authenticated;
GRANT ALL ON FUNCTION public.caller_owns_resume_path(_resume_url text) TO service_role;
GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_job_hiring(_user_id uuid, _job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_decide_pending_approval(_user_id uuid, _job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_interviewer_view_candidate_assessment(_user_id uuid, _candidate_id uuid, _job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO anon;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO anon;
GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO authenticated;
GRANT ALL ON FUNCTION public.candidate_interviews_freeze_completed_stage() TO service_role;
GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO anon;
GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.candidate_interviews_snapshot_stage_on_insert() TO service_role;
GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO anon;
GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO authenticated;
GRANT ALL ON FUNCTION public.chitra_resolve_feedback_escalation() TO service_role;
GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.decline_pending_candidate(p_candidate_id uuid, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.enforce_portal_application_rate_limit(_email text) TO service_role;
GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO anon;
GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO authenticated;
GRANT ALL ON FUNCTION public.enrich_applicant_from_candidate() TO service_role;
GRANT ALL ON FUNCTION public.format_notification_time(_ts timestamp with time zone, _user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO anon;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO authenticated;
GRANT ALL ON FUNCTION public.get_applicant_portal_auth_users() TO service_role;
GRANT ALL ON FUNCTION public.get_dashboard_metrics(p_period text) TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_metrics(p_period text) TO service_role;
GRANT ALL ON FUNCTION public.get_email_send_counts() TO authenticated;
GRANT ALL ON FUNCTION public.get_email_send_counts() TO service_role;
GRANT ALL ON FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_interview_stage_funnel(p_interviewer_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_interviewer_prescreen(_candidate_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_job_enrolled_candidate_ids(p_job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_job_pipeline_interviews(p_job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_pending_approval_counts(p_job_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_pipeline_job_counts(p_job_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_recruiter_detail(p_recruiter_id uuid, p_start_date date, p_end_date date) TO service_role;
GRANT ALL ON FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_recruiter_leaderboard(p_start_date date, p_end_date date) TO service_role;
GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO anon;
GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_reports_job_pipeline_stats() TO service_role;
GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_scheduled_interviews(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.get_sourcing_trend(p_weeks integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_sourcing_trend(p_weeks integer) TO service_role;
GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_time_velocity_metrics(p_period_days integer) TO service_role;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_email_confirmation_status(_user_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_vendor_detail(p_source_key text, p_start_date date, p_end_date date) TO service_role;
GRANT ALL ON FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_vendor_leaderboard(p_source_keys text[], p_start_date date, p_end_date date) TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb, _ip inet) TO authenticated;
GRANT ALL ON FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id uuid, _before_data jsonb, _after_data jsonb, _ip inet) TO service_role;
GRANT ALL ON FUNCTION public.invoke_edge_function(p_name text) TO service_role;
GRANT ALL ON FUNCTION public.invoke_hire_email_webhook(p_candidate_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.invoke_staff_email_webhook(p_event text, p_interview_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_hr(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO anon;
GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO authenticated;
GRANT ALL ON FUNCTION public.is_anon_resume_upload_path(_path text) TO service_role;
GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_applicant(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interview_pool_member(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_interviewer_for_job(_user_id uuid, _job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_recruiter_for_job(_user_id uuid, _job_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_staff(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_staff_user(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.list_my_job_applications() TO anon;
GRANT ALL ON FUNCTION public.list_my_job_applications() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_job_applications() TO service_role;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO anon;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO authenticated;
GRANT ALL ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) TO service_role;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO anon;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO service_role;
GRANT ALL ON FUNCTION public.notification_timezone(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.notify_candidate_hired() TO anon;
GRANT ALL ON FUNCTION public.notify_candidate_hired() TO authenticated;
GRANT ALL ON FUNCTION public.notify_candidate_hired() TO service_role;
GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO anon;
GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO authenticated;
GRANT ALL ON FUNCTION public.notify_interview_cancelled() TO service_role;
GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO anon;
GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO authenticated;
GRANT ALL ON FUNCTION public.notify_interview_scheduled() TO service_role;
GRANT ALL ON FUNCTION public.notify_panelist_added() TO anon;
GRANT ALL ON FUNCTION public.notify_panelist_added() TO authenticated;
GRANT ALL ON FUNCTION public.notify_panelist_added() TO service_role;
GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO anon;
GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO authenticated;
GRANT ALL ON FUNCTION public.notify_verdict_submitted() TO service_role;
GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO anon;
GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO authenticated;
GRANT ALL ON FUNCTION public.portal_submit_job_application(p_job_id uuid, p_applicant_name text, p_applicant_email text, p_applicant_phone text, p_linkedin_url text, p_resume_url text, p_cover_letter text) TO service_role;
GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_interviewer_interview_identity_change() TO service_role;
GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO anon;
GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_interviewer_pipeline_stage_move() TO service_role;
GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO anon;
GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO authenticated;
GRANT ALL ON FUNCTION public.protect_profile_privilege_columns() TO service_role;
GRANT ALL ON FUNCTION public.protect_super_admin_role() TO anon;
GRANT ALL ON FUNCTION public.protect_super_admin_role() TO authenticated;
GRANT ALL ON FUNCTION public.protect_super_admin_role() TO service_role;
GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.register_profile_as_applicant(_target_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.request_client_ip() TO service_role;
GRANT ALL ON FUNCTION public.require_mfa_on_write() TO anon;
GRANT ALL ON FUNCTION public.require_mfa_on_write() TO authenticated;
GRANT ALL ON FUNCTION public.require_mfa_on_write() TO service_role;
GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_assessment_scores() TO service_role;
GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_candidate_update() TO service_role;
GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_profile_resume_url() TO service_role;
GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO anon;
GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_applicant_response_scores() TO service_role;
GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO anon;
GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_can_conduct_interviews(_target_user_id uuid, _value boolean) TO service_role;
GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO anon;
GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.staff_can_access_job_application(_application_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO anon;
GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO authenticated;
GRANT ALL ON FUNCTION public.sync_job_application_from_candidate() TO service_role;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;
GRANT ALL ON TABLE public.applicant_profiles TO anon;
GRANT ALL ON TABLE public.applicant_profiles TO authenticated;
GRANT ALL ON TABLE public.applicant_profiles TO service_role;
GRANT ALL ON TABLE public.assessment_details TO anon;
GRANT ALL ON TABLE public.assessment_details TO authenticated;
GRANT ALL ON TABLE public.assessment_details TO service_role;
GRANT ALL ON TABLE public.assessment_sections TO anon;
GRANT ALL ON TABLE public.assessment_sections TO authenticated;
GRANT ALL ON TABLE public.assessment_sections TO service_role;
GRANT ALL ON TABLE public.assessment_templates TO anon;
GRANT ALL ON TABLE public.assessment_templates TO authenticated;
GRANT ALL ON TABLE public.assessment_templates TO service_role;
GRANT ALL ON TABLE public.assessments TO anon;
GRANT ALL ON TABLE public.assessments TO authenticated;
GRANT ALL ON TABLE public.assessments TO service_role;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;
GRANT ALL ON TABLE public.candidate_assessments TO anon;
GRANT ALL ON TABLE public.candidate_assessments TO authenticated;
GRANT ALL ON TABLE public.candidate_assessments TO service_role;
GRANT ALL ON TABLE public.candidate_interview_panelists TO anon;
GRANT ALL ON TABLE public.candidate_interview_panelists TO authenticated;
GRANT ALL ON TABLE public.candidate_interview_panelists TO service_role;
GRANT ALL ON TABLE public.candidate_interviewers TO anon;
GRANT ALL ON TABLE public.candidate_interviewers TO authenticated;
GRANT ALL ON TABLE public.candidate_interviewers TO service_role;
GRANT ALL ON TABLE public.candidate_interviews TO anon;
GRANT ALL ON TABLE public.candidate_interviews TO authenticated;
GRANT ALL ON TABLE public.candidate_interviews TO service_role;
GRANT ALL ON TABLE public.candidate_prescreens TO anon;
GRANT ALL ON TABLE public.candidate_prescreens TO authenticated;
GRANT ALL ON TABLE public.candidate_prescreens TO service_role;
GRANT ALL ON TABLE public.candidate_responses TO anon;
GRANT ALL ON TABLE public.candidate_responses TO authenticated;
GRANT ALL ON TABLE public.candidate_responses TO service_role;
GRANT ALL ON TABLE public.candidate_tags TO anon;
GRANT ALL ON TABLE public.candidate_tags TO authenticated;
GRANT ALL ON TABLE public.candidate_tags TO service_role;
GRANT ALL ON TABLE public.candidates TO anon;
GRANT ALL ON TABLE public.candidates TO authenticated;
GRANT ALL ON TABLE public.candidates TO service_role;
GRANT ALL ON TABLE public.chitra_escalations TO anon;
GRANT ALL ON TABLE public.chitra_escalations TO authenticated;
GRANT ALL ON TABLE public.chitra_escalations TO service_role;
GRANT ALL ON TABLE public.email_delivery_log TO anon;
GRANT ALL ON TABLE public.email_delivery_log TO authenticated;
GRANT ALL ON TABLE public.email_delivery_log TO service_role;
GRANT ALL ON TABLE public.external_refs TO anon;
GRANT ALL ON TABLE public.external_refs TO authenticated;
GRANT ALL ON TABLE public.external_refs TO service_role;
GRANT ALL ON TABLE public.internal_webhook_config TO anon;
GRANT ALL ON TABLE public.internal_webhook_config TO authenticated;
GRANT ALL ON TABLE public.internal_webhook_config TO service_role;
GRANT ALL ON TABLE public.interview_kits TO anon;
GRANT ALL ON TABLE public.interview_kits TO authenticated;
GRANT ALL ON TABLE public.interview_kits TO service_role;
GRANT ALL ON TABLE public.interview_stage_templates TO anon;
GRANT ALL ON TABLE public.interview_stage_templates TO authenticated;
GRANT ALL ON TABLE public.interview_stage_templates TO service_role;
GRANT ALL ON TABLE public.job_application_forms TO anon;
GRANT ALL ON TABLE public.job_application_forms TO authenticated;
GRANT ALL ON TABLE public.job_application_forms TO service_role;
GRANT ALL ON TABLE public.job_application_responses TO anon;
GRANT ALL ON TABLE public.job_application_responses TO authenticated;
GRANT ALL ON TABLE public.job_application_responses TO service_role;
GRANT ALL ON TABLE public.job_applications TO anon;
GRANT ALL ON TABLE public.job_applications TO authenticated;
GRANT ALL ON TABLE public.job_applications TO service_role;
GRANT ALL ON TABLE public.job_interview_stages TO anon;
GRANT ALL ON TABLE public.job_interview_stages TO authenticated;
GRANT ALL ON TABLE public.job_interview_stages TO service_role;
GRANT ALL ON TABLE public.job_recruiters TO anon;
GRANT ALL ON TABLE public.job_recruiters TO authenticated;
GRANT ALL ON TABLE public.job_recruiters TO service_role;
GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;
GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
GRANT ALL ON TABLE public.pipeline_analysis_cache TO anon;
GRANT ALL ON TABLE public.pipeline_analysis_cache TO authenticated;
GRANT ALL ON TABLE public.pipeline_analysis_cache TO service_role;
GRANT ALL ON TABLE public.portal_application_attempts TO service_role;
GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.portal_application_attempts_id_seq TO service_role;
GRANT ALL ON TABLE public.prescreen_question_bank TO anon;
GRANT ALL ON TABLE public.prescreen_question_bank TO authenticated;
GRANT ALL ON TABLE public.prescreen_question_bank TO service_role;
GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.public_job_listings TO anon;
GRANT ALL ON TABLE public.public_job_listings TO authenticated;
GRANT ALL ON TABLE public.public_job_listings TO service_role;
GRANT ALL ON TABLE public.questions TO anon;
GRANT ALL ON TABLE public.questions TO authenticated;
GRANT ALL ON TABLE public.questions TO service_role;
GRANT ALL ON TABLE public.scorecard_templates TO anon;
GRANT ALL ON TABLE public.scorecard_templates TO authenticated;
GRANT ALL ON TABLE public.scorecard_templates TO service_role;
GRANT ALL ON TABLE public.system_config TO anon;
GRANT ALL ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;
GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.vendors TO anon;
GRANT ALL ON TABLE public.vendors TO authenticated;
GRANT ALL ON TABLE public.vendors TO service_role;

-- Comments --------------------------------------------------------------------

COMMENT ON COLUMN public.applicant_profiles.skills IS 'Skills extracted from resume or entered manually';
COMMENT ON COLUMN public.applicant_profiles.notification_prefs IS 'Applicant email notification preferences';
COMMENT ON COLUMN public.applicant_profiles.documents IS 'Additional documents: [{id, name, url, type, uploaded_at}]';
COMMENT ON COLUMN public.applicant_profiles.middle_name IS 'Optional middle name';
COMMENT ON COLUMN public.applicant_profiles.dob_actual IS 'Actual date of birth (optional)';
COMMENT ON COLUMN public.applicant_profiles.dob_documented IS 'Date of birth as on official documents (required at app level)';
COMMENT ON COLUMN public.applicant_profiles.gender IS 'Gender: male, female, non_binary, prefer_not_to_say';
COMMENT ON COLUMN public.applicant_profiles.marital_status IS 'Marital status: single, married, divorced, widowed, separated, prefer_not_to_say';
COMMENT ON COLUMN public.applicant_profiles.blood_group IS 'Blood group: A+, A-, B+, B-, AB+, AB-, O+, O-, unknown';
COMMENT ON COLUMN public.applicant_profiles.emergency_phone IS 'Alternative emergency contact phone';
COMMENT ON COLUMN public.applicant_profiles.first_name IS 'Applicant first name (required at app level)';
COMMENT ON COLUMN public.applicant_profiles.last_name IS 'Applicant last name (required at app level)';
COMMENT ON COLUMN public.applicant_profiles.avatar_url IS 'Optional profile photo URL in avatars storage bucket';
COMMENT ON COLUMN public.applicant_profiles.sensitive_data_consent_at IS 'Timestamp when applicant consented to collection of DOB, gender, marital status, blood group.';
COMMENT ON COLUMN public.applicant_profiles.sensitive_data_consent_source IS 'Source of sensitive-data consent, e.g. applicant_profile_modal.';
COMMENT ON TABLE public.audit_log IS 'Append-only staff action log. No UPDATE or DELETE policies — rows are permanent.';
COMMENT ON COLUMN public.audit_log.actor_id IS 'auth.uid() of the caller. NULL for service-role and scheduled writes.';
COMMENT ON COLUMN public.candidate_assessments.consent_source IS 'e.g. exam_portal_magic_link, exam_portal_applicant';
COMMENT ON COLUMN public.candidate_interviews.cancelled_at IS 'When the scheduled slot was cancelled. Null scheduled_at + this set means unscheduled (not no-show/reject).';
COMMENT ON COLUMN public.candidates.source IS 'Free-text intake channel. Canonical keys: manual, portal, naukri, linkedin, referral, indeed, talent_email, job_application, bulk_resume, csv_import. Unknown values are preserved.';
COMMENT ON COLUMN public.candidates.referred_by IS 'Name of the employee who referred this candidate (only populated when source = ''referral'')';
COMMENT ON COLUMN public.candidates.hired_at IS 'Timestamp when the candidate was officially marked hired. NULL = not yet hired.';
COMMENT ON TABLE public.external_refs IS 'Maps TTA entities to external system IDs. UNIQUE (provider, entity_type, external_id) is the idempotency key for inbound connectors.';
COMMENT ON TABLE public.internal_webhook_config IS 'Server-only webhook config for DB triggers (pg_net). Populate staff_email row via SQL in prod.';
COMMENT ON COLUMN public.job_applications.source IS 'How the application was created: portal (careers), recruiter (manual add), import';
COMMENT ON COLUMN public.job_applications.form_sent_at IS 'When staff last emailed the candidate a link to complete the digital application form';
COMMENT ON COLUMN public.job_applications.jd_sent_at IS 'When staff last emailed the candidate job details for this application';
COMMENT ON COLUMN public.jobs.require_digital_application_form IS 'When true, applicants must complete the digital job application form before interviews';
COMMENT ON COLUMN public.jobs.assessment_enabled IS 'When true, job uses linked assessment in hiring workflow';
COMMENT ON COLUMN public.jobs.default_assessment_id IS 'Default assessment assigned manually or as job template';
COMMENT ON COLUMN public.jobs.assessment_config IS 'deadline_days, pass_threshold_override, notify_recruiter_on_complete, require_pass_before_interview';
COMMENT ON COLUMN public.jobs.sort_order IS 'Company-wide Jobs listing priority. Lower values appear first. Admin/HR reorder via drag.';
COMMENT ON COLUMN public.jobs.status_note IS 'Optional note for terminal status, e.g. cancelled reason (filled internally, role dropped, budget, duplicate, other).';
COMMENT ON TABLE public.portal_application_attempts IS 'Rate-limit ledger for portal_submit_job_application(). Hashed identifiers only; rows older than a day are pruned.';
COMMENT ON COLUMN public.questions.file_config IS 'Optional config for file_upload questions: allow_file, allow_link, allowed_mime_types, max_file_bytes (10MB), max_files (1).';
COMMENT ON FUNCTION public.cancel_interview(p_id uuid, p_reason text, p_note text) IS 'Voids a scheduled interview slot (same stage, no verdict). Admin/HR/recruiter, or assigned interviewer/panelist.';
COMMENT ON FUNCTION public.lookup_applicant_avatars(p_emails text[]) IS 'Returns portal avatar URLs for the given emails. Staff only; does not expose other applicant_profiles columns.';

-- Default configuration -------------------------------------------------------


INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('c3b114fc-77a0-46de-8c9c-50f846152132', 'about_yourself', 'Write a brief about yourself', true, 1, '2026-10-11 04:31:28.379264+00', 'about_you');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('f2a844cb-7d45-4a47-878b-24877a1e2392', 'typical_day', 'What does a typical day look like in your current job role?', true, 2, '2026-10-11 04:31:28.379264+00', 'current_role');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('00963668-ac15-4ea7-a40a-83e1f2a5218f', 'success_qualities', 'What qualities and attributes does someone need to be successful in your current job role?', true, 3, '2026-10-11 04:31:28.379264+00', 'current_role');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('092f8efa-bc78-4d3d-b751-23d619049519', 'greatest_achievement', 'Describe your greatest achievement till yet', true, 4, '2026-10-11 04:31:28.379264+00', 'achievements');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('e6ece665-66df-4150-bc54-cca59d4a5e74', 'interest_in_company', 'What interested you in interviewing or working here in {{company_name}}?', true, 6, '2026-10-11 04:31:28.379264+00', 'motivation');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('be6ae04a-3ab7-43af-8103-ffbea854ceea', 'growth_vision', 'How would you want to grow in {{company_name}}? and How would you achieve that vision?', true, 5, '2026-10-11 04:31:28.379264+00', 'career_goals');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('458a93c6-447d-4b65-a32e-3250f05ebc0e', 'next_career_move', 'What are you looking for in your next career move?', true, 8, '2026-10-11 04:31:28.379264+00', 'career_goals');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('8953a78f-4895-4bc6-8104-a35dd73d4593', 'ideal_workplace', 'Describe the workplace where you''ll be the most happy and productive?', true, 9, '2026-10-11 04:31:28.392372+00', 'workplace');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('fe7d3812-7825-4674-bdc4-f6958830b179', 'on_time_vs_perfect', 'What''s more important: Delivering a project on time and "good enough" or delaying until it''s perfect?', true, 10, '2026-10-11 04:31:28.379264+00', 'judgment');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('c30d6842-f208-4958-93a0-5216ddfdc1ea', 'biggest_challenge', 'What do you think would be the biggest challenge if you got this job?', true, 7, '2026-10-11 04:31:28.379264+00', 'challenges');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('8f524868-e317-420a-88fd-07e0866998b3', 'core_strengths', 'What are your top three professional strengths?', true, 11, '2026-10-11 04:31:28.395267+00', 'about_you');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('00967daf-162e-4fff-bdb1-0669519c124e', 'professional_background', 'Briefly describe your professional background and how it led you to apply.', true, 12, '2026-10-11 04:31:28.395267+00', 'about_you');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('ca432b4c-9601-4970-a022-f86e8f981025', 'unique_value', 'What unique value do you bring to a team?', true, 13, '2026-10-11 04:31:28.395267+00', 'about_you');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('5b0983e1-dcc3-4e5c-9aaf-fa315bcb9bc0', 'work_style', 'How would colleagues describe your work style?', true, 14, '2026-10-11 04:31:28.395267+00', 'about_you');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('3e416bb0-8289-40df-ba1e-290cf21fa2b1', 'role_responsibilities', 'What are your primary responsibilities in your current position?', true, 21, '2026-10-11 04:31:28.395267+00', 'current_role');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('b12f694a-e5d8-4ba1-9777-11ac52e3cf7b', 'tools_and_process', 'What tools, technologies, or processes do you use most in your current role?', true, 22, '2026-10-11 04:31:28.395267+00', 'current_role');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('19211924-200a-48f4-943f-76f33d67a6b0', 'team_structure', 'How is your team structured, and how do you collaborate day to day?', true, 23, '2026-10-11 04:31:28.395267+00', 'current_role');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('523057c9-88b0-47e2-9ad0-4805b2cb6243', 'proud_project', 'Describe a project you are especially proud of and your specific contribution.', true, 31, '2026-10-11 04:31:28.395267+00', 'achievements');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('ab7b5a55-86bf-4977-ae87-df7a673d5399', 'measurable_impact', 'Share an achievement where you can quantify your impact (metrics, outcomes, or results).', true, 32, '2026-10-11 04:31:28.395267+00', 'achievements');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('1a499a9b-fd7d-49b5-aae4-632858c3a927', 'learned_from_failure', 'Tell us about a setback you turned into a learning opportunity.', true, 33, '2026-10-11 04:31:28.395267+00', 'achievements');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('092d2f5d-3fb3-477a-9c12-556dc3b7758f', 'recognition_received', 'Have you received recognition or awards for your work? Describe one.', true, 34, '2026-10-11 04:31:28.395267+00', 'achievements');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('b5524ad0-ba01-4d3f-bc7c-d7bd0f0776d8', 'why_this_role', 'What specifically attracted you to this role?', true, 41, '2026-10-11 04:31:28.395267+00', 'motivation');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('af1b84a2-d6ab-42c3-a1a8-d6a00dcb311d', 'why_now', 'Why are you looking to make a move at this point in your career?', true, 42, '2026-10-11 04:31:28.395267+00', 'motivation');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('15b0b69f-a3c2-4c4b-819c-a46b0dccad8f', 'company_research', 'What do you already know about {{company_name}}, and what excites you most?', true, 43, '2026-10-11 04:31:28.395267+00', 'motivation');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('a1aad37f-2ca6-49dc-bc55-b2456b7c69a5', 'three_year_vision', 'Where do you see yourself professionally in three years?', true, 51, '2026-10-11 04:31:28.395267+00', 'career_goals');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('a2c6178d-f817-4a11-bfe5-434ecd362531', 'skills_to_develop', 'What skills or experiences are you hoping to gain in your next role?', true, 52, '2026-10-11 04:31:28.395267+00', 'career_goals');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('45f5519a-df6e-4fd9-8399-d35f5c1ca5e7', 'team_culture', 'Describe the team culture where you do your best work.', true, 61, '2026-10-11 04:31:28.395267+00', 'workplace');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('afc50d1f-b86f-4b40-bdc1-47def4092cf8', 'work_mode_preference', 'What is your preferred work arrangement (in-office, remote, hybrid), and why?', true, 62, '2026-10-11 04:31:28.395267+00', 'workplace');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('021f4894-dd47-4e1d-9466-2e85e990a04b', 'manager_expectations', 'What do you expect from a manager to be successful?', true, 63, '2026-10-11 04:31:28.395267+00', 'workplace');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('f680a96c-428d-483b-ac29-233014319c87', 'prioritization_approach', 'When everything seems urgent, how do you decide what to tackle first?', true, 71, '2026-10-11 04:31:28.395267+00', 'judgment');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('57f24b74-e9bb-462d-bdd7-886bef2e3af9', 'quality_vs_speed', 'Describe a time you had to balance speed and quality. What did you decide and why?', true, 72, '2026-10-11 04:31:28.395267+00', 'judgment');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('9e9f937a-9bf6-4065-bfa9-76c126a8f6e7', 'tradeoff_example', 'Tell us about a difficult tradeoff you made on a project and the reasoning behind it.', true, 73, '2026-10-11 04:31:28.395267+00', 'judgment');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('9efc5fbf-78f4-4866-bf79-485672ffbaf8', 'biggest_weakness', 'What is an area you are actively working to improve?', true, 81, '2026-10-11 04:31:28.395267+00', 'challenges');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('f07d4353-2504-410d-85c8-e6b0f56bec1a', 'conflict_handling', 'Describe how you handle disagreement or conflict with a colleague.', true, 82, '2026-10-11 04:31:28.395267+00', 'challenges');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('a0661372-48ea-49dd-a7c6-5747495cfac6', 'adaptability', 'Tell us about a time you had to adapt quickly to a major change at work.', true, 83, '2026-10-11 04:31:28.395267+00', 'challenges');
INSERT INTO public.prescreen_question_bank (id, question_key, question_text, is_active, sort_hint, created_at, category) VALUES ('fa0585f9-b3d0-4dd6-a4a1-4146e2410000', 'failure_response', 'How do you respond when a project does not go as planned?', true, 84, '2026-10-11 04:31:28.395267+00', 'challenges');

INSERT INTO public.scorecard_templates (id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at) VALUES ('492a425c-6ade-401f-8808-4e3e2f7c1c95', 'screening', 'Screening', '[{"key": "communication", "label": "Communication", "scale_hint": "Clarity and professionalism"}, {"key": "role_fit", "label": "Role Fit", "scale_hint": "Alignment with role requirements"}, {"key": "motivation", "label": "Motivation", "scale_hint": "Interest in the company and the role"}]', '["Walk me through your background and what drew you to this role.", "What are you looking for in your next opportunity?", "What is your notice period and salary expectation?", "Why are you interested in our company specifically?"]', true, '2026-10-11 04:31:28.312422+00', '2026-10-11 04:31:28.312422+00');
INSERT INTO public.scorecard_templates (id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at) VALUES ('eab9c94e-3c1b-4280-9287-b43f3246d9e2', 'technical', 'Technical Round', '[{"key": "technical_depth", "label": "Technical Depth", "scale_hint": "Domain knowledge and expertise"}, {"key": "problem_solving", "label": "Problem Solving", "scale_hint": "Approach to complex problems"}, {"key": "code_quality", "label": "Code / Design Quality", "scale_hint": "Structure, clarity, best practices"}, {"key": "system_thinking", "label": "System Thinking", "scale_hint": "Architecture and scalability awareness"}]', '["Describe a technically challenging project you led or contributed to.", "How would you design [relevant system] for scale and reliability?", "Walk through your approach to debugging a production issue.", "What trade-offs did you make in a recent technical decision?"]', true, '2026-10-11 04:31:28.312422+00', '2026-10-11 04:31:28.312422+00');
INSERT INTO public.scorecard_templates (id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at) VALUES ('cab11ff2-10a0-4fa0-8aaa-2152ffc3fe57', 'managerial', 'Managerial / Panel', '[{"key": "leadership", "label": "Leadership", "scale_hint": "Influence and team guidance"}, {"key": "stakeholder_management", "label": "Stakeholder Management", "scale_hint": "Cross-functional collaboration"}, {"key": "decision_making", "label": "Decision Making", "scale_hint": "Judgment under ambiguity"}, {"key": "culture_fit", "label": "Culture Fit", "scale_hint": "Values alignment with the company"}]', '["Tell me about a time you had to influence without authority.", "How do you handle disagreement within your team?", "Describe a situation where you had to make a tough call with incomplete information.", "What kind of work environment helps you do your best work?"]', true, '2026-10-11 04:31:28.312422+00', '2026-10-11 04:31:28.312422+00');
INSERT INTO public.scorecard_templates (id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at) VALUES ('638882e4-8f43-4350-a47d-3d6c143b26f3', 'hr_final', 'HR / Final Round', '[{"key": "culture_fit", "label": "Culture Fit", "scale_hint": "Values and team alignment"}, {"key": "communication", "label": "Communication", "scale_hint": "Professional presence"}, {"key": "compensation_alignment", "label": "Compensation Alignment", "scale_hint": "Expectations vs budget"}, {"key": "overall_potential", "label": "Overall Potential", "scale_hint": "Long-term growth at the company"}]', '["What are your career goals for the next 2–3 years?", "What would make you accept an offer from us?", "Is there anything that would prevent you from joining if we extend an offer?", "Do you have any questions about the company or the role?"]', true, '2026-10-11 04:31:28.312422+00', '2026-10-11 04:31:28.312422+00');
INSERT INTO public.scorecard_templates (id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at) VALUES ('660cda9d-0511-419e-9e5c-4f1845e8de8e', 'general', 'General Interview', '[{"key": "technical", "label": "Technical Skills", "scale_hint": "1=poor, 5=excellent"}, {"key": "communication", "label": "Communication", "scale_hint": "1=poor, 5=excellent"}, {"key": "problem_solving", "label": "Problem Solving", "scale_hint": "1=poor, 5=excellent"}, {"key": "culture_fit", "label": "Culture Fit", "scale_hint": "1=poor, 5=excellent"}]', '["Tell me about yourself and your relevant experience.", "What are your key strengths for this role?", "Describe a challenge you overcame recently.", "What questions do you have for us?"]', true, '2026-10-11 04:31:28.312422+00', '2026-10-11 04:31:28.312422+00');

INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('722db00e-9218-4971-b84b-b986e8fb8cdc', 'cert_tiers', '{"ca": {"tier": 1, "category": "other", "skill_upgrade": "Chartered Accountancy"}, "cfa": {"tier": 1, "category": "other", "skill_upgrade": "Financial Analysis"}, "cpa": {"tier": 1, "category": "other", "skill_upgrade": "Accounting"}, "csm": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"}, "pmp": {"tier": 1, "category": "project_management", "skill_upgrade": "Project Management"}, "cisa": {"tier": 1, "category": "security", "skill_upgrade": "IT Audit"}, "cism": {"tier": 1, "category": "security", "skill_upgrade": "Information Security"}, "oscp": {"tier": 1, "category": "security", "skill_upgrade": "Penetration Testing"}, "cissp": {"tier": 1, "category": "security", "skill_upgrade": "Cybersecurity"}, "togaf": {"tier": 1, "category": "other", "skill_upgrade": "Enterprise Architecture"}, "hubspot": {"tier": 3, "category": "other", "skill_upgrade": "Marketing"}, "pmi-acp": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"}, "comptia a+": {"tier": 3, "category": "other", "skill_upgrade": "IT Support"}, "itil expert": {"tier": 1, "category": "devops", "skill_upgrade": "ITIL"}, "safe agilist": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"}, "scrum master": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"}, "kubernetes cka": {"tier": 2, "category": "devops", "skill_upgrade": "Kubernetes"}, "meta blueprint": {"tier": 3, "category": "other", "skill_upgrade": "Digital Marketing"}, "itil foundation": {"tier": 2, "category": "devops", "skill_upgrade": "ITIL"}, "kubernetes ckad": {"tier": 2, "category": "devops", "skill_upgrade": "Kubernetes"}, "aws sa associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"}, "google analytics": {"tier": 3, "category": "other", "skill_upgrade": "Analytics"}, "comptia security+": {"tier": 2, "category": "security", "skill_upgrade": "Security"}, "prince2 foundation": {"tier": 2, "category": "project_management", "skill_upgrade": "Project Management"}, "aws sa professional": {"tier": 1, "category": "cloud", "skill_upgrade": "AWS"}, "azure administrator": {"tier": 2, "category": "cloud", "skill_upgrade": "Azure"}, "terraform associate": {"tier": 2, "category": "devops", "skill_upgrade": "Terraform"}, "prince2 practitioner": {"tier": 1, "category": "project_management", "skill_upgrade": "Project Management"}, "six sigma black belt": {"tier": 1, "category": "project_management", "skill_upgrade": "Process Improvement"}, "six sigma green belt": {"tier": 2, "category": "project_management", "skill_upgrade": "Process Improvement"}, "aws developer associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"}, "salesforce administrator": {"tier": 3, "category": "other", "skill_upgrade": "Salesforce"}, "gcp associate cloud engineer": {"tier": 2, "category": "cloud", "skill_upgrade": "Google Cloud"}, "azure solutions architect expert": {"tier": 1, "category": "cloud", "skill_upgrade": "Azure"}, "gcp professional cloud architect": {"tier": 1, "category": "cloud", "skill_upgrade": "Google Cloud"}, "aws solutions architect associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"}, "aws solutions architect professional": {"tier": 1, "category": "cloud", "skill_upgrade": "AWS"}}', 'Premium certification tier mapping with categories and skill upgrades', NULL, '2026-10-11 04:31:28.099771+00', '2026-10-11 04:31:28.099771+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('3047f972-4225-4c07-9f03-9c1534135960', 'tier1_colleges', '["iit", "indian institute of technology", "iim", "indian institute of management", "nit", "national institute of technology", "bits", "birla institute of technology and science", "iisc", "indian institute of science", "iiit", "international institute of information technology", "isb", "indian school of business", "xlri", "mit", "massachusetts institute of technology", "stanford", "harvard", "oxford", "cambridge", "iiser", "nlu", "national law university", "aiims", "delhi university", "jawaharlal nehru university", "jnu"]', 'Tier 1 college name patterns for credential scoring', NULL, '2026-10-11 04:31:28.099771+00', '2026-10-11 04:31:28.099771+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('021b06f2-efdf-4940-86cc-b8c790b8d5c0', 'job_domains', '["Engineering", "Design", "Marketing", "Sales", "Operations", "HR", "Finance", "Product", "Data Science", "DevOps", "QA", "Support"]', 'List of available domains for job postings. Each domain can contain multiple teams.', NULL, '2026-10-11 04:31:28.105343+00', '2026-10-11 04:31:28.105343+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('8b0f582b-8321-4c3a-b215-11c286ae4562', 'red_flag_rules', '{"employment_gap_months": 3, "frequent_switching_months": 12, "short_senior_tenure_months": 6}', 'Thresholds for automated red flag detection during candidate profile enrichment', NULL, '2026-10-11 04:31:28.18877+00', '2026-10-11 04:31:28.18877+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('5020684c-90c2-41ed-b125-4c905c2e151e', 'chitra_escalation_thresholds', '{"level1_hours": 24, "level2_hours": 48, "level3_hours": 72, "level4_hours": 96, "grace_minutes": 30, "kra10_hold_days": 7, "kra14_invite_days": 3, "kra2_level1_hours": 48, "kra2_level2_hours": 96, "kra3_level1_hours": 24, "kra10_level1_hours": 48, "kra3_min_proceeded": 2, "kra4_streak_length": 5, "kra13_prescreen_days": 3, "kra2_stagnation_days": 5, "kra15_inactivity_days": 5, "kra14_inprogress_hours": 48, "kra8_schedule_sla_hours": 48, "kra3_deadline_buffer_days": 5, "kra9_noshow_followup_hours": 24, "kra11_max_weekly_interviews": 5, "kra4_feedback_grace_minutes": 120}', 'Chitra escalation timing: minutes of grace after scheduled_at, then hours between each escalation level', NULL, '2026-10-11 04:31:28.189734+00', '2026-10-11 04:31:28.197402+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('345d16c2-4eda-48dd-b382-9d53a68da5fd', 'email_notification_settings', '{"chitra_praise": true, "chitra_warning": true, "candidate_rejected": true, "chitra_daily_report": true, "interview_cancelled": true, "interview_scheduled": true, "assignment_completed": true, "chitra_weekly_report": true, "candidate_hired_staff": true, "interviewer_daily_digest": true, "candidate_hired_applicant": true}', 'Per-type email notification toggles (admin can enable/disable each category)', NULL, '2026-10-11 04:31:28.430608+00', '2026-10-11 04:31:28.481088+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('356851ed-da59-429c-9158-cf3516e50bb7', 'compliance_settings', '{"terms_url": null, "privacy_policy_url": null, "grievance_officer_name": null, "grievance_officer_email": null}', 'GDPR/DPDP compliance hooks: privacy URLs and grievance officer contact.', NULL, '2026-10-11 04:31:28.48698+00', '2026-10-11 04:31:28.48698+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('f0c9e9eb-859d-45fb-9c27-05278b4a27ee', 'sso_settings', '{"domain": null, "enabled": false, "provider_id": null}', 'SAML SSO UI config. IdP registration is via GoTrue admin API (see docs/DEVOPS_HANDOFF.md).', NULL, '2026-10-11 04:31:28.48698+00', '2026-10-11 04:31:28.48698+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('867216b3-c661-45df-a5bd-090e87ee7a4d', 'business_branding', '{"company_name": null, "primary_color": "#D64541", "logo_mobile_url": null, "logo_desktop_url": null, "primary_foreground_color": "#FFFFFF"}', 'Tenant branding: company logos, display name, primary brand color (hex), and button text color (hex)', NULL, '2026-10-11 04:31:28.293779+00', '2026-10-11 04:31:28.36086+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('361467a5-6395-49af-b29a-930eac6f6ce2', 'email_settings', '{"enabled": true, "reply_to": "", "daily_quota": 100, "from_address": "", "monthly_quota": 3000}', 'Transactional email settings: enabled toggle, from/reply addresses, Resend free-tier quotas', NULL, '2026-10-11 04:31:28.371547+00', '2026-10-11 04:31:28.371547+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('575cf1a7-599b-4ff0-9208-5753be430f86', 'assessment_org_defaults', '{"deadline_days": 7, "default_pass_threshold": null, "notify_recruiter_on_complete": true, "require_pass_before_interview": true}', 'Org-wide assessment defaults for new jobs: deadline, pass threshold, interview gate, recruiter notifications', NULL, '2026-10-11 04:31:28.433139+00', '2026-10-11 04:31:28.433139+00');
INSERT INTO public.system_config (id, config_key, config_value, description, updated_by, created_at, updated_at) VALUES ('56f8c2e0-e374-4138-9481-87290baa409d', 'assessment_generation_settings', '{"tiers": {"tech_mid": {"passing_score": 65, "duration_minutes": 90, "max_mcq_questions": 1, "min_mcq_questions": 1, "max_coding_questions": 3, "min_coding_questions": 3, "max_subjective_questions": 2, "min_subjective_questions": 2}, "tech_junior": {"passing_score": 60, "duration_minutes": 75, "max_mcq_questions": 2, "min_mcq_questions": 1, "max_coding_questions": 3, "min_coding_questions": 3, "max_subjective_questions": 2, "min_subjective_questions": 1}, "tech_senior": {"passing_score": 70, "duration_minutes": 90, "max_mcq_questions": 2, "min_mcq_questions": 1, "max_coding_questions": 3, "min_coding_questions": 2, "max_subjective_questions": 3, "min_subjective_questions": 2}, "tech_fresher": {"passing_score": 60, "duration_minutes": 60, "max_mcq_questions": 2, "min_mcq_questions": 1, "max_coding_questions": 3, "min_coding_questions": 2, "max_subjective_questions": 2, "min_subjective_questions": 1}, "nontech_fresher": {"passing_score": 60, "duration_minutes": 60, "max_mcq_questions": 4, "min_mcq_questions": 2, "max_coding_questions": 0, "min_coding_questions": 0, "max_subjective_questions": 4, "min_subjective_questions": 2}, "nontech_experienced": {"passing_score": 65, "duration_minutes": 75, "max_mcq_questions": 2, "min_mcq_questions": 1, "max_coding_questions": 0, "min_coding_questions": 0, "max_subjective_questions": 5, "min_subjective_questions": 3}}, "global": {"marks": {"mcq": 5, "coding": 10, "subjective": 10}, "section_count": 3, "questions_per_section": 2}}', 'AI assessment generation: global structure (sections/questions/marks) and per-tier duration, passing score, question-type limits', NULL, '2026-10-11 04:31:28.433139+00', '2026-10-11 04:31:28.433139+00');

-- Auth hook ---------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage -----------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('assessment-artifacts', 'assessment-artifacts', false, 10485760, '{image/jpeg,image/png,image/gif,image/webp,application/pdf}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', true, 2097152, '{image/jpeg,image/png,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('company-assets', 'company-assets', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('interview-artifacts', 'interview-artifacts', false, 10485760, '{image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,text/plain,text/csv}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('resumes', 'resumes', false, 10485760, '{application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'::text[]) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin delete company assets" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'company-assets'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Admin update company assets" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'company-assets'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Admin upload company assets" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'company-assets'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Anon can upload careers resumes" ON storage.objects AS PERMISSIVE FOR INSERT TO anon WITH CHECK (((bucket_id = 'resumes'::text) AND public.is_anon_resume_upload_path(name)));
CREATE POLICY "Applicants can read own resume" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'resumes'::text) AND (EXISTS ( SELECT 1
   FROM public.candidates c
  WHERE ((c.email = (auth.jwt() ->> 'email'::text)) AND ((c.resume_url ~~ ('%/'::text || objects.name)) OR (c.resume_url = objects.name)))))));
CREATE POLICY "Authenticated can read avatars" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Authenticated users can upload interview artifacts" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'interview-artifacts'::text));
CREATE POLICY "Public read company assets" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'company-assets'::text));
CREATE POLICY "Signed-in users can upload own resumes" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'resumes'::text) AND (public.is_staff_user(auth.uid()) OR (name ~~ ((auth.uid())::text || '-%'::text)))));
CREATE POLICY "Staff can delete assessment artifacts" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'assessment-artifacts'::text) AND public.is_staff_user(auth.uid())));
CREATE POLICY "Staff can delete interview artifacts" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'interview-artifacts'::text) AND ((owner_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'hr'::public.app_role]))))))));
CREATE POLICY "Staff can delete resumes" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'resumes'::text) AND public.is_staff_user(auth.uid())));
CREATE POLICY "Staff can read assessment artifacts" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'assessment-artifacts'::text) AND public.is_staff_user(auth.uid())));
CREATE POLICY "Staff can read interview artifacts" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'interview-artifacts'::text) AND public.is_staff_user(auth.uid())));
CREATE POLICY "Staff can read resumes" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'resumes'::text) AND public.is_staff_user(auth.uid())));
CREATE POLICY "Users can delete own avatar" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- Realtime ----------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Scheduled jobs ----------------------------------------------------------------

SELECT cron.schedule('chitra-daily-brief', '30 3 * * *', 'SELECT public.invoke_edge_function(''chitra-daily-brief'')');
SELECT cron.schedule('chitra-engine-hourly', '0 * * * *', 'SELECT public.invoke_edge_function(''chitra-engine'')');
SELECT cron.schedule('chitra-kra-phase3-hourly', '0 * * * *', 'SELECT public.invoke_edge_function(''chitra-kra-phase3'')');
SELECT cron.schedule('chitra-kra234-hourly', '0 * * * *', 'SELECT public.invoke_edge_function(''chitra-kra234'')');
SELECT cron.schedule('chitra-weekly-report', '30 2 * * 0', 'SELECT public.invoke_edge_function(''chitra-weekly-report'')');
SELECT cron.schedule('interviewer-daily-digest', '30 3 * * *', 'SELECT public.invoke_edge_function(''interviewer-daily-digest'')');

RESET check_function_bodies;
RESET search_path;
