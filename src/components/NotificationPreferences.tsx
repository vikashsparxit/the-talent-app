import { Loader2, Moon, Smartphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useNotificationPrefs, usePushNotifications } from '@/hooks/usePushNotifications';
import {
  PUSH_NOTIFICATION_TYPES,
  isPushTypeEnabled,
  type PushNotificationType,
} from '../../supabase/functions/_shared/pushPayload.ts';

const TYPE_ORDER = Object.keys(PUSH_NOTIFICATION_TYPES) as PushNotificationType[];
const DEFAULT_QUIET_START = '22:00';
const DEFAULT_QUIET_END = '07:00';

function DeviceStatus() {
  const { availability, configured, permission, subscribed, isLoading, enable, disable } = usePushNotifications();
  const busy = enable.isPending || disable.isPending;

  let note: string | null = null;
  if (!isLoading && !configured) note = 'Push notifications are not set up on this server.';
  else if (availability === 'needs-install')
    note = 'On iPhone and iPad, add the app to your Home Screen (Share → Add to Home Screen), open it from there, then turn this on.';
  else if (availability === 'unsupported') note = 'This browser does not support push notifications.';
  else if (permission === 'denied') note = 'Notifications are blocked for this site. Allow them in your browser settings, then try again.';

  const canToggle = !isLoading && configured && availability === 'available' && permission !== 'denied';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="push-device" className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
          Push on this device
        </Label>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            id="push-device"
            checked={subscribed}
            disabled={!canToggle}
            onCheckedChange={(on) => (on ? enable.mutate() : disable.mutate())}
          />
        )}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function NotificationPreferences() {
  const { prefs, isLoading, update } = useNotificationPrefs();
  const quietOn = !!(prefs.quiet_hours_start && prefs.quiet_hours_end);

  return (
    <div className="min-w-0 space-y-4">
      <DeviceStatus />
      <Separator />

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="push-all">Push notifications</Label>
              <p className="text-xs text-muted-foreground">Applies to all your devices.</p>
            </div>
            <Switch
              id="push-all"
              checked={prefs.push_enabled}
              onCheckedChange={(on) => update.mutate({ push_enabled: on })}
            />
          </div>

          <div className={prefs.push_enabled ? 'space-y-2.5' : 'space-y-2.5 opacity-50'}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notify me about</p>
            {TYPE_ORDER.map((type) => (
              <div key={type} className="flex items-center justify-between gap-3">
                <Label htmlFor={`push-type-${type}`} className="font-normal">
                  {PUSH_NOTIFICATION_TYPES[type].label}
                </Label>
                <Switch
                  id={`push-type-${type}`}
                  checked={isPushTypeEnabled(type, prefs)}
                  disabled={!prefs.push_enabled}
                  onCheckedChange={(on) => update.mutate({ types: { ...prefs.types, [type]: on } })}
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="push-quiet" className="flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                  Quiet hours
                </Label>
                <p className="text-xs text-muted-foreground">No push in this window, in your profile timezone.</p>
              </div>
              <Switch
                id="push-quiet"
                checked={quietOn}
                disabled={!prefs.push_enabled}
                onCheckedChange={(on) =>
                  update.mutate(
                    on
                      ? { quiet_hours_start: DEFAULT_QUIET_START, quiet_hours_end: DEFAULT_QUIET_END }
                      : { quiet_hours_start: null, quiet_hours_end: null },
                  )
                }
              />
            </div>
            {quietOn && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label="Quiet hours start"
                  value={prefs.quiet_hours_start ?? ''}
                  disabled={!prefs.push_enabled}
                  onChange={(e) => e.target.value && update.mutate({ quiet_hours_start: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label="Quiet hours end"
                  value={prefs.quiet_hours_end ?? ''}
                  disabled={!prefs.push_enabled}
                  onChange={(e) => e.target.value && update.mutate({ quiet_hours_end: e.target.value })}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
