import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useExpiredRecordingCount } from '@/hooks/useAssessmentMedia';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { MEDIA_CONSENT_CONFIG_KEY, consentClaimsAutomaticDeletion, readMediaConsentConfig } from '@/lib/mediaConsent';
import {
  RECORDING_RETENTION_CONFIG_KEY,
  parseRecordingRetentionSetting,
  type RecordingRetentionSetting,
} from '../../../supabase/functions/_shared/recordingRetention.ts';

/**
 * Settings → Assessments → Recording consent: the admin switch for deleting
 * assessment recordings after 90 days (system_config.assessment_recording_retention,
 * admin-only by RLS). cleanup-recordings deletes nothing while it is off.
 * Changes are written to audit_log by a database trigger.
 */
export function RecordingRetentionSettings() {
  const { user } = useAuth();
  const retention = useSystemConfig(RECORDING_RETENTION_CONFIG_KEY);
  const consent = useSystemConfig(MEDIA_CONSENT_CONFIG_KEY);
  const setting = useMemo(() => parseRecordingRetentionSetting(retention.configValue), [retention.configValue]);
  const consentText = useMemo(() => readMediaConsentConfig(consent.configValue).fields.consent_text, [consent.configValue]);
  const [pending, setPending] = useState<'on' | 'off' | null>(null);
  const expired = useExpiredRecordingCount(pending === 'on');

  const confirm = async () => {
    const now = new Date().toISOString();
    const next: RecordingRetentionSetting = pending === 'on'
      ? { enabled: true, enabled_at: now, enabled_by: user?.id ?? null, updated_at: now }
      : { ...setting, enabled: false, updated_at: now };
    setPending(null);
    await retention.updateAsync(next).catch(() => undefined);
  };

  if (retention.isLoading || consent.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recording retention...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Recording retention</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Webcam and spoken-answer files are removed 90 days after the attempt is completed (or started, if it was
          never completed). Hired candidates are kept. The database row stays, marked Deleted. Scores and stages are
          not changed. Automatic deletion only runs once the daily cleanup job is enabled (after this version of the
          cleanup function is deployed); turning this on does not delete anything immediately.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="recording-retention"
          checked={setting.enabled}
          disabled={retention.isUpdating}
          onCheckedChange={(checked) => setPending(checked ? 'on' : 'off')}
        />
        <Label htmlFor="recording-retention">Delete assessment recordings after 90 days</Label>
      </div>
      {setting.enabled_at && (
        <p className="text-xs text-muted-foreground">
          Last turned on {format(new Date(setting.enabled_at), 'MMM d, yyyy HH:mm')}
          {!setting.enabled && ' (currently off)'}
        </p>
      )}

      {!setting.enabled && consentClaimsAutomaticDeletion(consentText) && (
        <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The consent text below tells candidates that recordings are deleted automatically 90 days after the
            assessment, but automatic deletion is off. Turn it on, or update the wording.
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === 'on' ? 'Turn on automatic deletion?' : 'Turn off automatic deletion?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {pending === 'on' ? (
                <div className="space-y-2">
                  <p>
                    Recordings that are already older than 90 days will be deleted on the next cleanup run, except
                    those of hired candidates. Deleted files cannot be recovered.
                  </p>
                  <p data-testid="expired-recording-count">
                    {expired.isLoading
                      ? 'Counting expired recordings…'
                      : expired.data !== undefined
                        ? `${expired.data} recording${expired.data === 1 ? '' : 's'} would be deleted now.`
                        : 'The number of expired recordings could not be loaded.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Automatic deletion stops. Recordings that were already deleted stay deleted.</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>
              {pending === 'on' ? 'Turn on' : 'Turn off'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
