import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SearchIntent } from '@/lib/searchIntent';
import {
  enrichSearchIntent,
  isAnalyticsQuestionQuery,
  isNaturalLanguageQuery,
  parseSearchIntentHeuristic,
} from '@/lib/searchIntent';

export function useParseSearchIntent(query: string, enabled: boolean) {
  const trimmed = query.trim();
  const shouldParse =
    enabled && isNaturalLanguageQuery(trimmed) && !isAnalyticsQuestionQuery(trimmed);
  const heuristic = parseSearchIntentHeuristic(trimmed);

  return useQuery({
    queryKey: ['parse-search-intent', trimmed],
    enabled: shouldParse,
    staleTime: 60_000,
    retry: 1,
    placeholderData: heuristic.name || heuristic.role ? heuristic : undefined,
    queryFn: async (): Promise<SearchIntent> => {
      try {
        const { data, error } = await supabase.functions.invoke('parse-search-intent', {
          body: { query: trimmed },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));
        return enrichSearchIntent(data as SearchIntent, trimmed);
      } catch {
        return heuristic;
      }
    },
  });
}
