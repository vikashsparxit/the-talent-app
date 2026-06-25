import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  parseSocialDraftsHistory,
  parseSocialDraftsLatest,
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

function toggleDraftPosted(drafts: SocialTweetDraft[], draftIndex: number): SocialTweetDraft[] {
  return drafts.map((d, i) => (i === draftIndex ? { ...d, posted: !d.posted } : d));
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
