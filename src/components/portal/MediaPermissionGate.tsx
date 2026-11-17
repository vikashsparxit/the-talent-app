import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Camera, Loader2, Mic, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  detectBrowserFamily,
  useMediaPermissions,
  type BrowserFamily,
  type MediaPermissionState,
  type MediaProblem,
} from '@/hooks/useMediaPermissions';
import { webcamVideoConstraints } from '@/hooks/useMediaRecorder';

export type MediaGateKind = 'video' | 'audio';

const VIDEO_PROBLEM_TEXT: Record<MediaProblem, { title: string; body: string }> = {
  denied: {
    title: 'Camera or microphone access is blocked',
    body: 'This assessment needs your camera and microphone. Allow access for this site, then try again.',
  },
  no_device: {
    title: 'No camera or microphone found',
    body: 'Connect a camera and microphone (or use a device that has them), then try again.',
  },
  in_use: {
    title: 'Camera or microphone is busy',
    body: 'Another app or browser tab is using your camera or microphone. Close it, then try again.',
  },
  insecure: {
    title: 'Secure connection required',
    body: 'Your browser only allows the camera on secure (https) pages. Open the assessment link exactly as it was sent to you.',
  },
  unsupported: {
    title: 'This browser cannot record',
    body: 'Use a current version of Chrome, Edge, Firefox or Safari to take this assessment.',
  },
  stopped: {
    title: 'Your camera or microphone stopped',
    body: 'The camera or microphone was turned off, unplugged or its permission was removed. The assessment needs both to continue. Turn them back on, then try again.',
  },
  unknown: {
    title: 'Could not start your camera or microphone',
    body: 'Check that your camera and microphone work, then try again.',
  },
};

const AUDIO_PROBLEM_TEXT: Record<MediaProblem, { title: string; body: string }> = {
  denied: {
    title: 'Microphone access is blocked',
    body: 'This question is answered out loud. Allow microphone access for this site, then try again.',
  },
  no_device: {
    title: 'No microphone found',
    body: 'Connect a microphone or headset (or use a device that has one), then try again.',
  },
  in_use: {
    title: 'Microphone is busy',
    body: 'Another app or browser tab is using your microphone. Close it, then try again.',
  },
  insecure: {
    title: 'Secure connection required',
    body: 'Your browser only allows the microphone on secure (https) pages. Open the assessment link exactly as it was sent to you.',
  },
  unsupported: {
    title: 'This browser cannot record audio',
    body: 'Use a current version of Chrome, Edge, Firefox or Safari to answer this question.',
  },
  stopped: {
    title: 'Your microphone stopped',
    body: 'The microphone was turned off, unplugged or its permission was removed. Turn it back on, then try again.',
  },
  unknown: {
    title: 'Could not start your microphone',
    body: 'Check that your microphone works, then try again.',
  },
};

const BROWSER_HELP: Record<BrowserFamily, string[]> = {
  chrome_edge: [
    'Click the camera icon or the site settings icon at the left of the address bar.',
    'Set Camera and Microphone to Allow, then click Try again.',
  ],
  safari_mac: [
    'In the menu bar, open Safari > Settings for This Website.',
    'Set Camera and Microphone to Allow, then click Try again.',
    'If it is still blocked, check System Settings > Privacy & Security > Camera and Microphone.',
  ],
  ios_safari: [
    'Tap the "aA" button in the address bar, then Website Settings.',
    'Set Camera and Microphone to Allow, then tap Try again.',
    'If there is no prompt, open Settings > Safari > Camera and Microphone and choose Ask or Allow.',
  ],
  android_chrome: [
    'Tap the settings icon at the left of the address bar, then Permissions.',
    'Allow Camera and Microphone, then tap Try again.',
    'If Chrome itself is blocked, open Android Settings > Apps > Chrome > Permissions.',
  ],
  firefox: [
    'Click the camera icon at the left of the address bar and remove the block.',
    'Reload the page or click Try again, then choose Allow.',
  ],
  other: ['Open your browser site settings, allow Camera and Microphone for this site, then try again.'],
};

/** Camera and Microphone, or just Microphone, in the browser steps. */
function helpSteps(browser: BrowserFamily, kind: MediaGateKind): string[] {
  if (kind === 'video') return BROWSER_HELP[browser];
  return BROWSER_HELP[browser].map((step) =>
    step
      .replace('Camera and Microphone', 'Microphone')
      .replace('camera icon or the site settings icon', 'site settings icon')
      .replace('the camera icon', 'the microphone icon'),
  );
}

/** The blocker shown when the camera or microphone cannot be used, with browser help and a retry. */
export function MediaProblemAlert({
  problem,
  kind = 'video',
  onRetry,
}: {
  problem: MediaProblem;
  kind?: MediaGateKind;
  onRetry: () => void;
}) {
  const browser = useMemo(
    () => detectBrowserFamily(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    [],
  );
  const text = (kind === 'audio' ? AUDIO_PROBLEM_TEXT : VIDEO_PROBLEM_TEXT)[problem];
  const showSteps = problem === 'denied' || problem === 'stopped' || problem === 'unknown';
  const Icon = kind === 'audio' ? Mic : Camera;
  return (
    <Alert variant="destructive" role="alert">
      <Icon className="h-4 w-4" />
      <AlertTitle>{text.title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{text.body}</p>
        {showSteps && (
          <ol className="list-decimal space-y-1 pl-5">
            {helpSteps(browser, kind).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {problem !== 'insecure' && problem !== 'unsupported' && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

function CameraPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Your camera preview"
      className="h-24 w-32 rounded-md border bg-black object-cover"
    />
  );
}

interface MediaPermissionGateProps {
  children: ReactNode;
  /** 'video' (default): camera and microphone with a preview. 'audio': microphone only. */
  kind?: MediaGateKind;
  /** Called each time access is blocked, e.g. to log a mic_denied signal. */
  onBlocked?: (problem: MediaProblem) => void;
  /**
   * Use a permission state owned by the caller (e.g. the exam, which records
   * from the granted stream) instead of requesting access here.
   */
  permissions?: { state: MediaPermissionState; request: () => void | Promise<void> };
  /** Show the small camera preview above the children (default true). */
  showPreview?: boolean;
}

/**
 * Blocks until camera and microphone (or just the microphone) are granted,
 * with browser-specific help and a retry. Shows a small live preview above the
 * children once the camera is granted; the audio-only check releases the
 * microphone again so the recorder can open it.
 */
export function MediaPermissionGate({
  children,
  kind = 'video',
  onBlocked,
  permissions,
  showPreview = true,
}: MediaPermissionGateProps) {
  const constraints = useMemo(
    () => (kind === 'audio' ? { audio: true } : { video: webcamVideoConstraints(), audio: true }),
    [kind],
  );
  const own = useMediaPermissions(constraints, { auto: !permissions, keepStream: kind !== 'audio' });
  const { state, request } = permissions ?? own;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;
  const blockedProblem = state.status === 'blocked' ? state.problem : null;
  useEffect(() => {
    if (blockedProblem) onBlockedRef.current?.(blockedProblem);
  }, [blockedProblem]);

  if (state.status === 'granted' && (kind === 'audio' || !showPreview)) return <>{children}</>;

  if (state.status === 'granted') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <CameraPreview stream={state.stream} />
          <span>Camera and microphone are on.</span>
        </div>
        {children}
      </div>
    );
  }

  if (state.status === 'blocked') {
    return <MediaProblemAlert problem={state.problem} kind={kind} onRetry={() => void request()} />;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {kind === 'audio' ? 'Waiting for microphone permission…' : 'Waiting for camera and microphone permission…'}
    </div>
  );
}
