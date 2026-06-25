import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDevGeminiKeyBody } from '@/lib/devGemini';

export interface PipelineScore {
  overall_score: number;
  speed_score: number;
  health_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  grade_label: string;
  insights: string[];
  risks: string[];
  recommendation: string;
  generated_at: string;
}

function parseCacheRow(row: Record<string, unknown>): PipelineScore {
  const result = row.result as Record<string, unknown>;
  return {
    overall_score: result.overall_score as number,
    speed_score: result.speed_score as number,
    health_score: result.health_score as number,
    grade: result.grade as PipelineScore['grade'],
    grade_label: result.grade_label as string,
    insights: (result.insights as string[]) || [],
    risks: (result.risks as string[]) || [],
    recommendation: result.recommendation as string,
    generated_at: row.generated_at as string,
  };
}

export function usePipelineAnalysis(jobId?: string | null) {
  return useQuery({
    queryKey: ['pipeline-analysis', jobId],
    enabled: !!jobId,
    staleTime: 60_000,
    queryFn: async (): Promise<PipelineScore | null> => {
      const { data, error } = await supabase
        .from('pipeline_analysis_cache' as 'profiles')
        .select('result, generated_at')
        .eq('job_id', jobId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return parseCacheRow(data as Record<string, unknown>);
    },
  });
}

export function useAnalysePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      job: {
        id: string;
        title: string;
        total_openings?: number | null;
        application_deadline?: string | null;
        status: string;
      };
      metrics: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.functions.invoke('score-pipeline', {
        body: { ...params, ...getDevGeminiKeyBody() },
      });
      if (error) {
        let description = 'Edge function error';
        try {
          const body = await (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context?.json?.();
          description = body?.error || body?.message || String(error);
        } catch {
          description = String(error);
        }
        throw new Error(description);
      }
      if (data?.error) throw new Error(data.error as string);

      const generatedAt = (data.generated_at as string) || new Date().toISOString();
      return { ...(data.result as Omit<PipelineScore, 'generated_at'>), generated_at: generatedAt };
    },
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-analysis', vars.job.id] });
    },
  });
}
