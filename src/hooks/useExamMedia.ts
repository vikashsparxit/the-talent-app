import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  hasCurrentConsent,
  useMediaConsentStatus,
  useRecordMediaConsent,
  type MediaAttemptAuth,
} from '@/hooks/useAssessmentMedia';
import { useMediaPermissions } from '@/hooks/useMediaPermissions';
import { webcamVideoConstraints } from '@/hooks/useMediaRecorder';
import type { MediaIntegrityEventType } from '@/types/database';

/**
 * Consent and camera + microphone for the whole online assessment. Recording
 * is always on: answering waits until consent to the current text (the
 * version the server computes from the admin's settings) is on file and both devices are granted. The granted stream is
 * kept here and handed to the webcam recorder and spoken answers, so the
 * devices are opened once.
 */
export function useExamMedia({
  auth,
  started,
  onSignal,
}: {
  auth: MediaAttemptAuth;
  /** Whether the attempt is running; camera problems are only logged then. */
  started: boolean;
  /** Integrity signals (camera_denied, camera_stopped). Signals only, never decisions. */
  onSignal: (type: MediaIntegrityEventType) => void;
}) {
  const consent = useMediaConsentStatus(auth);
  const recordConsent = useRecordMediaConsent(auth);
  const consented = hasCurrentConsent(consent.data);

  const constraints = useMemo(() => ({ video: webcamVideoConstraints(), audio: true }), []);
  const permissions = useMediaPermissions(constraints, { auto: false });
  const { state, request } = permissions;

  // Ask for the camera once consent is on file (not before: the consent screen explains why).
  useEffect(() => {
    if (consented && state.status === 'idle') void request();
  }, [consented, state.status, request]);

  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;
  const problem = state.status === 'blocked' ? state.problem : null;
  useEffect(() => {
    if (!started || !problem) return;
    if (problem === 'denied') onSignalRef.current('camera_denied');
    else if (problem === 'stopped') onSignalRef.current('camera_stopped');
  }, [started, problem]);

  const { mutateAsync } = recordConsent;
  const accept = useCallback(
    async (version: string) => {
      await mutateAsync(version);
    },
    [mutateAsync],
  );

  const stream = state.status === 'granted' ? state.stream : null;
  return {
    consent,
    consented,
    accept,
    accepting: recordConsent.isPending,
    acceptError: recordConsent.error,
    permissions,
    stream,
    ready: consented && !!stream,
  };
}

export type ExamMedia = ReturnType<typeof useExamMedia>;
