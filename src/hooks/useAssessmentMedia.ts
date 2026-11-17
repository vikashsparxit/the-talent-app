import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { baseMime } from '@/lib/mediaMime';
import type { MediaConsentCurrent } from '@/lib/mediaConsent';

/** Error from the assessment-media function, keeping its code (e.g. consent_required). */
export class MediaError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
  }
}

function mediaErrorFromBody(body: unknown, fallback: string): MediaError {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; code?: unknown };
  return new MediaError(
    typeof b.error === 'string' && b.error ? b.error : fallback,
    typeof b.code === 'string' ? b.code : null,
  );
}

async function invokeMedia<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('assessment-media', { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      throw mediaErrorFromBody(await context.clone().json().catch(() => null), fallback);
    }
    throw new MediaError(error.message || fallback);
  }
  if (!data?.success) throw mediaErrorFromBody(data, fallback);
  return data.data as T;
}

/**
 * How the candidate is identified, as in the exam portal: the magic-link token,
 * or 'session' for a signed-in applicant (the function checks their JWT owns
 * the attempt).
 */
export interface MediaAttemptAuth {
  accessToken: string;
  candidateAssessmentId: string;
}

function authFields({ accessToken, candidateAssessmentId }: MediaAttemptAuth): Record<string, unknown> {
  return accessToken === 'session'
    ? { candidate_assessment_id: candidateAssessmentId }
    : { access_token: accessToken };
}

export interface MediaConsentStatus {
  /** Consent is on file for the current text (an older version does not count). */
  consented: boolean;
  consent_version_on_file: string | null;
  current: MediaConsentCurrent;
}

export interface PresignedUpload {
  url: string;
  key: string;
  content_type: string;
  seq: number;
}

export interface PlaybackUrls {
  recording: {
    id: string;
    kind: 'webcam' | 'spoken_answer';
    question_id: string | null;
    status: string;
    mime: string;
    chunk_count: number;
    bytes: number;
    duration_seconds: number | null;
    started_at: string;
    ended_at: string | null;
  };
  /** In seq order. captured_at / duration_ms: browser timing of webcam segments (null for older rows). */
  urls: { seq: number; bytes: number; url: string; captured_at?: string | null; duration_ms?: number | null }[];
  expires_in: number;
}

export const assessmentMediaApi = {
  consentStatus: (auth: MediaAttemptAuth) =>
    invokeMedia<MediaConsentStatus>(
      { action: 'consent-status', ...authFields(auth) },
      'Failed to check recording consent',
    ),

  /** consentVersion: the text the candidate read; the server stores its own current version. */
  recordConsent: (auth: MediaAttemptAuth, consentVersion: string) =>
    invokeMedia<{ consented_at: string; consent_version: string }>(
      { action: 'record-consent', ...authFields(auth), data: { consent_version: consentVersion } },
      'Failed to record consent',
    ),

  startRecording: (auth: MediaAttemptAuth, mime: string) =>
    invokeMedia<{ recording_id: string; mime: string; next_seq: number; resumed: boolean }>(
      { action: 'recording-start', ...authFields(auth), data: { kind: 'webcam', mime } },
      'Failed to start recording',
    ),

  chunkUrl: (auth: MediaAttemptAuth, p: { recordingId: string; seq: number; bytes: number; mime: string }) =>
    invokeMedia<PresignedUpload>(
      {
        action: 'chunk-url',
        ...authFields(auth),
        data: { recording_id: p.recordingId, seq: p.seq, bytes: p.bytes, mime: p.mime },
      },
      'Failed to prepare upload',
    ),

  chunkDone: (
    auth: MediaAttemptAuth,
    p: { recordingId: string; seq: number; bytes: number; capturedAt?: number; durationMs?: number },
  ) =>
    invokeMedia<{ chunk_count: number }>(
      {
        action: 'chunk-done',
        ...authFields(auth),
        data: {
          recording_id: p.recordingId,
          seq: p.seq,
          bytes: p.bytes,
          ...(p.capturedAt !== undefined ? { captured_at: new Date(p.capturedAt).toISOString() } : {}),
          ...(p.durationMs !== undefined ? { duration_ms: Math.max(0, Math.round(p.durationMs)) } : {}),
        },
      },
      'Failed to confirm upload',
    ),

  finishRecording: (
    auth: MediaAttemptAuth,
    p: { recordingId: string; status: 'completed' | 'interrupted'; durationSeconds?: number },
  ) =>
    invokeMedia<{ status: string }>(
      {
        action: 'recording-finish',
        ...authFields(auth),
        data: { recording_id: p.recordingId, status: p.status, duration_seconds: p.durationSeconds },
      },
      'Failed to finish recording',
    ),

  spokenUploadUrl: (auth: MediaAttemptAuth, p: { questionId: string; attempt: number; mime: string; bytes: number }) =>
    invokeMedia<PresignedUpload & { recording_id: string }>(
      {
        action: 'spoken-upload-url',
        ...authFields(auth),
        data: { question_id: p.questionId, attempt: p.attempt, mime: p.mime, bytes: p.bytes },
      },
      'Failed to prepare upload',
    ),

  playbackUrls: (recordingId: string) =>
    invokeMedia<PlaybackUrls>({ action: 'playback-urls', data: { recording_id: recordingId } }, 'Failed to load recording'),

  /** Staff: the spoken answer for one question of an attempt (the server re-checks the viewer). */
  spokenPlaybackUrl: (p: { candidateAssessmentId: string; questionId: string; attempt?: number | null }) =>
    invokeMedia<PlaybackUrls>(
      {
        action: 'playback-urls',
        data: { candidate_assessment_id: p.candidateAssessmentId, question_id: p.questionId, attempt: p.attempt ?? null },
      },
      'Failed to load recording',
    ),
};

