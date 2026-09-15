import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ScorecardCriterion, ScorecardTemplate } from '@/lib/scorecardTemplates';

const STAGE_ORDER = ['screening', 'technical', 'managerial', 'hr_final', 'general'];

export type ScorecardTemplateRow = ScorecardTemplate & {
  created_at: string;
  updated_at: string;
};

function parseTemplate(row: Record<string, unknown>): ScorecardTemplateRow {
  return {
    id: row.id as string,
    stage_key: row.stage_key as string,
    display_name: row.display_name as string,
    criteria: (row.criteria as ScorecardCriterion[]) || [],
    prompt_questions: (row.prompt_questions as string[]) || [],
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function sortTemplates(templates: ScorecardTemplateRow[]): ScorecardTemplateRow[] {
  return [...templates].sort((a, b) => {
    const ai = STAGE_ORDER.indexOf(a.stage_key);
    const bi = STAGE_ORDER.indexOf(b.stage_key);
    const aOrder = ai === -1 ? STAGE_ORDER.length : ai;
    const bOrder = bi === -1 ? STAGE_ORDER.length : bi;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.stage_key.localeCompare(b.stage_key);
  });
}

export function useScorecardTemplatesList() {
  return useQuery({
    queryKey: ['scorecard-templates'],
    queryFn: async (): Promise<ScorecardTemplateRow[]> => {
      const { data, error } = await supabase
        .from('scorecard_templates')
        .select('id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at')
        .order('stage_key');
      if (error) throw error;
      return sortTemplates((data || []).map(row => parseTemplate(row as Record<string, unknown>)));
    },
    staleTime: 60_000,
  });
}

export type ScorecardTemplateUpdate = {
  id: string;
  stage_key: string;
  display_name: string;
  criteria: ScorecardCriterion[];
  is_active: boolean;
};

export function useUpdateScorecardTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, display_name, criteria, is_active }: ScorecardTemplateUpdate) => {
      const { data, error } = await supabase
        .from('scorecard_templates')
        .update({ display_name, criteria, is_active })
        .eq('id', id)
        .select('id, stage_key, display_name, criteria, prompt_questions, is_active, created_at, updated_at')
        .single();
      if (error) throw error;
      return parseTemplate(data as Record<string, unknown>);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['scorecard-templates'] });
      qc.invalidateQueries({ queryKey: ['scorecard-template', data.stage_key] });
    },
  });
}
