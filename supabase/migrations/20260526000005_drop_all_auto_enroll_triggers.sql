-- Drop ALL auto-enrollment triggers and functions so every candidate
-- lands in Pending Approval before entering any pipeline stage.
--
-- Background: there were two separate auto-enroll implementations:
--   1. auto_enroll_candidate_in_pipeline() — dropped in 20260526000002
--   2. auto_add_candidate_to_pipeline()    — THIS file drops this one
--      (trigger: on_candidate_job_assigned on candidates table)
--
-- After this migration, a candidate assigned to a job will have NO
-- candidate_interviews row until a recruiter explicitly clicks Approve
-- in the Pipeline → Pending Approval column.

DROP FUNCTION IF EXISTS public.auto_add_candidate_to_pipeline() CASCADE;
