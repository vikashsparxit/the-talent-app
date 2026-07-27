import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import type { TrackerRow, TrackerStage } from '@/hooks/useRecruitmentTracker';

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

function getOverallStatus(interviews: TrackerRow['interviews'], stagesList: TrackerStage[]) {
  const sorted = [...stagesList].sort((a, b) => b.order_index - a.order_index);
  for (const s of sorted) {
    const iv = interviews[s.stage_id];
    if (iv?.verdict) return iv.verdict;
  }
  return null;
}

/** Matches product hire signal: hired_at, or legacy shortlisted status. */
function isHiredTrackerRow(row: TrackerRow): boolean {
  return row.hired_at != null || row.candidate_status === 'shortlisted';
}

/** Same metrics payload Reports sends to `score-pipeline`. */
export function computePipelineMetrics(
  stages: TrackerStage[],
  rows: TrackerRow[],
  applicationDeadline?: string | null,
  jobCreatedAt?: string | null,
): Record<string, unknown> {
  const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);
  const today = new Date();

  let proceeded = 0;
  let rejected = 0;
  let hold = 0;
  let no_show = 0;
  let pendingFeedback = 0;
  rows.forEach((row) => {
    const status = getOverallStatus(row.interviews, stages);
    if (status === 'proceeded') proceeded++;
    else if (status === 'rejected') rejected++;
    else if (status === 'hold') hold++;
    else if (status === 'no_show') no_show++;
    const hasPending = stages.some((s) => {
      const iv = row.interviews[s.stage_id];
      return iv?.scheduled_date && !iv.verdict;
    });
    if (hasPending) pendingFeedback++;
  });

  const hiredCount = rows.filter(isHiredTrackerRow).length;
  const conversionRate =
    rows.length > 0 ? Math.round((hiredCount / rows.length) * 100) : null;

  const scheduledRows = rows.filter((row) =>
    stages.some((s) => row.interviews[s.stage_id]?.scheduled_date),
  );
  const withFeedback = rows.filter((row) =>
    stages.some((s) => {
      const iv = row.interviews[s.stage_id];
      return iv?.feedback && iv.feedback.trim().length > 0;
    }),
  ).length;
  const feedbackCoveragePct =
    scheduledRows.length > 0 ? Math.round((withFeedback / scheduledRows.length) * 100) : 0;

  const deltas: number[] = [];
  rows.forEach((row) => {
    const isoTimes = sortedStages
      .map((s) => row.interviews[s.stage_id]?.scheduled_at_iso)
      .filter(Boolean)
      .map((iso) => new Date(iso!).getTime());
    for (let i = 1; i < isoTimes.length; i++) {
      const d = Math.round((isoTimes[i] - isoTimes[i - 1]) / 86_400_000);
      if (d >= 0) deltas.push(d);
    }
  });
  const avgDaysBetweenStages =
    deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

  const allTimes: number[] = [];
  rows.forEach((row) =>
    stages.forEach((s) => {
      const iso = row.interviews[s.stage_id]?.scheduled_at_iso;
      if (iso) allTimes.push(new Date(iso).getTime());
    }),
  );
  const daysSinceLastActivity =
    allTimes.length > 0 ? differenceInDays(today, new Date(Math.max(...allTimes))) : null;

  const daysToDeadline = applicationDeadline
    ? differenceInDays(parseISO(applicationDeadline), today)
    : null;

  const daysOpen =
    jobCreatedAt != null && jobCreatedAt !== ''
      ? Math.max(0, differenceInDays(today, parseISO(jobCreatedAt)))
      : null;

  const n = rows.length;
  const limitedSample = n > 0 && n < 10;
  const earlyJob = daysOpen != null && daysOpen < 14;
  // Scenario hint for Gemini — deterministic, not a grade substitute
  let scenario: 'early_thin' | 'aged_thin' | 'adequate' | 'empty' = 'empty';
  if (n === 0) scenario = 'empty';
  else if (limitedSample && earlyJob) scenario = 'early_thin';
  else if (limitedSample) scenario = 'aged_thin';
  else scenario = 'adequate';

  const stageFunnel = sortedStages.map((stage) => {
    const inStage = rows.filter((r) => r.interviews[stage.stage_id]);
    const vds = inStage.map((r) => r.interviews[stage.stage_id]?.verdict);
    return {
      name: stage.stage_name,
      count: inStage.length,
      proceeded: vds.filter((v) => v === 'proceeded').length,
      rejected: vds.filter((v) => v === 'rejected').length,
      hold: vds.filter((v) => v === 'hold').length,
      pending: inStage.filter((r) => !r.interviews[stage.stage_id]?.verdict).length,
    };
  });

  return {
    total_candidates: rows.length,
    proceeded,
    rejected,
    hold,
    no_show,
    pending_feedback: pendingFeedback,
    hired_count: hiredCount,
    conversion_rate: conversionRate,
    feedback_coverage_pct: feedbackCoveragePct,
    avg_days_between_stages: avgDaysBetweenStages,
    days_since_last_activity: daysSinceLastActivity,
    days_to_deadline: daysToDeadline,
    days_open: daysOpen,
    limited_sample: limitedSample,
    scenario,
    stage_funnel: stageFunnel,
  };
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
