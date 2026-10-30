import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type JobPipelineStats = Record<string, { inPipeline: number; proceeded: number; pending: number }>;

function rowsToMap(
  rows: Array<{ job_id: string; in_pipeline: number; proceeded: number; pending: number }>,
): JobPipelineStats {
  const map: JobPipelineStats = {};
  for (const row of rows) {
    map[row.job_id] = {
      inPipeline: Number(row.in_pipeline),
      proceeded: Number(row.proceeded),
      pending: Number(row.pending),
    };
  }
  return map;
}

export function useReportsJobStats(enabled: boolean) {
  return useQuery({
    queryKey: ['reports-job-iv-stats'],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_reports_job_pipeline_stats');
      if (error) throw error;
      return rowsToMap(
        (data ?? []) as Array<{ job_id: string; in_pipeline: number; proceeded: number; pending: number }>,
      );
    },
  });
}
