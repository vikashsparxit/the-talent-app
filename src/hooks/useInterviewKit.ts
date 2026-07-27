import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import type { InterviewKit } from '@/lib/scorecardTemplates';

function parseKit(row: Record<string, unknown>): InterviewKit {
  return {
    id: row.id as string,
    candidate_interview_id: row.candidate_interview_id as string,
    questions: (row.questions as string[]) || [],
    source: row.source as 'template' | 'gemini',
    scorecard_template_id: row.scorecard_template_id as string | null | undefined,
    generated_at: row.generated_at as string,
  };
}

export function useInterviewKit(interviewId?: string | null) {
  return useQuery({
    queryKey: ['interview-kit', interviewId],
    enabled: !!interviewId,
    staleTime: 60_000,
    queryFn: async (): Promise<InterviewKit | null> => {
      const { data, error } = await supabase
        .from('interview_kits' as 'profiles')
        .select('id, candidate_interview_id, questions, source, scorecard_template_id, generated_at')
        .eq('candidate_interview_id', interviewId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return parseKit(data as Record<string, unknown>);
    },
  });
}

export function useGenerateInterviewKit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      interview_id: string;
      candidate_name?: string;
      stage_name?: string;
      job_title?: string;
      force_gemini?: boolean;
      force_regenerate?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-interview-kit', {
        body: { ...params, ...getDevGeminiKeyBody() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.kit as InterviewKit;
    },
    onSuccess: (_kit, vars) => {
      queryClient.invalidateQueries({ queryKey: ['interview-kit', vars.interview_id] });
    },
  });
}
