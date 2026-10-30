import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  currentPushEnvironment,
  disablePush,
  enablePush,
  fetchPushPublicKey,
  hasPushSubscription,
  normalizeNotificationPrefs,
  pushAvailability,
  type EnablePushResult,
} from '@/lib/webPush';
import type { NotificationPrefs } from '../../supabase/functions/_shared/pushPayload.ts';

export const PUSH_STATUS_QUERY_KEY = ['push-status'] as const;

/** Push state of this device, and actions to turn it on or off. */
export function usePushNotifications() {
  const queryClient = useQueryClient();
  const availability = useMemo(() => pushAvailability(currentPushEnvironment()), []);

  const status = useQuery({
    queryKey: PUSH_STATUS_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => ({
      configured: !!(await fetchPushPublicKey()),
      permission: availability === 'available' ? Notification.permission : ('default' as NotificationPermission),
      subscribed: await hasPushSubscription(),
    }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: PUSH_STATUS_QUERY_KEY });

  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: (result: EnablePushResult) => {
      if (result === 'enabled') toast.success('Push notifications are on for this device');
      else if (result === 'denied') toast.error('Notifications are blocked. Allow them for this site in your browser settings.');
      else toast.error('Could not turn on push notifications on this device');
    },
    onError: () => toast.error('Could not turn on push notifications on this device'),
    onSettled: refresh,
  });

  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => toast.success('Push notifications are off for this device'),
    onError: () => toast.error('Could not turn off push notifications'),
    onSettled: refresh,
  });

  return {
    availability,
    configured: status.data?.configured ?? false,
    permission: status.data?.permission ?? 'default',
    subscribed: status.data?.subscribed ?? false,
    isLoading: status.isLoading,
    enable,
    disable,
  };
}

/** The signed-in user's push preferences (account-wide, all devices). */
export function useNotificationPrefs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['notification-prefs', user?.id];

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('push_enabled, types, quiet_hours_start, quiet_hours_end')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return normalizeNotificationPrefs(data);
    },
  });

  // Switches save one at a time; the cache is updated first so a second toggle
  // made before the refetch builds on the first instead of overwriting it.
  const update = useMutation({
    onMutate: async (patch: Partial<NotificationPrefs>) => {
      await queryClient.cancelQueries({ queryKey });
      const next = { ...normalizeNotificationPrefs(queryClient.getQueryData<NotificationPrefs>(queryKey)), ...patch };
      queryClient.setQueryData(queryKey, next);
    },
    mutationFn: async (_patch: Partial<NotificationPrefs>) => {
      const next = normalizeNotificationPrefs(queryClient.getQueryData<NotificationPrefs>(queryKey));
      const { error } = await supabase.from('notification_prefs').upsert({
        user_id: user!.id,
        push_enabled: next.push_enabled,
        types: next.types,
        quiet_hours_start: next.quiet_hours_start,
        quiet_hours_end: next.quiet_hours_end,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onError: () => toast.error('Could not save notification settings'),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { prefs: normalizeNotificationPrefs(query.data), isLoading: query.isLoading, update };
}
