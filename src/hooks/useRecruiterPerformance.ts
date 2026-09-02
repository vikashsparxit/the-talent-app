import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateRow {
  id: string;
  name: string;
  job_title: string;
  source: string | null;
  highest_stage: string | null;
  overall_verdict: string | null;
  is_hired: boolean;
  is_in_pipeline: boolean;
}

export interface RecruiterStat {
  recruiter_id: string;
  recruiter_name: string;
  initials: string;
  sourced: number;
  in_pipeline: number;
  conversion_pct: number;
  proceeded: number;
  hired: number;
  pending: number;
  rank: number;
  job_count: number;
  jobs: { job_id: string; title: string; sourced: number; in_pipeline: number; hired: number }[];
  sources: { source: string; count: number; in_pipeline: number }[];
  candidates: CandidateRow[];
}

export interface RecruiterDetail {
  jobs: RecruiterStat['jobs'];
  sources: RecruiterStat['sources'];
  candidates: CandidateRow[];
}

type LeaderboardRow = {
  recruiter_id: string;
  recruiter_name: string;
  sourced: number;
  in_pipeline: number;
  conversion_pct: number;
  proceeded: number;
  hired: number;
  pending: number;
  job_count: number;
  rank: number;
};

function toInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2) || '?';
}

function mapLeaderboardRow(row: LeaderboardRow): RecruiterStat {
  return {
    recruiter_id: row.recruiter_id,
    recruiter_name: row.recruiter_name,
    initials: toInitials(row.recruiter_name),
    sourced: row.sourced,
    in_pipeline: row.in_pipeline,
    conversion_pct: row.conversion_pct,
    proceeded: row.proceeded,
    hired: row.hired,
    pending: row.pending,
    rank: row.rank,
    job_count: row.job_count,
    jobs: [],
    sources: [],
    candidates: [],
  };
}

export function useRecruiterPerformance(
  startDate: string,
  endDate: string,
  options?: { enabled?: boolean },
) {
  return useQuery<RecruiterStat[]>({
    queryKey: ['recruiter-performance', startDate, endDate],
    enabled: (options?.enabled ?? true) && !!startDate && !!endDate,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recruiter_leaderboard', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return ((data ?? []) as LeaderboardRow[]).map(mapLeaderboardRow);
    },
  });
}

export function useRecruiterPerformanceDetail(
  recruiterId: string | null | undefined,
  startDate: string,
  endDate: string,
) {
  return useQuery<RecruiterDetail>({
    queryKey: ['recruiter-performance-detail', recruiterId, startDate, endDate],
    enabled: !!recruiterId && !!startDate && !!endDate,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recruiter_detail', {
        p_recruiter_id: recruiterId,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? { jobs: [], sources: [], candidates: [] }) as RecruiterDetail;
    },
  });
}
