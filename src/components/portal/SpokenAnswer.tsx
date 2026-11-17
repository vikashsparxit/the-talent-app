import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mic, RefreshCw, Square, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MediaConsentScreen } from '@/components/portal/MediaConsentScreen';
import { MediaPermissionGate, MediaProblemAlert } from '@/components/portal/MediaPermissionGate';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import {
  MediaError,
  SPOKEN_UPLOAD_RETRY_DELAYS_MS,
  hasCurrentConsent,
  uploadSpokenAnswer,
  useMediaConsentStatus,
  useRecordMediaConsent,
  type SpokenUploadResult,
} from '@/hooks/useAssessmentMedia';
import { useSaveResponse, type PortalQuestion } from '@/hooks/useCandidatePortal';
import { isAttemptOverError } from '@/lib/assessmentGrading';
import { baseMime } from '@/lib/mediaMime';
import {
  buildSpokenAnswerResponse,
  formatSpokenSeconds,
  parseSpokenAnswerResponse,
  parseSpokenConfig,
  type SpokenAnswerResponse,
} from '@/lib/spokenAnswer';
import type { Json } from '@/integrations/supabase/types';
import type { MediaIntegrityEventType } from '@/types/database';

/** Matches the server limit for one spoken answer (SPOKEN_MAX_BYTES). */
const SPOKEN_MAX_BYTES = 15 * 1024 * 1024;

interface SpokenAnswerProps {
  question: Pick<PortalQuestion, 'id' | 'spoken_config'>;
  candidateAssessmentId: string;
  /** Magic-link token, or 'session' for a signed-in applicant. */
  accessToken: string;
  /** The saved response for this question, if any. */
  response: Json | undefined;
  /** Called once the recording is uploaded and the answer saved. */
  onSaved: (response: SpokenAnswerResponse) => void;
  /** Integrity signals (mic_denied, recording_upload_failed). Signals only; nothing is scored or decided from them. */
  onIntegrityEvent: (type: MediaIntegrityEventType) => void;
  /** Waits between upload retries (tests pass zeros). */
  retryDelaysMs?: readonly number[];
  /**
   * An already-granted stream (the exam's camera + microphone) to record the
   * audio from. Opening the microphone a second time can mute or end the
   * webcam recording's audio on iOS Safari, so the exam passes its stream.
   */
  audioSource?: MediaStream | null;
  /**
   * True while a take is being recorded or waits to be saved (including a
   * failed save), false once it is saved. Not called on mount, so a take lost
   * by leaving the question stays reported until an answer is saved here.
   */
  onUnsavedChange?: (unsaved: boolean) => void;
}

type Phase = 'idle' | 'prep' | 'recording' | 'review' | 'saving' | 'error';

interface Take {
  blob: Blob;
  url: string;
  mime: string;
  durationSeconds: number;
  /** Take number, sent as the attempt. */
  attempt: number;
}

/** Takes started for a question survive navigating away and reloads in the same tab. */
function takesKey(candidateAssessmentId: string, questionId: string) {
  return `spoken-takes:${candidateAssessmentId}:${questionId}`;
}

