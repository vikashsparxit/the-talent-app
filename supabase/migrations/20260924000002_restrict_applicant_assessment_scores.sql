-- H-9: applicants must not set their own assessment scores via REST.
-- SECURITY INVOKER is required: under DEFINER, current_user is the owner and the
-- service-role bypass below would always match.
-- aa_ prefix: fires before auto_score_mcq_on_* (same-event triggers run in name order).

BEGIN;

CREATE OR REPLACE FUNCTION public.restrict_applicant_response_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

DROP TRIGGER IF EXISTS aa_restrict_applicant_response_scores ON public.candidate_responses;
CREATE TRIGGER aa_restrict_applicant_response_scores
  BEFORE INSERT OR UPDATE ON public.candidate_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_applicant_response_scores();

CREATE OR REPLACE FUNCTION public.restrict_applicant_assessment_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

DROP TRIGGER IF EXISTS aa_restrict_applicant_assessment_scores ON public.candidate_assessments;
CREATE TRIGGER aa_restrict_applicant_assessment_scores
  BEFORE UPDATE ON public.candidate_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_applicant_assessment_scores();

COMMIT;
