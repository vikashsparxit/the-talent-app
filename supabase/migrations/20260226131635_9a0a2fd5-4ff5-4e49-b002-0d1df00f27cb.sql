-- Allow multiple interviewer feedback records per candidate/stage while still preventing exact duplicates
ALTER TABLE public.candidate_interviews
DROP CONSTRAINT IF EXISTS candidate_interviews_candidate_id_job_interview_stage_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_interviews_candidate_stage_interviewer_unique_idx
ON public.candidate_interviews (
  candidate_id,
  job_interview_stage_id,
  COALESCE(interviewer_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);