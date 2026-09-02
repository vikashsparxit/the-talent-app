import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  parseSocialDraftsEnabled,
  parseSocialDraftsHistory,
  parseSocialDraftsLatest,
  SOCIAL_DRAFTS_ENABLED_KEY,
  type SocialDraftsHistory,
  type SocialDraftsLatest,
  type SocialTweetDraft,
} from '@/lib/socialDrafts';

async function fetchConfigValue(key: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('system_config')
    .select('config_value')
    .eq('config_key', key)
    .maybeSingle();
  if (error) throw error;
  return (data as { config_value?: unknown } | null)?.config_value ?? null;
}

async function updateConfigValue(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('system_config')
    .update({ config_value: value })
    .eq('config_key', key);
  if (error) throw error;
}

async function upsertConfigValue(key: string, value: unknown, description?: string): Promise<void> {
  const { data, error } = await supabase
    .from('system_config')
    .upsert(
      { config_key: key, config_value: value, ...(description ? { description } : {}) },
      { onConflict: 'config_key' },
    )
    .select('config_key')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Save failed — no row returned. Check admin permissions.');
}

function toggleDraftPosted(drafts: SocialTweetDraft[], draftIndex: number): SocialTweetDraft[] {
  return drafts.map((d, i) => (i === draftIndex ? { ...d, posted: !d.posted } : d));
}

export function useSocialDraftsEnabled(queryEnabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['system_config', SOCIAL_DRAFTS_ENABLED_KEY],
    enabled: queryEnabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<boolean> => {
      const raw = await fetchConfigValue(SOCIAL_DRAFTS_ENABLED_KEY);
      return parseSocialDraftsEnabled(raw);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      await upsertConfigValue(
        SOCIAL_DRAFTS_ENABLED_KEY,
        { enabled: nextEnabled },
        'When true, daily cron generates TTA OSS Twitter drafts; false skips auto (manual force still allowed)',
      );
    },
    onSuccess: async (_data, nextEnabled) => {
      await queryClient.invalidateQueries({ queryKey: ['system_config', SOCIAL_DRAFTS_ENABLED_KEY] });
      toast.success(
        nextEnabled
          ? 'Daily TTA Social Drafts enabled'
          : 'Daily auto-generation off — you can still Generate now',
      );
    },
    onError: (err: Error) => {
      toast.error('Failed to update: ' + err.message);
    },
  });

  return {
    enabled: query.data ?? true,
    isLoading: query.isLoading,
    setEnabled: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}

export function useGenerateSocialDrafts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('chitra-social-draft', {
        body: { force: true },
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }
      return data as { skipped?: boolean; reason?: string; drafts?: unknown[] };
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system_config', 'chitra_social_drafts_latest'] }),
        queryClient.invalidateQueries({ queryKey: ['system_config', 'chitra_social_drafts_history'] }),
      ]);
      if (data?.skipped) {
        toast.message('Generation skipped', { description: data.reason ?? 'Already ran today' });
      } else {
        toast.success('TTA Social Drafts generated');
      }
    },
    onError: (err: Error) => {
      toast.error('Generate failed: ' + err.message);
    },
  });
}

export function useSocialDraftsLatest(enabled = true) {
  return useQuery({
    queryKey: ['system_config', 'chitra_social_drafts_latest'],
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SocialDraftsLatest> => {
      const raw = await fetchConfigValue('chitra_social_drafts_latest');
      return parseSocialDraftsLatest(raw);
    },
  });
}

export function useSocialDraftsHistory(enabled = true) {
  return useQuery({
    queryKey: ['system_config', 'chitra_social_drafts_history'],
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SocialDraftsHistory> => {
      const raw = await fetchConfigValue('chitra_social_drafts_history');
      return parseSocialDraftsHistory(raw);
    },
  });
}

export function useToggleSocialDraftPosted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      generatedAt,
      draftIndex,
    }: {
      generatedAt: string | null;
      draftIndex: number;
    }) => {
      const [latestRaw, historyRaw] = await Promise.all([
        fetchConfigValue('chitra_social_drafts_latest'),
        fetchConfigValue('chitra_social_drafts_history'),
      ]);

      const latest = parseSocialDraftsLatest(latestRaw);
      const history = parseSocialDraftsHistory(historyRaw);

      if (generatedAt && latest.generatedAt === generatedAt) {
        const updatedLatest: SocialDraftsLatest = {
          ...latest,
          drafts: toggleDraftPosted(latest.drafts, draftIndex),
        };
        await updateConfigValue('chitra_social_drafts_latest', updatedLatest);
      }

      const entries = history.entries.map((entry) =>
        entry.generatedAt === generatedAt
          ? { ...entry, drafts: toggleDraftPosted(entry.drafts, draftIndex) }
          : entry,
      );
      await updateConfigValue('chitra_social_drafts_history', { entries });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system_config', 'chitra_social_drafts_latest'] }),
        queryClient.invalidateQueries({ queryKey: ['system_config', 'chitra_social_drafts_history'] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error('Failed to update posted state: ' + err.message);
    },
  });
}
