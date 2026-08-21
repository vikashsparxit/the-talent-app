-- Fix 20260615000002 production error: "SET is not allowed in a non-volatile function"
--
-- Root cause: helpers were plpgsql STABLE with SET LOCAL row_security = off.
-- PostgreSQL forbids SET in non-VOLATILE functions.
--
-- Fix: match has_role() / is_recruiter_for_job() — SQL STABLE SECURITY DEFINER,
-- simple EXISTS, no SET LOCAL. Function owner (postgres) bypasses RLS on owned tables.

CREATE OR REPLACE FUNCTION public.is_panelist_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interview_panelists cip
    WHERE cip.candidate_interview_id = _candidate_interview_id
      AND cip.interviewer_user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_primary_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.id = _candidate_interview_id
      AND ci.interviewer_user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_recruiter_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
    WHERE ci.id = _candidate_interview_id
      AND public.is_recruiter_for_job(_user_id, jis.job_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_interviewer_for_interview(_user_id uuid, _candidate_interview_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.candidate_interviewers cint ON cint.candidate_id = ci.candidate_id
    WHERE ci.id = _candidate_interview_id
      AND cint.interviewer_user_id = _user_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_panelist_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_primary_interviewer_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recruiter_for_interview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_interviewer_for_interview(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
