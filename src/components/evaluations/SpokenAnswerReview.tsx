import { useState } from 'react';
import { Loader2, Play, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isDeletedRecordingError, MediaError, useSpokenAnswerPlayback } from '@/hooks/useAssessmentMedia';
import { formatSpokenSeconds, parseSpokenAnswerResponse } from '@/lib/spokenAnswer';

const TRANSCRIPT_ERROR_TEXT: Record<string, string> = {
  storage_not_configured: 'recording storage is not configured',
  recording_not_found: 'the recording was not found',
  audio_too_large: 'the recording is too large for AI transcription',
  download_failed: 'the recording could not be downloaded',
  ai_failed: 'the AI service did not respond',
  unreadable_ai_response: 'the AI reply could not be read',
};

/** Spoken answer for reviewers: the recording (loaded on demand, access checked server-side) and the AI transcript. */
export function SpokenAnswerReview({
  candidateAssessmentId,
  questionId,
  responseData,
}: {
  candidateAssessmentId: string;
  questionId: string;
  responseData: unknown;
}) {
  const answer = parseSpokenAnswerResponse(responseData);
  const [requested, setRequested] = useState(false);
  const playback = useSpokenAnswerPlayback(
    { candidateAssessmentId, questionId, attempt: answer?.attempt },
    requested && !!answer,
  );

  if (!answer) return <p className="text-muted-foreground">No recording submitted</p>;

  const url = playback.data?.urls[0]?.url;
  const playbackError = playback.error instanceof MediaError && playback.error.code === 'storage_not_configured'
    ? 'Recording storage is not configured, so this recording cannot be played.'
    : playback.error instanceof Error
      ? playback.error.message
      : 'Could not load the recording';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Spoken answer · {formatSpokenSeconds(answer.file.duration_seconds)} · attempt {answer.attempt}
        </p>
        {!requested ? (
          <Button variant="outline" size="sm" onClick={() => setRequested(true)}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Load recording
          </Button>
        ) : playback.isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recording…
          </p>
        ) : isDeletedRecordingError(playback.error) ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className="bg-muted text-muted-foreground">Deleted</Badge>
            <p className="text-sm text-muted-foreground">This recording was deleted under the retention policy.</p>
          </div>
        ) : playback.isError ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-destructive">{playbackError}</p>
            <Button variant="ghost" size="sm" onClick={() => void playback.refetch()}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </div>
        ) : url ? (
          <audio controls preload="metadata" src={url} className="w-full" aria-label="Candidate's spoken answer" />
        ) : (
          <p className="text-sm text-muted-foreground">No recording was found for this answer.</p>
        )}
      </div>
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">Transcript (AI-generated)</Label>
        {answer.transcript_status === 'done' ? (
          <div className="bg-muted p-4 rounded-lg">
            <p className="whitespace-pre-wrap">{answer.transcript || '(No speech detected)'}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {answer.transcript_status === 'failed'
              ? `Transcription failed${answer.transcript_error && TRANSCRIPT_ERROR_TEXT[answer.transcript_error]
                ? `: ${TRANSCRIPT_ERROR_TEXT[answer.transcript_error]}`
                : ''}. Listen to the recording, or run AI grading again.`
              : 'Transcription pending.'}
          </p>
        )}
      </div>
    </div>
  );
}
