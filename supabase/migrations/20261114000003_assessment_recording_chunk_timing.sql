-- Webcam recording segments: when each one was captured and how long it is.
--
-- Run manually after review. Not applied automatically.
-- Requires 20261114000002_assessment_media.sql. Apply before deploying the
-- assessment-media function from this change (chunk-done writes these columns).
--
-- The exam records the webcam as self-contained ~10 second files (one
-- MediaRecorder per segment), so each chunk plays on its own. captured_at and
-- duration_ms come from the candidate's browser and are only used to place
-- segments on the reviewer's timeline next to integrity events, which carry
-- timestamps from the same browser clock. They never feed a score or decision.
-- The function ignores implausible values (more than a day from server time).
--
-- Rollback:
--   ALTER TABLE public.assessment_recording_chunks
--     DROP COLUMN IF EXISTS captured_at,
--     DROP COLUMN IF EXISTS duration_ms;

BEGIN;

ALTER TABLE public.assessment_recording_chunks
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer
    CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 600000));

COMMENT ON COLUMN public.assessment_recording_chunks.captured_at IS
  'Browser time the segment started recording (reviewer timeline only).';
COMMENT ON COLUMN public.assessment_recording_chunks.duration_ms IS
  'Segment length reported by the browser, in milliseconds (reviewer timeline only).';

COMMIT;
