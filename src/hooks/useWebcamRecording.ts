import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assessmentMediaApi,
  isFinalMediaError,
  uploadRecordingChunk,
  type MediaAttemptAuth,
} from '@/hooks/useAssessmentMedia';
import { useMediaRecorder, type ChunkTiming } from '@/hooks/useMediaRecorder';
import { ChunkUploadQueue } from '@/lib/chunkUploadQueue';
import { baseMime, pickRecorderMime } from '@/lib/mediaMime';
import type { MediaIntegrityEventType } from '@/types/database';

/** Each webcam segment is a separate ~10 second file. */
export const WEBCAM_SEGMENT_MS = 10_000;
/** After submit, keep uploading what is left for this long (the server accepts chunks for 5 minutes). */
export const FINISH_FLUSH_TIMEOUT_MS = 120_000;
/** Before a candidate's submit: how long to wait for segments still waiting to upload. */
export const SUBMIT_FLUSH_TIMEOUT_MS = 30_000;
/** Before the timer's submit: shorter, well inside the server's grace after time is up. */
export const AUTO_SUBMIT_FLUSH_TIMEOUT_MS = 20_000;
export const START_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 5000, 10_000, 15_000];

export type WebcamRecordingPhase = 'idle' | 'connecting' | 'recording' | 'paused' | 'finished' | 'unavailable';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface UseWebcamRecordingOptions {
  auth: MediaAttemptAuth;
  /** The granted camera + microphone stream (tracks are cloned for recording). */
  stream: MediaStream | null;
  /** Record while true: attempt started, devices granted, not submitting. */
  active: boolean;
  /** Integrity signals (recording_interrupted, recording_upload_failed). Signals only. */
  onSignal: (type: MediaIntegrityEventType) => void;
  startRetryDelaysMs?: readonly number[];
  /** Passed to the upload queue (tests use zeros). */
  uploadRetryDelaysMs?: readonly number[];
}

/**
 * Webcam recording for the whole attempt: opens (or resumes) the server-side
 * recording, records ~10 second segments from the exam's stream and uploads
 * them in order through a bounded retry queue. Pausing (active false) keeps
 * the recording open, so a later start continues the same recording and seq.
 * finish() stops, uploads what is left and closes the recording. Nothing here
 * affects the attempt itself.
 */
