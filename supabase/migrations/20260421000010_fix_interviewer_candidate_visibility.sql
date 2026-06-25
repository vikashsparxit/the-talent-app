-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: interviewers see NULL candidate names in pending feedback panel
--
-- Root cause: is_interviewer_for_candidate() only checks candidate_interviewers
-- table. But interviewers can also be assigned via candidate_interviews.interviewer_user_id
-- (the scheduling flow). When PostgREST resolves the nested FK join
-- candidate:candidates!fk(name, email, ...) for an interviewer JWT, it checks
-- the "Interviewers can view assigned candidates" RLS policy which calls this
-- function. If the interviewer is not in candidate_interviewers (only has an
-- interviewer_user_id assignment), the policy returns false → candidate fields
-- come back as null → name shows as "Unknown".
--
-- Fix: extend the function to also match on candidate_interviews.interviewer_user_id.
-- Safe to run multiple times (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_interviewer_for_candidate(_user_id uuid, _candidate_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.candidate_interviewers
        WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
    )
    OR EXISTS (
        SELECT 1 FROM public.candidate_interviews
        WHERE interviewer_user_id = _user_id AND candidate_id = _candidate_id
    )
$$;
