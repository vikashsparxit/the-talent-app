import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function stableIdKey(ids: string[]): string {
  return ids.length ? [...ids].sort().join(',') : '';
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function useAllCandidateTags(enabled = true) {
  return useQuery({
    queryKey: ['candidate-tags-all'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_tags')
        .select('tag')
        .order('tag');
      if (error) throw error;
      const unique = [...new Set((data || []).map((r) => r.tag))].sort();
      return unique;
    },
  });
}

export function usePageCandidateTags(candidateIds: string[]) {
  const idKey = stableIdKey(candidateIds);
  return useQuery({
    queryKey: ['candidate-tags-page', idKey],
    enabled: candidateIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_tags')
        .select('id, candidate_id, tag')
        .in('candidate_id', candidateIds)
        .order('tag');
      if (error) throw error;
      const map = new Map<string, string[]>();
      (data || []).forEach((row) => {
        const list = map.get(row.candidate_id) || [];
        list.push(row.tag);
        map.set(row.candidate_id, list);
      });
      return map;
    },
  });
}

export function useCandidateTagMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['candidate-tags-all'] });
    queryClient.invalidateQueries({ queryKey: ['candidate-tags-page'] });
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
  };

  const addTag = useMutation({
    mutationFn: async ({ candidateId, tag }: { candidateId: string; tag: string }) => {
      const normalized = normalizeTag(tag);
      if (!normalized) throw new Error('Tag cannot be empty');
      const { error } = await supabase
        .from('candidate_tags')
        .insert({ candidate_id: candidateId, tag: normalized });
      if (error) throw error;
      return normalized;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Tag added' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add tag', description: error.message });
    },
  });

  const removeTag = useMutation({
    mutationFn: async ({ candidateId, tag }: { candidateId: string; tag: string }) => {
      const { error } = await supabase
        .from('candidate_tags')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('tag', tag);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Tag removed' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to remove tag', description: error.message });
    },
  });

  return { addTag, removeTag };
}

export async function fetchCandidateIdsForTag(tag: string): Promise<string[]> {
  const normalized = normalizeTag(tag);
  if (!normalized) return [];
  const { data, error } = await supabase
    .from('candidate_tags')
    .select('candidate_id')
    .eq('tag', normalized);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.candidate_id))];
}