/** PUT a blob to a presigned R2 URL. Content-Type must match what was signed. */
export async function putToPresignedUrl(url: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new MediaError(`Upload failed (${res.status})`, 'upload_failed');
}

/** Presign, upload and confirm one webcam chunk. */
export async function uploadRecordingChunk(
  auth: MediaAttemptAuth,
  p: { recordingId: string; seq: number; blob: Blob; mime: string; capturedAt?: number; durationMs?: number },
): Promise<void> {
  const presigned = await assessmentMediaApi.chunkUrl(auth, {
    recordingId: p.recordingId,
    seq: p.seq,
    bytes: p.blob.size,
    mime: baseMime(p.mime),
  });
  await putToPresignedUrl(presigned.url, p.blob, presigned.content_type);
  await assessmentMediaApi.chunkDone(auth, {
    recordingId: p.recordingId,
    seq: p.seq,
    bytes: p.blob.size,
    capturedAt: p.capturedAt,
    durationMs: p.durationMs,
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A server refusal (a MediaError with a code, e.g. recording_closed or
 * consent_required) that retrying cannot fix. Network errors and a failed PUT
 * to storage are worth retrying.
 */
export function isFinalMediaError(error: unknown): boolean {
  return error instanceof MediaError && error.code !== null && error.code !== 'upload_failed';
}

/** Retries network and storage failures; final refusals (isFinalMediaError) are thrown at once. */
async function withUploadRetry<T>(fn: () => Promise<T>, delaysMs: readonly number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (isFinalMediaError(error) || i >= delaysMs.length) throw error;
      await wait(delaysMs[i]);
    }
  }
}

export const SPOKEN_UPLOAD_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

export interface SpokenUploadResult {
  recordingId: string;
  key: string;
  /** The attempt number the server assigned (never one already uploaded). */
  attempt: number;
}

/**
 * Presign, upload and confirm a spoken answer, retrying each step. The
 * presign is repeated with the PUT, since a URL may expire between tries.
 */
export async function uploadSpokenAnswer(
  auth: MediaAttemptAuth,
  p: { questionId: string; attempt: number; blob: Blob; mime: string; durationSeconds?: number },
  retryDelaysMs: readonly number[] = SPOKEN_UPLOAD_RETRY_DELAYS_MS,
): Promise<SpokenUploadResult> {
  const presigned = await withUploadRetry(async () => {
    const signed = await assessmentMediaApi.spokenUploadUrl(auth, {
      questionId: p.questionId,
      attempt: p.attempt,
      mime: baseMime(p.mime),
      bytes: p.blob.size,
    });
    await putToPresignedUrl(signed.url, p.blob, signed.content_type);
    return signed;
  }, retryDelaysMs);
  await withUploadRetry(
    () => assessmentMediaApi.chunkDone(auth, { recordingId: presigned.recording_id, seq: presigned.seq, bytes: p.blob.size }),
    retryDelaysMs,
  );
  // The file is stored and confirmed; a lost status update must not fail the answer.
  await assessmentMediaApi
    .finishRecording(auth, { recordingId: presigned.recording_id, status: 'completed', durationSeconds: p.durationSeconds })
    .catch(() => undefined);
  return { recordingId: presigned.recording_id, key: presigned.key, attempt: presigned.seq };
}

/** Whether the candidate has agreed to the current consent text for this attempt, and that text. */
export function mediaConsentQueryKey(candidateAssessmentId: string) {
  return ['assessment-media-consent', candidateAssessmentId] as const;
}

/** The consent on file is for the text the server shows now. */
export function hasCurrentConsent(status: MediaConsentStatus | undefined): boolean {
  return status?.consented === true && status.consent_version_on_file === status.current.version;
}

export function useMediaConsentStatus(auth: MediaAttemptAuth, enabled = true) {
  return useQuery({
    queryKey: mediaConsentQueryKey(auth.candidateAssessmentId),
    queryFn: () => assessmentMediaApi.consentStatus(auth),
    enabled,
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * Records consent and marks it current in the status query. If the text
 * changed since it was shown (409 consent_text_changed), the status is
 * refetched so the candidate reads the new text before agreeing.
 */
export function useRecordMediaConsent(auth: MediaAttemptAuth) {
  const queryClient = useQueryClient();
  const key = mediaConsentQueryKey(auth.candidateAssessmentId);
  return useMutation({
    mutationFn: (consentVersion: string) => assessmentMediaApi.recordConsent(auth, consentVersion),
    onSuccess: (saved) => {
      queryClient.setQueryData<MediaConsentStatus>(key, (prev) =>
        prev ? { ...prev, consented: true, consent_version_on_file: saved.consent_version } : prev,
      );
    },
    onError: (error) => {
      if (error instanceof MediaError && error.code === 'consent_text_changed') {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Staff: playback URL for a spoken answer, fetched only once enabled (e.g. on Play). */
export function useSpokenAnswerPlayback(
  p: { candidateAssessmentId: string; questionId: string; attempt?: number | null },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['spoken-answer-playback', p.candidateAssessmentId, p.questionId, p.attempt ?? null],
    queryFn: () => assessmentMediaApi.spokenPlaybackUrl(p),
    enabled,
    staleTime: (query) => Math.max(0, ((query.state.data?.expires_in ?? 0) * 1000) / 2),
    gcTime: 0,
    retry: false,
  });
}

/** Staff: short-lived playback URLs, refetched well before they expire. */
export function useRecordingPlaybackUrls(recordingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['assessment-recording-playback', recordingId],
    queryFn: () => assessmentMediaApi.playbackUrls(recordingId as string),
    enabled: enabled && !!recordingId,
    staleTime: (query) => Math.max(0, ((query.state.data?.expires_in ?? 0) * 1000) / 2),
    gcTime: 0,
    retry: false,
  });
}

export interface WebcamRecordingSummary {
  id: string;
  status: string;
  mime: string;
  chunk_count: number;
  bytes: number;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  retention_until: string | null;
  deleted_at: string | null;
}

/**
 * Staff: webcam recordings of an attempt (RLS: admin/HR, the job's recruiters, permitted interviewers).
 * retention_until is cleared while automatic deletion (system_config.assessment_recording_retention)
 * is off, so reviewers are not shown a date that will not be honoured.
 */
export function useWebcamRecordings(candidateAssessmentId: string | undefined) {
  return useQuery({
    queryKey: ['assessment-recordings', candidateAssessmentId],
    queryFn: async (): Promise<WebcamRecordingSummary[]> => {
      const [{ data, error }, retention] = await Promise.all([
        supabase
          .from('assessment_recordings')
          .select('id, status, mime, chunk_count, bytes, duration_seconds, started_at, ended_at, retention_until, deleted_at')
          .eq('candidate_assessment_id', candidateAssessmentId as string)
          .eq('kind', 'webcam')
          .order('started_at'),
        supabase.rpc('assessment_recording_retention_enabled'),
      ]);
      if (error) throw error;
      // Before 20261117000002 is applied the function does not exist; deletion is off then too.
      const retentionEnabled = !retention.error && retention.data === true;
      return (data ?? []).map((r) => (retentionEnabled ? r : { ...r, retention_until: null }));
    },
    enabled: !!candidateAssessmentId,
  });
}

/** Admin: recordings the next cleanup run would delete once retention is on (already expired, not hired). */
export function useExpiredRecordingCount(enabled: boolean) {
  return useQuery({
    queryKey: ['expired-assessment-recordings-count'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('count_expired_assessment_recordings');
      if (error) throw error;
      return data;
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

/** Playback refused because the recording was removed under the retention policy (HTTP 410). */
export function isDeletedRecordingError(error: unknown): boolean {
  return error instanceof MediaError &&
    (error.code === 'recording_deleted' || error.message === 'This recording has been deleted');
}
