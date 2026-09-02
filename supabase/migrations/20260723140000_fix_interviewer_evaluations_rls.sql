-- Fix: interviewers see all evaluations (candidate_assessments SELECT leak).
--
-- Root causes addressed:
-- 1. Leftover "Candidates can view/update own assessment via token" policies with
--    USING (true) — SELECT USING(true) is invisible to Supabase's rls_policy_always_true
--    lint, but grants every authenticated user all candidate_assessments rows.
-- 2. Interviewer SELECT on candidate_assessments must be assignment-scoped via
--    SECURITY DEFINER helpers (same sources as pipeline: candidate_interviewers,
--    candidate_interviews, panelists → is_interviewer_for_candidate / _for_job).
-- 3. Nested assessments embed was empty for interviewers after dropping is_staff
--    blanket read; recreate interviewer assessments SELECT using the same helper
--    (avoids RLS recursion on candidate_assessments ↔ assessments).
--
-- Admin/HR and recruiter policies are unchanged (broader access retained).

-- ─── Drop known leaky token policies (may still exist in prod) ───────────────

DROP POLICY IF EXISTS "Candidates can view own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can update own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can view own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can update own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can create own responses" ON public.candidate_responses;

-- ─── Helper: interviewer may view this candidate_assessment row ──────────────

CREATE OR REPLACE FUNCTION public.can_interviewer_view_candidate_assessment(
  _user_id uuid,
  _candidate_id uuid,
  _job_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.can_interviewer_view_candidate_assessment(uuid, uuid, uuid)
  TO authenticated;

-- ─── candidate_assessments: interviewer SELECT (assignment only) ─────────────

DROP POLICY IF EXISTS "Interviewers can view assigned candidate_assessments"
  ON public.candidate_assessments;

CREATE POLICY "Interviewers can view assigned candidate_assessments"
  ON public.candidate_assessments FOR SELECT
  USING (
    public.can_interviewer_view_candidate_assessment(
      auth.uid(),
      candidate_assessments.candidate_id,
      candidate_assessments.job_id
    )
  );

-- ─── assessments: interviewer SELECT via same helper (no is_staff) ───────────

DROP POLICY IF EXISTS "Interviewers can view assessments for assigned work"
  ON public.assessments;
DROP POLICY IF EXISTS "Recruiters can view active assessments"
  ON public.assessments;

-- Keep / recreate admin+recruiter path if missing (idempotent replace)
DROP POLICY IF EXISTS "Admin HR recruiter can view assessments" ON public.assessments;
CREATE POLICY "Admin HR recruiter can view assessments"
  ON public.assessments FOR SELECT
  USING (
    public.is_admin_or_hr(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'::public.app_role
    )
  );

CREATE POLICY "Interviewers can view assessments for assigned work"
  ON public.assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidate_assessments ca
      WHERE ca.assessment_id = assessments.id
        AND public.can_interviewer_view_candidate_assessment(
          auth.uid(),
          ca.candidate_id,
          ca.job_id
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.default_assessment_id = assessments.id
        AND public.is_interviewer_for_job(auth.uid(), j.id)
    )
  );

-- ─── candidate_responses: mirror assignment scope for interviewers ───────────

DROP POLICY IF EXISTS "Interviewers can view responses for assigned candidates"
  ON public.candidate_responses;
CREATE POLICY "Interviewers can view responses for assigned candidates"
  ON public.candidate_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidate_assessments ca
      WHERE ca.id = candidate_responses.candidate_assessment_id
        AND public.can_interviewer_view_candidate_assessment(
          auth.uid(),
          ca.candidate_id,
          ca.job_id
        )
    )
  );

DROP POLICY IF EXISTS "Interviewers can update responses for assigned candidates"
  ON public.candidate_responses;
CREATE POLICY "Interviewers can update responses for assigned candidates"
  ON public.candidate_responses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidate_assessments ca
      WHERE ca.id = candidate_responses.candidate_assessment_id
        AND public.can_interviewer_view_candidate_assessment(
          auth.uid(),
          ca.candidate_id,
          ca.job_id
        )
    )
  );
