import { useCallback, useEffect, useRef, useState } from 'react';
import { pickRecorderMime, type RecorderKind } from '@/lib/mediaMime';
import { classifyMediaError, mediaEnvironmentProblem, type MediaProblem } from '@/hooks/useMediaPermissions';

/** Phones and narrow screens: touch-first pointer or under 640px wide. */
export function isCompactDevice(win: Pick<Window, 'matchMedia' | 'innerWidth'> = window): boolean {
  return win.matchMedia?.('(pointer: coarse)').matches === true || win.innerWidth < 640;
}

/** Low webcam profile: reviewers need to see the candidate, not fine detail. */
export function webcamVideoConstraints(compact: boolean = isCompactDevice()): MediaTrackConstraints {
  return compact
    ? { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 } }
    : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } };
}

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped' | 'error';
export type InterruptReason = 'track_ended' | 'recorder_error';

/** When a chunk was recorded (browser clock, ms since epoch). */
export interface ChunkTiming {
  startedAt: number;
  endedAt: number;
}

export interface UseMediaRecorderOptions {
  kind: RecorderKind;
  /** Emit a chunk every N ms. Only the first chunk carries the file header, so chunks play only when joined. */
  timesliceMs?: number;
  /**
   * Start a fresh recorder every N ms instead, so every chunk is a complete,
   * separately playable file (webcam: a lost chunk never spoils the others,
   * and reviewers can jump straight to a segment). Overrides timesliceMs.
   */
  segmentMs?: number;
  /** First sequence number, e.g. the server's next_seq when resuming. */
  startSeq?: number;
  /**
   * Record from this already-granted stream instead of opening the devices.
   * Its tracks are cloned (audio only for kind 'audio'), so stopping the
   * recorder never stops the caller's stream, and the devices are not opened twice.
   */
  stream?: MediaStream | null;
  onChunk: (blob: Blob, seq: number, timing: ChunkTiming) => void;
  /** The camera/mic went away (unplugged, permission revoked, OS took it) or the recorder failed. */
  onInterrupted?: (reason: InterruptReason) => void;
  /** Sample the microphone level (0..1) for a meter. */
  meter?: boolean;
}

/**
 * getUserMedia + MediaRecorder for assessment media: webcam video with audio,
 * or audio only for spoken answers. Chunks are numbered from startSeq (or the
 * startSeq passed to start) and handed to onChunk; uploading them is the caller's job.
 */
