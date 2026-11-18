-- Assessment media: webcam recordings and spoken answers stored in Cloudflare R2.
--
-- Run manually after review. Not applied automatically.
-- Requires 20261114000001_question_type_spoken.sql to have been applied first.
--
-- Media files live in a private R2 bucket; these tables only hold metadata.
-- Rows are written by the assessment-media edge function with the service
-- role. anon/authenticated get no INSERT/UPDATE/DELETE policies at all, so
-- candidates cannot alter what reviewers see (unlike
-- candidate_assessments.integrity_log, which applicants can write via RLS).
--
-- Reviewers who may read recording metadata (and, through the edge function,
-- get playback URLs): admin/HR, recruiters assigned to the attempt's job, and
-- interviewers who may view that candidate assessment. Candidates never read
-- these tables.
--
-- Consent: assessment_media_consents keeps one server-timestamped row per
-- attempt (written by the 'record-consent' action). It is a separate table, not
-- columns on candidate_assessments, because applicants can UPDATE their own
-- candidate_assessments row through RLS and could otherwise forge it. Each
-- recording also copies consent_at / consent_version when it starts.
--
-- Nothing here deletes data or changes stages/scores. AI scores on spoken
-- answers (later step) stay advisory, like auto_score vs manual_score.
--
-- Rollback (no other objects depend on these):
--   DROP TABLE IF EXISTS public.assessment_recording_chunks;
--   DROP TABLE IF EXISTS public.assessment_recordings;
--   DROP TABLE IF EXISTS public.assessment_media_consents;
--   DROP FUNCTION IF EXISTS public.can_view_assessment_media(uuid, uuid);
--   ALTER TABLE public.questions DROP COLUMN IF EXISTS spoken_config;
--   (R2 objects under recordings/ and spoken/ must be removed separately.)

BEGIN;

-- ── Spoken question settings ────────────────────────────────────────────────

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS spoken_config jsonb;

COMMENT ON COLUMN public.questions.spoken_config IS
  'Spoken questions only. {"max_seconds":120,"prep_seconds":0,"max_attempts":1}; missing keys use these defaults.';

-- ── Viewer helper (RLS and the edge function use the same rule) ─────────────

CREATE OR REPLACE FUNCTION public.can_view_assessment_media(
  _user_id uuid,
  _candidate_assessment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.candidate_assessments ca
    LEFT JOIN public.candidates c ON c.id = ca.candidate_id
    WHERE ca.id = _candidate_assessment_id
      AND (
        public.is_admin_or_hr(_user_id)
        OR (
          COALESCE(ca.job_id, c.job_id) IS NOT NULL
          AND public.is_recruiter_for_job(_user_id, COALESCE(ca.job_id, c.job_id))
        )
        OR public.can_interviewer_view_candidate_assessment(_user_id, ca.candidate_id, ca.job_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_assessment_media(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_assessment_media(uuid, uuid) TO authenticated;

-- ── Consent ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assessment_media_consents (
  candidate_assessment_id uuid PRIMARY KEY
    REFERENCES public.candidate_assessments(id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_media_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers can view assessment media consents" ON public.assessment_media_consents;
CREATE POLICY "Reviewers can view assessment media consents"
  ON public.assessment_media_consents FOR SELECT TO authenticated
  USING (public.can_view_assessment_media(auth.uid(), candidate_assessment_id));

DROP TRIGGER IF EXISTS update_assessment_media_consents_updated_at ON public.assessment_media_consents;
CREATE TRIGGER update_assessment_media_consents_updated_at
  BEFORE UPDATE ON public.assessment_media_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Recordings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assessment_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_assessment_id uuid NOT NULL
    REFERENCES public.candidate_assessments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('webcam', 'spoken_answer')),
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording', 'completed', 'interrupted', 'failed', 'deleted')),
  mime text NOT NULL,
  storage_provider text NOT NULL DEFAULT 'r2',
  storage_prefix text NOT NULL,
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  duration_seconds numeric CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  consent_at timestamptz,
  consent_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_chunk_at timestamptz,
  retention_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assessment_recordings IS
  'Webcam recordings and spoken answers (objects in R2 under storage_prefix). Service-role writes only; reviewers read via RLS.';

-- Lookup by attempt (reviewer views, resume after reconnect).
CREATE INDEX IF NOT EXISTS assessment_recordings_ca_kind_idx
  ON public.assessment_recordings (candidate_assessment_id, kind, status);
-- One spoken-answer row per attempt + question (re-recordings overwrite it).
CREATE UNIQUE INDEX IF NOT EXISTS assessment_recordings_spoken_question_uidx
  ON public.assessment_recordings (candidate_assessment_id, question_id)
  WHERE kind = 'spoken_answer';
-- Retention cleanup: rows past retention that still have objects.
CREATE INDEX IF NOT EXISTS assessment_recordings_retention_idx
  ON public.assessment_recordings (retention_until)
  WHERE deleted_at IS NULL AND retention_until IS NOT NULL;

ALTER TABLE public.assessment_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers can view assessment recordings" ON public.assessment_recordings;
CREATE POLICY "Reviewers can view assessment recordings"
  ON public.assessment_recordings FOR SELECT TO authenticated
  USING (public.can_view_assessment_media(auth.uid(), candidate_assessment_id));

DROP TRIGGER IF EXISTS update_assessment_recordings_updated_at ON public.assessment_recordings;
CREATE TRIGGER update_assessment_recordings_updated_at
  BEFORE UPDATE ON public.assessment_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Recording chunks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.assessment_recording_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL
    REFERENCES public.assessment_recordings(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 0),
  object_key text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_recording_chunks_recording_seq_key UNIQUE (recording_id, seq)
);

ALTER TABLE public.assessment_recording_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviewers can view assessment recording chunks" ON public.assessment_recording_chunks;
CREATE POLICY "Reviewers can view assessment recording chunks"
  ON public.assessment_recording_chunks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assessment_recordings r
      WHERE r.id = assessment_recording_chunks.recording_id
        AND public.can_view_assessment_media(auth.uid(), r.candidate_assessment_id)
    )
  );

-- No INSERT / UPDATE / DELETE policies: only the service role writes.
REVOKE INSERT, UPDATE, DELETE ON public.assessment_media_consents FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_recordings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_recording_chunks FROM anon, authenticated;
REVOKE ALL ON public.assessment_media_consents FROM anon;
REVOKE ALL ON public.assessment_recordings FROM anon;
REVOKE ALL ON public.assessment_recording_chunks FROM anon;

COMMIT;
