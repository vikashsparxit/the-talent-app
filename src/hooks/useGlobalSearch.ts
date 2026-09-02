import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type SearchRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';

const RESULT_LIMIT = 5;

export type GlobalSearchCandidate = {
  type: 'candidate';
  id: string;
  name: string;
  email: string;
  jobId: string | null;
  jobTitle: string | null;
};

export type GlobalSearchJob = {
  type: 'job';
  id: string;
  title: string;
  department: string | null;
  status: string;
};

export type GlobalSearchInterview = {
  type: 'interview';
  id: string;
  candidateId: string;
  jobId: string;
  candidateName: string;
  stageName: string;
  jobTitle: string;
  scheduledAt: string;
};

export type GlobalSearchResults = {
  candidates: GlobalSearchCandidate[];
  jobs: GlobalSearchJob[];
  interviews: GlobalSearchInterview[];
};

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

async function fetchRecruiterJobIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('job_recruiters')
    .select('job_id')
    .eq('recruiter_user_id', userId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.job_id));
}

async function searchCandidates(
  term: string,
  role: SearchRole | null,
  userId: string | undefined,
  recruiterJobIds: Set<string> | undefined,
): Promise<GlobalSearchCandidate[]> {
  const pattern = `%${escapeIlike(term)}%`;
  const skillToken = term.trim().replace(/,/g, '');
  const orFilters = [
    `name.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `role_applied.ilike.${pattern}`,
  ];
  if (skillToken && !skillToken.includes(' ')) {
    // skills is jsonb (not text[]); PostgREST cs needs JSON array syntax, not {token}
    orFilters.push(`skills.cs.${JSON.stringify([skillToken])}`);
    orFilters.push(`skills_tags.cs.${JSON.stringify([skillToken])}`);
  }

  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, email, job_id, uploaded_by, job:jobs(id, title)')
    .or(orFilters.join(','))
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT * 2);

  if (error) throw error;

  let rows = data || [];
  if (role === 'recruiter' && userId && recruiterJobIds) {
    rows = rows.filter(
      (row) =>
        (row.job_id != null && recruiterJobIds.has(row.job_id)) ||
        row.uploaded_by === userId,
    );
  }

  return rows.slice(0, RESULT_LIMIT).map((row) => {
    const job = row.job as { id: string; title: string } | null;
    return {
      type: 'candidate' as const,
      id: row.id,
      name: row.name,
      email: row.email,
      jobId: row.job_id,
      jobTitle: job?.title ?? null,
    };
  });
}

async function searchJobs(
  term: string,
  role: SearchRole | null,
): Promise<GlobalSearchJob[]> {
  if (role === 'interviewer') return [];

  const pattern = `%${escapeIlike(term)}%`;
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, department, status')
    .or(`title.ilike.${pattern},department.ilike.${pattern}`)
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT);

  if (error) throw error;

  return (data || []).map((row) => ({
    type: 'job' as const,
    id: row.id,
    title: row.title,
    department: row.department,
    status: row.status,
  }));
}

type InterviewRow = {
  id: string;
  scheduled_at: string;
  candidate_id: string;
  candidate: { id: string; name: string; email: string } | null;
  job_interview_stage: {
    id: string;
    stage_name: string;
    job_id: string;
    job: { id: string; title: string } | null;
  } | null;
};

async function searchInterviews(term: string): Promise<GlobalSearchInterview[]> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  const to = new Date(now);
  to.setDate(to.getDate() + 120);

  const { data, error } = await supabase
    .from('candidate_interviews')
    .select(`
      id, scheduled_at, candidate_id,
      candidate:candidates!candidate_interviews_candidate_id_fkey(id, name, email),
      job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        id, stage_name, job_id,
        job:jobs(id, title)
      )
    `)
    .not('scheduled_at', 'is', null)
    .is('removed_from_pipeline_at', null)
    .gte('scheduled_at', from.toISOString())
    .lte('scheduled_at', to.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(60);

  if (error) throw error;

  const lower = term.toLowerCase();
  return ((data || []) as InterviewRow[])
    .filter((row) => {
      const cName = row.candidate?.name?.toLowerCase() ?? '';
      const cEmail = row.candidate?.email?.toLowerCase() ?? '';
      const stage = row.job_interview_stage?.stage_name?.toLowerCase() ?? '';
      const jobTitle = row.job_interview_stage?.job?.title?.toLowerCase() ?? '';
      return (
        cName.includes(lower) ||
        cEmail.includes(lower) ||
        stage.includes(lower) ||
        jobTitle.includes(lower)
      );
    })
    .slice(0, RESULT_LIMIT)
    .map((row) => ({
      type: 'interview' as const,
      id: row.id,
      candidateId: row.candidate_id,
      jobId: row.job_interview_stage?.job_id ?? row.job_interview_stage?.job?.id ?? '',
      candidateName: row.candidate?.name ?? 'Unknown candidate',
      stageName: row.job_interview_stage?.stage_name ?? 'Interview',
      jobTitle: row.job_interview_stage?.job?.title ?? '',
      scheduledAt: row.scheduled_at,
    }))
    .filter((row) => row.jobId);
}

export function useGlobalSearch(query: string, enabled: boolean) {
  const { user, role } = useAuth();
  const trimmed = query.trim();

  const recruiterJobsQuery = useQuery({
    queryKey: ['global-search-recruiter-jobs', user?.id],
    enabled: enabled && role === 'recruiter' && !!user?.id,
    staleTime: 60_000,
    queryFn: () => fetchRecruiterJobIds(user!.id),
  });

  return useQuery({
    queryKey: ['global-search', trimmed, role, user?.id],
    enabled: enabled && trimmed.length >= 2 && (role !== 'recruiter' || recruiterJobsQuery.isSuccess),
    staleTime: 30_000,
    queryFn: async (): Promise<GlobalSearchResults> => {
      const [candidates, jobs, interviews] = await Promise.all([
        searchCandidates(trimmed, role, user?.id, recruiterJobsQuery.data),
        searchJobs(trimmed, role),
        searchInterviews(trimmed),
      ]);
      return { candidates, jobs, interviews };
    },
  });
}
