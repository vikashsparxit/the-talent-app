import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CandidateInterview } from '@/hooks/useInterviewPipeline';
import { fetchPanelInterviewIds } from '@/lib/interviewPanelists';

export function usePendingFeedbackInterviews() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['pending-feedback-interviews', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const panelInterviewIds = await fetchPanelInterviewIds(user!.id);

      let request = supabase
        .from('candidate_interviews')
        .select(`
          id, candidate_id, job_interview_stage_id, interviewer_user_id, scheduled_at,
          interview_mode, meeting_link, verdict, feedback, overall_score, rating_categories,
          artifacts, completed_at, interview_notes, round,
          candidate:candidates!candidate_interviews_candidate_id_fkey(id, name, email, phone, job_id, role_applied),
          job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(id, stage_name, job_id, order_index, is_eliminatory)
        `)
        .is('verdict', null)
        .not('scheduled_at', 'is', null)
        .lt('scheduled_at', cutoff)
        .order('scheduled_at', { ascending: true });

      if (panelInterviewIds.length > 0) {
        request = request.or(`interviewer_user_id.eq.${user!.id},id.in.(${panelInterviewIds.join(',')})`);
      } else {
        request = request.eq('interviewer_user_id', user!.id);
      }

      const { data, error } = await request;
      if (error) throw error;
      return (data || []) as unknown as CandidateInterview[];
    },
  });

  return {
    pendingInterviews: query.data || [],
    hasPending: (query.data?.length ?? 0) > 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