function readTakes(key: string): number {
  try {
    const n = Number(sessionStorage.getItem(key));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeTakes(key: string, n: number) {
  try {
    sessionStorage.setItem(key, String(n));
  } catch {
    /* storage unavailable: the server still enforces the attempt limit */
  }
}

/**
 * Audio-only answer: optional prep countdown, recording that stops itself at
 * max_seconds, playback of the take, re-recording while attempts remain, then
 * upload to private storage and save through save-response.
 */
export function SpokenAnswer({
  question,
  candidateAssessmentId,
  accessToken,
  response,
  onSaved,
  onIntegrityEvent,
  retryDelaysMs = SPOKEN_UPLOAD_RETRY_DELAYS_MS,
  audioSource,
  onUnsavedChange,
}: SpokenAnswerProps) {
  const cfg = useMemo(() => parseSpokenConfig(question.spoken_config), [question.spoken_config]);
  const auth = useMemo(() => ({ accessToken, candidateAssessmentId }), [accessToken, candidateAssessmentId]);
  const saved = parseSpokenAnswerResponse(response);
  const storageKey = takesKey(candidateAssessmentId, question.id);

  const consent = useMediaConsentStatus(auth);
  const recordConsent = useRecordMediaConsent(auth);
  const [consentGiven, setConsentGiven] = useState(false);
  const saveResponse = useSaveResponse();

  const [phase, setPhase] = useState<Phase>('idle');
  const [takesUsed, setTakesUsed] = useState(() => Math.max(readTakes(storageKey), saved?.attempt ?? 0));
  const [prepLeft, setPrepLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);

  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const uploadedRef = useRef<SpokenUploadResult | null>(null);
  const loggedRef = useRef<Set<MediaIntegrityEventType>>(new Set());

  const logOnce = useCallback(
    (type: MediaIntegrityEventType) => {
      if (loggedRef.current.has(type)) return;
      loggedRef.current.add(type);
      onIntegrityEvent(type);
    },
    [onIntegrityEvent],
  );

  const {
    start: startRecorder,
    stop: stopRecorder,
    status: recorderStatus,
    problem: recorderProblem,
    mime: recorderMime,
    level,
  } = useMediaRecorder({
    kind: 'audio',
    meter: true,
    stream: audioSource,
    onChunk: (blob) => {
      chunksRef.current.push(blob);
    },
  });

  useEffect(() => {
    if (recorderProblem === 'denied') logOnce('mic_denied');
  }, [recorderProblem, logOnce]);

  // Free the local take's object URL when it is replaced or the question unmounts.
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  const attemptsLeft = Math.max(0, cfg.max_attempts - takesUsed);

  const unsaved = phase === 'recording' || (phase !== 'idle' && take !== null);
  const reportedUnsavedRef = useRef(false);
  useEffect(() => {
    if (unsaved === reportedUnsavedRef.current) return;
    reportedUnsavedRef.current = unsaved;
    onUnsavedChange?.(unsaved);
  }, [unsaved, onUnsavedChange]);

  const beginRecording = useCallback(async () => {
    chunksRef.current = [];
    stoppingRef.current = false;
    setElapsed(0);
    await startRecorder();
  }, [startRecorder]);

  // The microphone could not be opened: back to idle, where the blocker shows.
  useEffect(() => {
    if (phase === 'prep' && recorderStatus === 'error') setPhase('idle');
  }, [phase, recorderStatus]);

  // A take counts once recording has actually started.
  useEffect(() => {
    if (recorderStatus !== 'recording' || phase === 'recording') return;
    startedAtRef.current = Date.now();
    setTakesUsed((n) => {
      const next = n + 1;
      writeTakes(storageKey, next);
      return next;
    });
    setPhase('recording');
  }, [recorderStatus, phase, storageKey]);

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const durationSeconds = Math.min(cfg.max_seconds, (Date.now() - startedAtRef.current) / 1000);
    await stopRecorder();
    const mime = recorderMime ?? 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: baseMime(mime) });
    uploadedRef.current = null;
    setTake({ blob, url: URL.createObjectURL(blob), mime, durationSeconds, attempt: takesUsed });
    setPhase('review');
  }, [cfg.max_seconds, stopRecorder, recorderMime, takesUsed]);

  // A track that ends mid-answer (mic unplugged, permission revoked) stops the take.
  useEffect(() => {
    if (phase === 'recording' && recorderStatus === 'stopped') void stopRecording();
  }, [phase, recorderStatus, stopRecording]);

  // Elapsed timer; stops the take at max_seconds.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= cfg.max_seconds) void stopRecording();
    }, 250);
    return () => clearInterval(id);
  }, [phase, cfg.max_seconds, stopRecording]);

  // Prep countdown, then recording starts on its own.
  useEffect(() => {
    if (phase !== 'prep') return;
    if (prepLeft <= 0) {
      void beginRecording();
      return;
    }
    const id = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, prepLeft, beginRecording]);

  const startTake = () => {
    if (attemptsLeft <= 0) return;
    setError(null);
    setPrepLeft(cfg.prep_seconds);
    setPhase('prep');
  };

  const saveTake = async () => {
    if (!take) return;
    if (take.blob.size === 0) {
      setError('The recording is empty. Check your microphone and record again.');
      setPhase('error');
      return;
    }
    if (take.blob.size > SPOKEN_MAX_BYTES) {
      setError('This recording is too large to upload. Record a shorter answer.');
      setPhase('error');
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      if (!uploadedRef.current) {
        uploadedRef.current = await uploadSpokenAnswer(
          auth,
          {
            questionId: question.id,
            attempt: take.attempt,
            blob: take.blob,
            mime: take.mime,
            durationSeconds: take.durationSeconds,
          },
          retryDelaysMs,
        );
      }
      const uploaded = uploadedRef.current;
      const next = buildSpokenAnswerResponse({
        key: uploaded.key,
        mime: baseMime(take.mime),
        size: take.blob.size,
        durationSeconds: take.durationSeconds,
        attempt: uploaded.attempt,
      });
      await saveResponse.mutateAsync({
        candidateAssessmentId,
        questionId: question.id,
        response: next as unknown as Json,
        accessToken,
      });
      if (uploaded.attempt > takesUsed) {
        setTakesUsed(uploaded.attempt);
        writeTakes(storageKey, uploaded.attempt);
      }
      onSaved(next);
      setPhase('idle');
    } catch (err) {
      if (err instanceof MediaError && err.code === 'consent_required') {
        setNeedsConsent(true);
        setPhase('review');
        return;
      }
      const refused = (err instanceof MediaError && err.code !== null && err.code !== 'upload_failed') ||
        isAttemptOverError(err);
      if (!uploadedRef.current && !refused) logOnce('recording_upload_failed');
      setError(
        isAttemptOverError(err) ||
          (err instanceof MediaError && (err.code === 'time_limit_exceeded' || err.code === 'already_submitted'))
          ? 'The time for this assessment is over, so this answer could not be saved.'
          : err instanceof MediaError && err.code === 'attempts_exhausted'
            ? 'No attempts are left for this question.'
            : err instanceof MediaError && err.code === 'storage_not_configured'
              ? 'Recording is not available right now. Please contact the hiring team.'
              : `Your answer was not saved: ${err instanceof Error ? err.message : 'unknown error'}. Check your connection and try again.`,
      );
      setPhase('error');
    }
  };

  const acceptConsent = async (version: string) => {
    try {
      await recordConsent.mutateAsync(version);
    } catch {
      return; // Shown under the consent screen; a changed text is refetched by the hook.
    }
    setConsentGiven(true);
    if (needsConsent) {
      setNeedsConsent(false);
      void saveTake();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (consent.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your microphone…
      </p>
    );
  }

  if (consent.isError && (!consentGiven || (needsConsent && !consent.data))) {
    const unavailable = consent.error instanceof MediaError && consent.error.code === 'storage_not_configured';
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{unavailable ? 'Recording is not available right now' : 'Could not prepare recording'}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            {unavailable
              ? 'Spoken answers cannot be recorded at the moment. You can continue with other questions; please let the hiring team know.'
              : 'Check your connection and try again.'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void consent.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (((!hasCurrentConsent(consent.data) && !consentGiven) || needsConsent) && consent.data) {
    const textChanged = recordConsent.error instanceof MediaError && recordConsent.error.code === 'consent_text_changed';
    return (
      <div className="space-y-3">
        <MediaConsentScreen
          key={consent.data.current.version}
          consent={consent.data.current}
          onAccept={(v) => void acceptConsent(v)}
          isSubmitting={recordConsent.isPending || consent.isFetching}
        />
        {recordConsent.error && (
          <p className="text-sm text-destructive" role="alert">
            {textChanged
              ? 'The recording consent text has been updated. Please read it again and agree to continue.'
              : `Your consent could not be saved: ${recordConsent.error.message}. Check your connection and try again.`}
          </p>
        )}
      </div>
    );
  }

  const body = (
    <div className="space-y-4" data-testid="spoken-answer">
      <p className="text-sm text-muted-foreground">
        Answer out loud. You have up to {formatSpokenSeconds(cfg.max_seconds)}
        {cfg.prep_seconds > 0 ? `, with ${cfg.prep_seconds} seconds to prepare first` : ''}. {cfg.max_attempts === 1
          ? 'You can record once.'
          : `You can record up to ${cfg.max_attempts} times; the answer you save is the one reviewed.`}
      </p>

      {recorderProblem && phase === 'idle' && (
        <MediaProblemAlert problem={recorderProblem} kind="audio" onRetry={() => void beginRecording()} />
      )}

      {saved && phase === 'idle' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Answer saved ({formatSpokenSeconds(saved.file.duration_seconds)}, attempt {saved.attempt} of {cfg.max_attempts}).
        </div>
      )}

      {phase === 'prep' && prepLeft > 0 && (
        <div className="space-y-3 rounded-lg border p-4 text-center" role="status">
          <p className="text-sm text-muted-foreground">Get ready. Recording starts in</p>
          <p className="font-mono text-3xl font-semibold">{prepLeft}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setPrepLeft(0)}>
            Start now
          </Button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="space-y-3 rounded-lg border border-red-300 p-4 dark:border-red-800">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-red-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              Recording
            </span>
            <span className="font-mono" aria-live="polite">
              {formatSpokenSeconds(elapsed)} / {formatSpokenSeconds(cfg.max_seconds)}
              <span className="ml-2 text-muted-foreground">
                ({formatSpokenSeconds(Math.max(0, cfg.max_seconds - elapsed))} left)
              </span>
            </span>
          </div>
          <Progress value={(elapsed / cfg.max_seconds) * 100} aria-label="Time used" />
          <div className="h-2 overflow-hidden rounded bg-muted" aria-hidden="true">
            <div className="h-full bg-green-500 transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <Button type="button" variant="destructive" onClick={() => void stopRecording()}>
            <Square className="mr-2 h-4 w-4" />
            Stop recording
          </Button>
        </div>
      )}

      {(phase === 'review' || phase === 'saving' || phase === 'error') && take && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Your recording ({formatSpokenSeconds(take.durationSeconds)}). Listen back before saving.
          </p>
          <audio controls src={take.url} className="w-full" aria-label="Your recording" />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveTake()} disabled={phase === 'saving'}>
              {phase === 'saving' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : phase === 'error' ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {phase === 'saving' ? 'Saving…' : phase === 'error' ? 'Try again' : 'Save answer'}
            </Button>
            {attemptsLeft > 0 && phase !== 'saving' && (
              <Button type="button" variant="outline" onClick={startTake}>
                <Mic className="mr-2 h-4 w-4" />
                Record again ({attemptsLeft} left)
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === 'idle' && (
        attemptsLeft > 0 ? (
          <Button type="button" onClick={startTake}>
            <Mic className="mr-2 h-4 w-4" />
            {saved ? `Record again (${attemptsLeft} left)` : 'Start recording'}
          </Button>
        ) : (
          !saved && (
            <p className="text-sm text-muted-foreground">No attempts are left for this question.</p>
          )
        )
      )}
    </div>
  );

  // The exam has already granted the microphone; otherwise check it here.
  if (audioSource) return body;
  return (
    <MediaPermissionGate kind="audio" onBlocked={(problem) => problem === 'denied' && logOnce('mic_denied')}>
      {body}
    </MediaPermissionGate>
  );
}
