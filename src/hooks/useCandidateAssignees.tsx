import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateRecruiterInfo {
  recruiter_name: string;
  recruiter_email: string;
  is_primary: boolean;
}

// Kept for backward compat with any existing consumers
export interface CandidateRecruiter {
  candidate_id: string;
  recruiter_name: string;
  recruiter_email: string;
}

export interface CandidateInterviewerInfo {
  candidate_id: string;
  interviewer_name: string;
  interviewer_email: string;
}

/** Prefer full_name when it looks like a real name; else use email local part so we never show full email as "name". */
function displayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName || '').trim();
  if (name && !name.includes('@')) return name;
  if (email && email.includes('@')) return email.split('@')[0];
  return '—';
}

/**
 * Fetches all recruiters (via job_recruiters → candidate.job_id) and all interviewers
 * (via candidate_interviewers) for all visible candidates.
 * Returns lookup maps keyed by candidate_id → array.
 */
function stableIdKey(ids: string[] | undefined): string {
  if (!ids?.length) return '';
  return [...ids].sort().join(',');
}

export function useCandidateAssignees(candidateIds?: string[]) {
  const scoped = candidateIds !== undefined;
  const enabled = !scoped || candidateIds.length > 0;
  const idKey = scoped ? stableIdKey(candidateIds) : 'all';

  const recruiterQuery = useQuery({
    queryKey: ['candidate-recruiters', idKey],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      let candidateQuery = supabase
        .from('candidates')
        .select('id, job_id')
        .not('job_id', 'is', null);

      if (scoped) {
        candidateQuery = candidateQuery.in('id', candidateIds!);
      }

      const { data: candidates } = await candidateQuery;

      if (!candidates?.length) return new Map<string, CandidateRecruiterInfo[]>();

      const jobIds = [...new Set(candidates.map(c => c.job_id!))];

      const { data: assignments } = await supabase
        .from('job_recruiters')
        .select('job_id, recruiter_user_id, is_primary')
        .in('job_id', jobIds);

      if (!assignments?.length) return new Map<string, CandidateRecruiterInfo[]>();

      const recruiterUserIds = [...new Set(assignments.map(a => a.recruiter_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', recruiterUserIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      // job_id -> all recruiter profiles (multi)
      const jobRecruiterMap = new Map<string, CandidateRecruiterInfo[]>();
      assignments.forEach(a => {
        const p = profileMap.get(a.recruiter_user_id);
        if (!p) return;
        const list = jobRecruiterMap.get(a.job_id) || [];
        list.push({
          recruiter_name: displayName(p.full_name, p.email),
          recruiter_email: p.email,
          is_primary: (a as any).is_primary ?? false,
        });
        jobRecruiterMap.set(a.job_id, list);
      });

      // candidate_id -> [recruiters]
      const result = new Map<string, CandidateRecruiterInfo[]>();
      candidates.forEach(c => {
        const recruiters = jobRecruiterMap.get(c.job_id!);
        if (recruiters?.length) result.set(c.id, recruiters);
      });

      return result;
    },
  });

  const interviewerQuery = useQuery({
    queryKey: ['candidate-interviewers-all', idKey],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      let assignmentQuery = supabase
        .from('candidate_interviewers')
        .select('candidate_id, interviewer_user_id');

      if (scoped) {
        assignmentQuery = assignmentQuery.in('candidate_id', candidateIds!);
      }

      const { data: assignments } = await assignmentQuery;

      if (!assignments?.length) return new Map<string, CandidateInterviewerInfo[]>();

      const userIds = [...new Set(assignments.map(a => a.interviewer_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const result = new Map<string, CandidateInterviewerInfo[]>();
      assignments.forEach(a => {
        const p = profileMap.get(a.interviewer_user_id);
        if (!p) return;
        const list = result.get(a.candidate_id) || [];
        list.push({
          candidate_id: a.candidate_id,
          interviewer_name: displayName(p.full_name, p.email),
          interviewer_email: p.email,
        });
        result.set(a.candidate_id, list);
      });

      return result;
    },
  });

  return {
    recruiterMap: recruiterQuery.data ?? new Map<string, CandidateRecruiterInfo[]>(),
    interviewerMap: interviewerQuery.data ?? new Map<string, CandidateInterviewerInfo[]>(),
    isLoading: recruiterQuery.isLoading || interviewerQuery.isLoading,
  };
}
