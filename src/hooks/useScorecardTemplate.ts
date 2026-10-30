import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveStageKey,
  type ScorecardCriterion,
  type ScorecardTemplate,
  LEGACY_RATING_LABELS,
} from '@/lib/scorecardTemplates';

function parseTemplate(row: Record<string, unknown>): ScorecardTemplate {
  return {
    id: row.id as string,
    stage_key: row.stage_key as string,
    display_name: row.display_name as string,
    criteria: (row.criteria as ScorecardCriterion[]) || [],
    prompt_questions: (row.prompt_questions as string[]) || [],
    is_active: row.is_active as boolean,
  };
}

function fallbackTemplate(stageKey: string): ScorecardTemplate {
  return {
    id: 'fallback',
    stage_key: stageKey,
    display_name: 'Interview Scorecard',
    criteria: LEGACY_RATING_LABELS.map(({ key, label }) => ({
      key,
      label,
      scale_hint: '1=poor, 5=excellent',
    })),
    prompt_questions: [],
    is_active: true,
  };
}

export function useScorecardTemplate(stageName?: string | null) {
  const stageKey = resolveStageKey(stageName);

  return useQuery({
    queryKey: ['scorecard-template', stageKey],
    staleTime: 300_000,
    queryFn: async (): Promise<ScorecardTemplate> => {
      const { data, error } = await supabase
        .from('scorecard_templates')
        .select('id, stage_key, display_name, criteria, prompt_questions, is_active')
        .eq('stage_key', stageKey)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.warn('scorecard_templates query failed, using fallback:', error.message);
        return fallbackTemplate(stageKey);
      }
      if (!data) return fallbackTemplate(stageKey);
      return parseTemplate(data as Record<string, unknown>);
    },
  });
}
