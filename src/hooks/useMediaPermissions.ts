import { useCallback, useEffect, useRef, useState } from 'react';

/** 'stopped': access was granted, then the camera or microphone went away (unplugged, permission revoked). */
export type MediaProblem = 'denied' | 'no_device' | 'in_use' | 'insecure' | 'unsupported' | 'stopped' | 'unknown';

export type MediaPermissionState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'granted'; stream: MediaStream }
  | { status: 'blocked'; problem: MediaProblem };

/** Maps a getUserMedia rejection to what the candidate has to fix. */
export function classifyMediaError(error: unknown): MediaProblem {
  const name = (error as { name?: unknown } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_device';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in_use';
    default:
      return 'unknown';
  }
}

/** Camera and microphone need HTTPS (or localhost) and the mediaDevices API. */
export function mediaEnvironmentProblem(
  win: Pick<Window, 'isSecureContext'> & { navigator: Pick<Navigator, 'mediaDevices'> } = window,
): MediaProblem | null {
  if (!win.isSecureContext) return 'insecure';
  if (typeof win.navigator.mediaDevices?.getUserMedia !== 'function') return 'unsupported';
  return null;
}

export type BrowserFamily = 'ios_safari' | 'safari_mac' | 'android_chrome' | 'chrome_edge' | 'firefox' | 'other';

/** Which browser's permission instructions to show. */
export function detectBrowserFamily(userAgent: string, maxTouchPoints = 0): BrowserFamily {
  const ua = userAgent;
  // iPadOS reports a Mac user agent but has touch points.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios_safari';
  if (/Android/.test(ua)) return 'android_chrome';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return 'chrome_edge';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'safari_mac';
  return 'other';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Requests camera and/or microphone and keeps the granted stream (for a
 * preview) until reset or unmount; with keepStream false the device is
 * released as soon as access is granted. `request` can be called again to retry.
 * A kept stream whose track ends (device unplugged, permission revoked) is
 * released and reported as blocked with problem 'stopped'.
 */
export function useMediaPermissions(
  constraints: MediaStreamConstraints,
  { auto = true, keepStream = true }: { auto?: boolean; keepStream?: boolean } = {},
) {
  const [state, setState] = useState<MediaPermissionState>({ status: 'idle' });
  const streamRef = useRef<MediaStream | null>(null);
  const disposedRef = useRef(false);
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;
  const keepStreamRef = useRef(keepStream);
  keepStreamRef.current = keepStream;

  const request = useCallback(async () => {
    const env = mediaEnvironmentProblem();
    if (env) {
      setState({ status: 'blocked', problem: env });
      return;
    }
    setState({ status: 'checking' });
    stopStream(streamRef.current);
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraintsRef.current);
      if (disposedRef.current) {
        stopStream(stream);
        return;
      }
      if (!keepStreamRef.current) {
        stopStream(stream);
        setState({ status: 'granted', stream });
        return;
      }
      streamRef.current = stream;
      const onEnded = () => {
        if (streamRef.current !== stream || disposedRef.current) return;
        stopStream(stream);
        streamRef.current = null;
        setState({ status: 'blocked', problem: 'stopped' });
      };
      stream.getTracks().forEach((t) => t.addEventListener('ended', onEnded));
      setState({ status: 'granted', stream });
    } catch (error) {
      if (!disposedRef.current) setState({ status: 'blocked', problem: classifyMediaError(error) });
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    if (auto) void request();
    return () => {
      disposedRef.current = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [auto, request]);

  return { state, request };
}
