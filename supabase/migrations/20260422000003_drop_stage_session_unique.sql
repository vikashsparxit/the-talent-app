-- Allow multiple interview sessions per candidate per stage per round.
-- Previously one row per (candidate, stage, round) was enforced, which prevented
-- scheduling additional interview sessions in the same stage after a verdict was set.
-- Interviewers now each get their own session row with independent feedback.

ALTER TABLE candidate_interviews
  DROP CONSTRAINT IF EXISTS candidate_interviews_candidate_stage_round_key;
