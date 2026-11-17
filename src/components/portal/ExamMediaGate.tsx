import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MediaConsentScreen } from '@/components/portal/MediaConsentScreen';
import { MediaPermissionGate } from '@/components/portal/MediaPermissionGate';
import { MediaError } from '@/hooks/useAssessmentMedia';
import type { ExamMedia } from '@/hooks/useExamMedia';

/** Shows consent, then the camera/microphone blocker, then the children once both are in place. */
export function ExamMediaGate({
  media,
  children,
  showPreview = true,
}: {
  media: ExamMedia;
  children: ReactNode;
  showPreview?: boolean;
}) {
  const { consent } = media;

  if (consent.isLoading || (!media.consented && !consent.data && !consent.isError)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing camera and microphone…
      </p>
    );
  }

  if (consent.isError) {
    const unavailable = consent.error instanceof MediaError && consent.error.code === 'storage_not_configured';
    return (
      <Alert variant="destructive" role="alert" className="mx-auto max-w-xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{unavailable ? 'Recording is not available right now' : 'Could not prepare recording'}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            {unavailable
              ? 'This assessment is recorded and recording is not available at the moment. Please contact the hiring team.'
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

  if (!media.consented && consent.data) {
    const textChanged = media.acceptError instanceof MediaError && media.acceptError.code === 'consent_text_changed';
    return (
      <div className="space-y-3">
        <MediaConsentScreen
          key={consent.data.current.version}
          consent={consent.data.current}
          onAccept={(v) => void media.accept(v).catch(() => undefined)}
          isSubmitting={media.accepting || consent.isFetching}
        />
        {media.acceptError && (
          <p className="mx-auto max-w-xl text-sm text-destructive" role="alert">
            {textChanged
              ? 'The recording consent text has been updated. Please read it again and agree to continue.'
              : `Your consent could not be saved: ${media.acceptError.message}. Check your connection and try again.`}
          </p>
        )}
      </div>
    );
  }

  return (
    <MediaPermissionGate permissions={media.permissions} showPreview={showPreview}>
      {children}
    </MediaPermissionGate>
  );
}
