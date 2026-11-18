import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Play, RotateCcw, ShieldAlert, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MediaError,
  useRecordingPlaybackUrls,
  useWebcamRecordings,
  type WebcamRecordingSummary,
} from '@/hooks/useAssessmentMedia';
import { getIntegrityEventLabel } from '@/lib/integrity';
import { buildPlaylist, formatOffset, locateInPlaylist, DEFAULT_SEGMENT_SECONDS } from '@/lib/recordingPlaylist';
import { cn } from '@/lib/utils';
import type { IntegrityEvent } from '@/types/database';

const STATUS: Record<string, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-green-600 text-white border-green-600' },
  interrupted: { label: 'Interrupted', className: 'bg-amber-500 text-white border-amber-500' },
  failed: { label: 'Failed', className: 'bg-red-600 text-white border-red-600' },
  recording: { label: 'Not finished', className: 'bg-amber-500 text-white border-amber-500' },
  deleted: { label: 'Deleted', className: 'bg-muted text-muted-foreground' },
};

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function playbackErrorText(error: unknown): string {
  if (error instanceof MediaError && error.code === 'storage_not_configured') {
    return 'Recording storage is not configured, so this recording cannot be played.';
  }
  return error instanceof Error ? error.message : 'Could not load the recording';
}

function RecordingItem({
  recording,
  integrityEvents,
}: {
  recording: WebcamRecordingSummary;
  integrityEvents: IntegrityEvent[];
}) {
  const [requested, setRequested] = useState(false);
  const playback = useRecordingPlaybackUrls(recording.id, requested);
  const segments = useMemo(
    () => (playback.data ? buildPlaylist(playback.data.urls, playback.data.recording.started_at) : []),
    [playback.data],
  );
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const autoPlayRef = useRef(false);

  const status = STATUS[recording.status] ?? { label: recording.status, className: '' };
  const duration = recording.duration_seconds ?? recording.chunk_count * DEFAULT_SEGMENT_SECONDS;
  const deleted = recording.status === 'deleted' || !!recording.deleted_at;
  const current = segments[Math.min(index, segments.length - 1)];

  const jumpTo = (target: number, seekSeconds = 0) => {
    autoPlayRef.current = true;
    pendingSeekRef.current = seekSeconds;
    if (target === index && videoRef.current) {
      videoRef.current.currentTime = seekSeconds;
      pendingSeekRef.current = null;
      void videoRef.current.play().catch(() => undefined);
    }
    setIndex(target);
  };

  return (
    <div className="space-y-4" data-testid="recording-item">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Badge className={status.className}>{status.label}</Badge>
        <span>{formatOffset(duration)} long</span>
        <span>
          {recording.chunk_count} segment{recording.chunk_count !== 1 ? 's' : ''}
        </span>
        <span>{formatBytes(recording.bytes)}</span>
        <span>Started {format(new Date(recording.started_at), 'MMM d, yyyy HH:mm')}</span>
        {recording.retention_until && !deleted && (
          <span>Kept until {format(new Date(recording.retention_until), 'MMM d, yyyy')} (unless hired)</span>
        )}
      </div>
      {recording.status === 'recording' && (
        <p className="text-xs text-muted-foreground">
          The recording was not closed, for example because the browser was closed before submitting. What was
          uploaded can still be played.
        </p>
      )}

      {deleted ? (
        <p className="text-sm text-muted-foreground">
          This recording was deleted under the retention policy
          {recording.deleted_at ? ` on ${format(new Date(recording.deleted_at), 'MMM d, yyyy')}` : ''}.
        </p>
      ) : !requested ? (
        <Button variant="outline" size="sm" onClick={() => setRequested(true)} disabled={recording.chunk_count === 0}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {recording.chunk_count === 0 ? 'Nothing was uploaded' : 'Load recording'}
        </Button>
      ) : playback.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading recording…
        </p>
      ) : playback.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive" role="alert">
            {playbackErrorText(playback.error)}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void playback.refetch()}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : !current ? (
        <p className="text-sm text-muted-foreground">No segments were uploaded for this recording.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <video
              ref={videoRef}
              key={current.url}
              src={current.url}
              controls
              playsInline
              preload="metadata"
              autoPlay={autoPlayRef.current}
              aria-label="Assessment recording"
              className="aspect-video w-full rounded-md bg-black"
              onPlay={() => {
                autoPlayRef.current = true;
              }}
              onLoadedMetadata={(e) => {
                if (pendingSeekRef.current !== null) {
                  e.currentTarget.currentTime = pendingSeekRef.current;
                  pendingSeekRef.current = null;
                }
              }}
              onEnded={() => {
                if (index < segments.length - 1) setIndex(index + 1);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Segment {index + 1} of {segments.length} · starts at {formatOffset(current.offsetSeconds)}. Segments play
              one after another.
            </p>
          </div>

          <div className="space-y-4 text-sm">
            {integrityEvents.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium">Integrity events</p>
                <ul className="space-y-1">
                  {integrityEvents.map((event, i) => {
                    const at = locateInPlaylist(segments, event.timestamp);
                    return (
                      <li key={`${event.timestamp}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {getIntegrityEventLabel(event.type)}
                          {event.question_index != null ? ` · Q${event.question_index}` : ''}
                        </span>
                        {at ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto shrink-0 p-0"
                            onClick={() => jumpTo(at.index, at.seekSeconds)}
                            title={at.inGap ? 'Nothing was recorded at that moment; jumps to the next segment' : undefined}
                          >
                            {formatOffset(segments[at.index].offsetSeconds + at.seekSeconds)}
                            {at.inGap ? ' (gap)' : ''}
                          </Button>
                        ) : (
                          <span className="shrink-0 text-xs text-muted-foreground">not recorded</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <p className="font-medium">Segments</p>
              <ol className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {segments.map((s, i) => (
                  <li key={s.seq}>
                    <button
                      type="button"
                      onClick={() => jumpTo(i)}
                      className={cn(
                        'w-full rounded px-2 py-0.5 text-left font-mono text-xs hover:bg-muted',
                        i === index && 'bg-muted font-semibold',
                      )}
                      aria-current={i === index ? 'true' : undefined}
                    >
                      {formatOffset(s.offsetSeconds)}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The webcam recording of an attempt, for reviewers. Playback URLs come from
 * the assessment-media function, which re-checks the viewer server-side.
 */
export function RecordingReview({
  candidateAssessmentId,
  integrityEvents,
}: {
  candidateAssessmentId: string;
  /** In time order. */
  integrityEvents: IntegrityEvent[];
}) {
  const recordings = useWebcamRecordings(candidateAssessmentId);
  const list = recordings.data ?? [];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Recording
        </CardTitle>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Evidence for human review only. Nothing is scored, rejected or decided automatically from this recording,
          from camera or microphone problems, or from integrity events.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {recordings.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recording…
          </p>
        ) : recordings.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load recording details.
          </p>
        ) : list.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline">Not recorded</Badge>
            No webcam recording is available for this attempt.
          </div>
        ) : (
          list.map((r) => <RecordingItem key={r.id} recording={r} integrityEvents={integrityEvents} />)
        )}
      </CardContent>
    </Card>
  );
}
