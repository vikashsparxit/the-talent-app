-- Drop legacy unique index that blocks multiple interview sessions per candidate/stage
-- with the same panelist. The round-level constraint was already removed in
-- 20260422000003_drop_stage_session_unique.sql; this index was left behind and
-- still causes 409 on POST when scheduling a follow-up session after a verdict.
--
-- Reschedule uses UPDATE on the existing row; new sessions after verdict use INSERT.

DROP INDEX IF EXISTS public.candidate_interviews_candidate_stage_interviewer_unique_idx;