export function useMediaRecorder(options: UseMediaRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [problem, setProblem] = useState<MediaProblem | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const optsRef = useRef(options);
  optsRef.current = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef(0);
  const stoppingRef = useRef(false);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Resolves once the last recorder has emitted its final chunk. */
  const stoppedRef = useRef<Promise<void>>(Promise.resolve());

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current !== null) clearInterval(segmentTimerRef.current);
    segmentTimerRef.current = null;
  }, []);

  /** Stops a recorder; the returned promise resolves after its last chunk. */
  const stopRecorder = useCallback((recorder: MediaRecorder | null): Promise<void> => {
    if (!recorder || recorder.state === 'inactive') return stoppedRef.current;
    const done = new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });
    recorder.stop();
    stoppedRef.current = done;
    return done;
  }, []);

  const releaseStream = useCallback(() => {
    meterCleanupRef.current?.();
    meterCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const startMeter = useCallback((media: MediaStream) => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || media.getAudioTracks().length === 0) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(media).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    meterCleanupRef.current = () => {
      cancelAnimationFrame(frame);
      void ctx.close();
      setLevel(0);
    };
  }, []);

  const start = useCallback(async (overrides: { startSeq?: number } = {}): Promise<boolean> => {
    const { kind, timesliceMs, segmentMs, meter, stream: source } = optsRef.current;
    const startSeq = overrides.startSeq ?? optsRef.current.startSeq ?? 0;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return true;

    const env = mediaEnvironmentProblem();
    const picked = env ? null : pickRecorderMime(kind);
    if (env || !picked) {
      setProblem(env ?? 'unsupported');
      setStatus('error');
      return false;
    }

    setStatus('starting');
    setProblem(null);
    let media: MediaStream;
    if (source) {
      const live = source.getTracks().filter((t) => t.readyState !== 'ended' && (kind === 'video' || t.kind === 'audio'));
      if (live.length === 0 || (kind === 'video' && !live.some((t) => t.kind === 'video'))) {
        setProblem('stopped');
        setStatus('error');
        return false;
      }
      media = new MediaStream(live.map((t) => t.clone()));
    } else {
      try {
        media = await navigator.mediaDevices.getUserMedia(
          kind === 'video' ? { video: webcamVideoConstraints(), audio: true } : { audio: true },
        );
      } catch (error) {
        setProblem(classifyMediaError(error));
        setStatus('error');
        return false;
      }
    }
    streamRef.current = media;
    setStream(media);

    const compact = isCompactDevice();
    const createRecorder = () =>
      new MediaRecorder(media, {
        mimeType: picked,
        ...(kind === 'video' ? { videoBitsPerSecond: compact ? 150_000 : 250_000 } : {}),
        audioBitsPerSecond: 64_000,
      });

    // Chunks get their seq when emitted, so empty blobs leave no gaps and
    // segments stay in order (a recorder only emits after the previous one stopped).
    const attach = (recorder: MediaRecorder) => {
      let from = Date.now();
      recorder.ondataavailable = (event: BlobEvent) => {
        const endedAt = Date.now();
        if (event.data && event.data.size > 0) {
          optsRef.current.onChunk(event.data, seqRef.current++, { startedAt: from, endedAt });
        }
        from = endedAt;
      };
      recorder.onerror = () => {
        if (stoppingRef.current || recorderRef.current !== recorder) return;
        clearSegmentTimer();
        optsRef.current.onInterrupted?.('recorder_error');
        setStatus('error');
      };
    };

    let recorder: MediaRecorder;
    try {
      recorder = createRecorder();
    } catch {
      // Some browsers report a type as supported but refuse these options.
      releaseStream();
      setProblem('unsupported');
      setStatus('error');
      return false;
    }
    recorderRef.current = recorder;
    seqRef.current = startSeq;
    stoppingRef.current = false;
    attach(recorder);

    const onTrackEnded = () => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      clearSegmentTimer();
      void stopRecorder(recorderRef.current);
      releaseStream();
      setStatus('stopped');
      optsRef.current.onInterrupted?.('track_ended');
    };
    media.getTracks().forEach((t) => t.addEventListener('ended', onTrackEnded));

    if (meter) startMeter(media);
    if (segmentMs) {
      recorder.start();
      segmentTimerRef.current = setInterval(() => {
        const current = recorderRef.current;
        if (stoppingRef.current || !current || current.state !== 'recording') return;
        let next: MediaRecorder;
        try {
          next = createRecorder();
        } catch {
          return; // keep the current segment running rather than stop recording
        }
        attach(next);
        next.start();
        recorderRef.current = next;
        void stopRecorder(current);
      }, segmentMs);
    } else {
      recorder.start(timesliceMs);
    }
    setMime(recorder.mimeType || picked);
    setStatus('recording');
    return true;
  }, [releaseStream, startMeter, clearSegmentTimer, stopRecorder]);

  /** Stops recording; resolves after the final chunk has been emitted. */
  const stop = useCallback(async () => {
    stoppingRef.current = true;
    clearSegmentTimer();
    await stopRecorder(recorderRef.current);
    releaseStream();
    setStatus('stopped');
  }, [releaseStream, clearSegmentTimer, stopRecorder]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setStatus('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setStatus('recording');
    }
  }, []);

  useEffect(
    () => () => {
      stoppingRef.current = true;
      clearSegmentTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      releaseStream();
    },
    [releaseStream, clearSegmentTimer],
  );

  return { status, problem, mime, level, start, stop, pause, resume, stream };
}
