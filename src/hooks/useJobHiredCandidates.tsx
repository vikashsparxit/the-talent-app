import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HiredCandidateSummary {
  id: string;
  name: string;
  email: string;
  hired_at: string | null;
}

export async function fetchHiredCandidatesForJobs(
  jobIds: string[],
): Promise<Map<string, HiredCandidateSummary[]>> {
  const map = new Map<string, HiredCandidateSummary[]>();
  if (!jobIds.length) return map;

  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, email, hired_at, job_id')
    .in('job_id', jobIds)
    .or('hired_at.not.is.null,candidate_status.eq.shortlisted')
    .order('hired_at', { ascending: true, nullsFirst: false });

  if (error) throw error;

  for (const row of data ?? []) {
    const summary: HiredCandidateSummary = {
      id: row.id,
      name: row.name,
      email: row.email,
      hired_at: row.hired_at,
    };
    const list = map.get(row.job_id) ?? [];
    list.push(summary);
    map.set(row.job_id, list);
  }

  return map;
}

export function useJobHiredCandidates(closedJobIds: string[]) {
  const key = [...closedJobIds].sort().join(',');

  return useQuery({
    queryKey: ['job-hired-candidates', key],
    enabled: closedJobIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchHiredCandidatesForJobs(closedJobIds),
  });
}
