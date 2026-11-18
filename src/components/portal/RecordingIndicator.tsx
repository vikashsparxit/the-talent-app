import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, CloudOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isCompactDevice } from '@/hooks/useMediaRecorder';
import type { WebcamRecordingPhase } from '@/hooks/useWebcamRecording';
import { cn } from '@/lib/utils';

const PHASE_TEXT: Record<WebcamRecordingPhase, string> = {
  idle: 'Recording starting',
  connecting: 'Connecting recording…',
  recording: 'Recording',
  paused: 'Recording paused',
  finished: 'Recording finished',
  unavailable: 'Recording unavailable',
};

/** Small floating "Recording" badge with the camera preview; the preview starts collapsed on phones. */
export function RecordingIndicator({
  stream,
  phase,
  pending,
}: {
  stream: MediaStream | null;
  phase: WebcamRecordingPhase;
  /** Segments waiting to upload. */
  pending: number;
}) {
  const [open, setOpen] = useState(() => !isCompactDevice());
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, open]);

  const live = phase === 'recording';
  return (
    <div
      className="fixed bottom-3 right-3 z-40 rounded-lg border bg-card/95 p-2 shadow-md backdrop-blur"
      data-testid="recording-indicator"
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', live ? 'animate-pulse bg-red-600' : 'bg-muted-foreground')}
          aria-hidden="true"
        />
        <span className={cn('font-medium', live && 'text-red-600')} role="status" aria-live="polite">
          {PHASE_TEXT[phase]}
        </span>
        {phase === 'connecting' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
        {pending > 1 && (
          <span className="flex items-center gap-1 text-muted-foreground" title="Recording segments waiting to upload">
            <CloudOff className="h-3 w-3" aria-hidden="true" />
            {pending} waiting
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Hide camera preview' : 'Show camera preview'}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open && stream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Your camera preview"
          className="mt-2 h-20 w-28 rounded-md bg-black object-cover sm:h-24 sm:w-32"
        />
      )}
    </div>
  );
}
