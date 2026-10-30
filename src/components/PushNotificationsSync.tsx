import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { PUSH_STATUS_QUERY_KEY } from '@/hooks/usePushNotifications';
import { isPushNavigateMessage, setAppBadge, syncPushSubscription } from '@/lib/webPush';

/**
 * Keeps this device's push state in step with the signed-in staff user:
 * re-subscribes on start when permission is already granted, mirrors the
 * unread count on the app icon badge, and routes taps on push notifications
 * that the service worker forwards to an open window.
 */
export function PushNotificationsSync() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadCount, markRead, isLoading } = useNotifications();
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void syncPushSubscription().then(() => queryClient.invalidateQueries({ queryKey: PUSH_STATUS_QUERY_KEY }));
  }, [userId, queryClient]);

  useEffect(() => {
    if (!isLoading) setAppBadge(unreadCount);
  }, [unreadCount, isLoading]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (!isPushNavigateMessage(event.data)) return;
      if (event.data.id) void markReadRef.current(event.data.id);
      navigate(event.data.link);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}
