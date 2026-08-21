import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PeriodKpis {
  avg_time_to_first_interview: number | null;
  avg_time_to_hire: number | null;
  first_iv_sample: number;
  hired_sample: number;
}

export interface JobTimeMetrics {
  job_id: string;
  job_title: string;
  avg_time_to_first_interview: number | null;
  avg_time_to_hire: number | null;
  hired_count: number;
  activity_count: number;
}

export interface StageDuration {
  stage_name: string;
  order_index: number;
  avg_days: number;
  sample_size: number;
}

export interface TimeVelocityMetrics {
  period_days: number;
  current: PeriodKpis;
  previous: PeriodKpis;
  per_job: JobTimeMetrics[];
  stage_durations: StageDuration[];
}

const EMPTY_PERIOD: PeriodKpis = {
  avg_time_to_first_interview: null,
  avg_time_to_hire: null,
  first_iv_sample: 0,
  hired_sample: 0,
};

function parsePeriod(raw: unknown): PeriodKpis {
  if (!raw || typeof raw !== 'object') return EMPTY_PERIOD;
  const p = raw as Record<string, unknown>;
  return {
    avg_time_to_first_interview: typeof p.avg_time_to_first_interview === 'number' ? p.avg_time_to_first_interview : null,
    avg_time_to_hire: typeof p.avg_time_to_hire === 'number' ? p.avg_time_to_hire : null,
    first_iv_sample: typeof p.first_iv_sample === 'number' ? p.first_iv_sample : 0,
    hired_sample: typeof p.hired_sample === 'number' ? p.hired_sample : 0,
  };
}

function parseMetrics(raw: unknown): TimeVelocityMetrics {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid metrics response');
  }
  const data = raw as Record<string, unknown>;
  if (data.error === 'forbidden') {
    throw new Error('You do not have permission to view time & velocity metrics');
  }

  return {
    period_days: typeof data.period_days === 'number' ? data.period_days : 30,
    current: parsePeriod(data.current),
    previous: parsePeriod(data.previous),
    per_job: Array.isArray(data.per_job) ? (data.per_job as JobTimeMetrics[]) : [],
    stage_durations: Array.isArray(data.stage_durations) ? (data.stage_durations as StageDuration[]) : [],
  };
}

export function useTimeVelocityMetrics(
  periodDays: number,
  options?: { enabled?: boolean },
) {
  return useQuery<TimeVelocityMetrics>({
    queryKey: ['time-velocity-metrics', periodDays],
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_time_velocity_metrics', {
        p_period_days: periodDays,
      });
      if (error) throw error;
      return parseMetrics(data);
    },
  });
}

export function periodDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}
