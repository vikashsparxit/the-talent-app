import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CandidateInterview, RatingCategories } from '@/hooks/useInterviewPipeline';
import { fetchPanelInterviewIds } from '@/lib/interviewPanelists';
import { DEFAULT_INTERVIEW_DURATION_MINUTES } from '@/lib/interviewConflicts';

export interface MyInterview extends CandidateInterview {
  job_title?: string;
}

/** Interviews stay "upcoming" through the assumed slot (same 30-min window as conflicts / pending feedback). */
function interviewWindowCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs - DEFAULT_INTERVIEW_DURATION_MINUTES * 60_000).toISOString();
}

const INTERVIEW_SELECT = `
  id, candidate_id, job_interview_stage_id, interviewer_user_id, scheduled_at,
  interview_mode, meeting_link, verdict, feedback, overall_score, rating_categories,
  completed_at, interview_notes,
  candidate:candidates!candidate_interviews_candidate_id_fkey(id, name, email, job_id, role_applied),
  job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(id, stage_name, job_id, order_index, is_eliminatory)
`;

export const PAST_PAGE_SIZE = 25;

function enrichWithJobTitles(
  interviews: CandidateInterview[],
  jobMap: Map<string, { id: string; title: string }>,
): MyInterview[] {
  return interviews.map(iv => {
    const jobId = iv.job_interview_stage?.job_id || iv.candidate?.job_id;
    const job = jobId ? jobMap.get(jobId) : undefined;
    return { ...iv, job_title: job?.title };
  });
}

async function fetchJobMap(interviews: CandidateInterview[]) {
  const jobIds = [
    ...new Set(
      interviews
        .map(iv => iv.job_interview_stage?.job_id || iv.candidate?.job_id)
        .filter(Boolean),
    ),
  ] as string[];

  const { data: jobs } = jobIds.length
    ? await supabase.from('jobs').select('id, title').in('id', jobIds)
    : { data: [] as { id: string; title: string }[] };

  return new Map((jobs || []).map(j => [j.id, j]));
}

async function enrichInterviewRows(rows: CandidateInterview[]): Promise<MyInterview[]> {
  const jobMap = await fetchJobMap(rows);
  return enrichWithJobTitles(rows, jobMap);
}

function applyMyInterviewFilter<T extends { or: (filter: string) => T; eq: (col: string, val: string) => T }>(
  query: T,
  userId: string,
  panelInterviewIds: string[],
): T {
  if (panelInterviewIds.length > 0) {
    return query.or(`interviewer_user_id.eq.${userId},id.in.(${panelInterviewIds.join(',')})`);
  }
  return query.eq('interviewer_user_id', userId);
}

export function useCanAccessMyInterviews() {
  const { user, isInterviewer } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['can-conduct-interviews', user?.id],
    enabled: !!user && !isInterviewer,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('can_conduct_interviews')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.can_conduct_interviews === true;
    },
  });

  if (isInterviewer) return { canAccess: true, isLoading: false };
  if (!user) return { canAccess: false, isLoading: false };
  return {
    canAccess: profileQuery.data === true,
    isLoading: profileQuery.isLoading,
  };
}

export function useMyInterviews() {
  const { user } = useAuth();

  const upcomingQuery = useQuery({
    queryKey: ['my-interviews-upcoming', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      // Keep the whole slot in Upcoming so Join meeting stays available after start.
      const cutoff = interviewWindowCutoffIso();
      const panelInterviewIds = await fetchPanelInterviewIds(user!.id);
      let query = supabase
        .from('candidate_interviews')
        .select(INTERVIEW_SELECT)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', cutoff)
        .order('scheduled_at', { ascending: true });

      query = applyMyInterviewFilter(query, user!.id, panelInterviewIds);

      const { data, error } = await query;
      if (error) throw error;
      return enrichInterviewRows((data || []) as unknown as CandidateInterview[]);
    },
  });

  const pastQuery = useInfiniteQuery({
    queryKey: ['my-interviews-past', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const cutoff = interviewWindowCutoffIso();
      const from = pageParam * PAST_PAGE_SIZE;
      const to = from + PAST_PAGE_SIZE - 1;
      const panelInterviewIds = await fetchPanelInterviewIds(user!.id);

      let query = supabase
        .from('candidate_interviews')
        .select(INTERVIEW_SELECT, { count: 'exact' })
        .not('scheduled_at', 'is', null)
        .lt('scheduled_at', cutoff)
        .order('scheduled_at', { ascending: false })
        .range(from, to);

      query = applyMyInterviewFilter(query, user!.id, panelInterviewIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const interviews = await enrichInterviewRows((data || []) as unknown as CandidateInterview[]);
      return { interviews, totalCount: count ?? interviews.length };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.interviews.length, 0);
      if (loaded >= lastPage.totalCount) return undefined;
      return allPages.length;
    },
  });

  const past = useMemo(
    () => pastQuery.data?.pages.flatMap(page => page.interviews) ?? [],
    [pastQuery.data],
  );

  const pastTotalCount = pastQuery.data?.pages[0]?.totalCount ?? 0;

  return {
    upcoming: upcomingQuery.data ?? [],
    past,
    pastTotalCount,
    isLoadingUpcoming: upcomingQuery.isLoading,
    isLoadingPast: pastQuery.isLoading,
    isFetchingNextPast: pastQuery.isFetchingNextPage,
    hasMorePast: pastQuery.hasNextPage ?? false,
    fetchMorePast: pastQuery.fetchNextPage,
    isError: upcomingQuery.isError || pastQuery.isError,
    error: upcomingQuery.error ?? pastQuery.error,
    refetch: async () => {
      await Promise.all([upcomingQuery.refetch(), pastQuery.refetch()]);
    },
  };
}

export const RATING_LABELS: { key: keyof RatingCategories; label: string }[] = [
  { key: 'technical', label: 'Technical' },
  { key: 'communication', label: 'Communication' },
  { key: 'problem_solving', label: 'Problem Solving' },
  { key: 'culture_fit', label: 'Culture Fit' },
];
