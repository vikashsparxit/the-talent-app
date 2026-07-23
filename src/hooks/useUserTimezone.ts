import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { BROWSER_TIMEZONE } from '@/lib/formatTz';

export function useUserTimezone(): string {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['user-timezone', user?.id],
    enabled: !!user?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as any)?.timezone as string | null;
    },
  });
  return data ?? BROWSER_TIMEZONE;
}