export function useWebcamRecording({
  auth,
  stream,
  active,
  onSignal,
  startRetryDelaysMs = START_RETRY_DELAYS_MS,
  uploadRetryDelaysMs,
}: UseWebcamRecordingOptions) {
  const [phase, setPhase] = useState<WebcamRecordingPhase>('idle');
  const [pending, setPending] = useState(0);
  const [restartKey, setRestartKey] = useState(0);

  const authRef = useRef(auth);
  authRef.current = auth;
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  const recordingIdRef = useRef<string | null>(null);
  const mimeByRecording = useRef(new Map<string, string>());
  const nextSeqRef = useRef(0);
  const recordedMsRef = useRef(0);
  const finishedRef = useRef(false);
  const dropLoggedRef = useRef(false);

  const [queue] = useState(
    () =>
      new ChunkUploadQueue({
        upload: (c) =>
          uploadRecordingChunk(authRef.current, {
            recordingId: c.recordingId,
            seq: c.seq,
            blob: c.blob,
            mime: mimeByRecording.current.get(c.recordingId) ?? c.blob.type,
            capturedAt: c.capturedAt,
            durationMs: c.durationMs,
          }),
        isFinal: isFinalMediaError,
        ...(uploadRetryDelaysMs ? { retryDelaysMs: uploadRetryDelaysMs } : {}),
        onDropped: () => {
          if (dropLoggedRef.current) return;
          dropLoggedRef.current = true;
          onSignalRef.current('recording_upload_failed');
        },
        onUploaded: () => {
          dropLoggedRef.current = false;
        },
        onChange: setPending,
      }),
  );

  useEffect(() => {
    const onOnline = () => queue.wake();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queue]);

  const onChunk = useCallback(
    (blob: Blob, seq: number, timing: ChunkTiming) => {
      nextSeqRef.current = Math.max(nextSeqRef.current, seq + 1);
      const durationMs = Math.max(0, timing.endedAt - timing.startedAt);
      recordedMsRef.current += durationMs;
      const recordingId = recordingIdRef.current;
      if (recordingId) queue.enqueue({ recordingId, seq, blob, capturedAt: timing.startedAt, durationMs });
    },
    [queue],
  );

  const recorder = useMediaRecorder({
    kind: 'video',
    segmentMs: WEBCAM_SEGMENT_MS,
    stream,
    onChunk,
    onInterrupted: (reason) => {
      onSignalRef.current('recording_interrupted');
      setPhase((p) => (p === 'finished' ? p : 'paused'));
      // A recorder failure with the camera still on: try again on the same stream.
      // A lost camera comes back through the permission gate with a new stream.
      if (reason === 'recorder_error') setTimeout(() => setRestartKey((k) => k + 1), 2000);
    },
  });
  const { start: startRecorder, stop: stopRecorder } = recorder;

  useEffect(() => {
    if (!active || !stream || finishedRef.current) return;
    let cancelled = false;
    void (async () => {
      const picked = pickRecorderMime('video');
      if (!picked) {
        setPhase('unavailable');
        return;
      }
      setPhase('connecting');
      let started: Awaited<ReturnType<typeof assessmentMediaApi.startRecording>> | null = null;
      for (let i = 0; !started; i++) {
        try {
          started = await assessmentMediaApi.startRecording(authRef.current, baseMime(picked));
        } catch (error) {
          if (cancelled) return;
          if (isFinalMediaError(error)) {
            setPhase('unavailable');
            return;
          }
          await wait(startRetryDelaysMs[Math.min(i, startRetryDelaysMs.length - 1)] ?? 0);
        }
        if (cancelled) return;
      }
      recordingIdRef.current = started.recording_id;
      mimeByRecording.current.set(started.recording_id, started.mime);
      // Resuming continues the numbering; segments still queued here keep theirs.
      const startSeq = Math.max(started.next_seq, nextSeqRef.current);
      nextSeqRef.current = startSeq;
      const ok = await startRecorder({ startSeq });
      if (cancelled) {
        void stopRecorder();
        return;
      }
      setPhase(ok ? 'recording' : 'paused');
    })();
    return () => {
      cancelled = true;
      void stopRecorder();
      setPhase((p) => (p === 'finished' || p === 'unavailable' ? p : 'paused'));
    };
  }, [active, stream, restartKey, startRecorder, stopRecorder, startRetryDelaysMs]);

  /** Stops recording, uploads what is left (best effort) and closes the recording. Safe to call twice. */
  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    await stopRecorder();
    setPhase('finished');
    const recordingId = recordingIdRef.current;
    if (!recordingId) return;
    const drained = await queue.flush(FINISH_FLUSH_TIMEOUT_MS);
    await assessmentMediaApi
      .finishRecording(authRef.current, {
        recordingId,
        status: drained && queue.dropped === 0 ? 'completed' : 'interrupted',
        durationSeconds: Math.round(recordedMsRef.current / 100) / 10,
      })
      .catch(() => undefined);
  }, [queue, stopRecorder]);

  /**
   * Before submit: retries now and waits (up to timeoutMs) for the segments
   * already waiting to upload. Recording carries on. Resolves to the number
   * of segments not uploaded: still waiting plus given up (refused, retries
   * exhausted or pushed out of a full buffer). 0 only when every recorded
   * segment was uploaded.
   */
  const flush = useCallback(
    async (timeoutMs: number): Promise<number> => {
      await queue.flush(timeoutMs);
      return queue.pending + queue.dropped;
    },
    [queue],
  );

  return { phase, pending, finish, flush };
}
