
-- Create a restricted view for interviewers that excludes sensitive prescreen columns
-- Interviewers should NOT see: current_ctc, expected_ctc, notice_period, lwd
CREATE VIEW public.interviewer_prescreens
WITH (security_invoker = false)
AS
SELECT
  id,
  candidate_id,
  total_experience_years,
  relevant_experience_years,
  relevant_experience_domain,
  current_location,
  preferred_location,
  comms_rating,
  academics,
  nutshell,
  screened_by,
  screened_at,
  created_at,
  updated_at
FROM public.candidate_prescreens;

-- Grant interviewers access to the view
GRANT SELECT ON public.interviewer_prescreens TO authenticated;

-- Drop the existing interviewer SELECT policy on the base table
-- so interviewers must use the view instead
DROP POLICY IF EXISTS "Interviewers can view prescreens for assigned candidates" ON public.candidate_prescreens;

-- Create RLS on the view is not possible, so we use a security definer function
-- that checks interviewer access before returning data from the view
CREATE OR REPLACE FUNCTION public.get_interviewer_prescreen(_candidate_id uuid)
RETURNS TABLE(
  id uuid,
  candidate_id uuid,
  total_experience_years numeric,
  relevant_experience_years numeric,
  relevant_experience_domain text,
  current_location text,
  preferred_location text,
  comms_rating numeric,
  academics jsonb,
  nutshell text,
  screened_by uuid,
  screened_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
