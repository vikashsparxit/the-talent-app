import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface NotificationActionButton {
  label: string;
  link: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  source: string;                              // 'system' | 'chitra' | 'user'
  action_buttons: NotificationActionButton[] | null;
}

// Strip internal refs (e.g. " — interview_ref:uuid") from display message
export function cleanMessage(message: string) {
  return message.replace(/\s*—\s*interview_ref:[a-f0-9-]+$/i, '');
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, link, is_read, created_at, source, action_buttons')
        .eq('user_id', user!.id)
        .in('source', ['chitra', 'user', 'system'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
  });

  // Realtime: only after initial fetch succeeds (avoids extra connections during gateway errors)
  useEffect(() => {
    if (!user || !query.isSuccess) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, query.isSuccess, queryClient]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  };

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, unreadCount, markRead, markAllRead, isLoading: query.isLoading, refetch: query.refetch };
}
