import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ASSIGNED_QUESTION_COUNT,
  PRESCREEN_CATEGORIES,
  type PrescreenCategory,
} from '@/lib/jobApplicationForm';

export interface PrescreenQuestionBankRow {
  id: string;
  question_key: string;
  question_text: string;
  category: PrescreenCategory;
  is_active: boolean;
  sort_hint: number;
  created_at: string;
}

export type PrescreenQuestionInsert = {
  question_key: string;
  question_text: string;
  category: PrescreenCategory;
  is_active?: boolean;
  sort_hint?: number;
};

export type PrescreenQuestionUpdate = Partial<Omit<PrescreenQuestionInsert, 'question_key'>> & { id: string };

export const PRESCREEN_CATEGORY_LABELS: Record<PrescreenCategory, string> = {
  about_you: 'About You',
  current_role: 'Current Role',
  achievements: 'Achievements',
  motivation: 'Motivation',
  career_goals: 'Career Goals',
  workplace: 'Workplace',
  judgment: 'Judgment',
  challenges: 'Challenges',
};

export { PRESCREEN_CATEGORIES, ASSIGNED_QUESTION_COUNT };

export function toQuestionKey(text: string): string {
  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
  return key || 'question';
}

export function uniqueQuestionKey(base: string, existingKeys: string[]): string {
  if (!existingKeys.includes(base)) return base;
  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function usePrescreenQuestions() {
  return useQuery<PrescreenQuestionBankRow[]>({
    queryKey: ['prescreen-question-bank-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescreen_question_bank')
        .select('*')
        .order('category')
        .order('sort_hint', { ascending: true });

      if (error) throw error;
      return (data || []) as PrescreenQuestionBankRow[];
    },
    staleTime: 60_000,
  });
}

export function useCreatePrescreenQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: PrescreenQuestionInsert) => {
      const { data, error } = await supabase
        .from('prescreen_question_bank')
        .insert({
          ...q,
          is_active: q.is_active ?? true,
          sort_hint: q.sort_hint ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prescreen-question-bank-admin'] });
      qc.invalidateQueries({ queryKey: ['prescreen-question-bank'] });
    },
  });
}

export function useUpdatePrescreenQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: PrescreenQuestionUpdate) => {
      const { data, error } = await supabase
        .from('prescreen_question_bank')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prescreen-question-bank-admin'] });
      qc.invalidateQueries({ queryKey: ['prescreen-question-bank'] });
    },
  });
}
