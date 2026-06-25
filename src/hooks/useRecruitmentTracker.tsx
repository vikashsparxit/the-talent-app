import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrackerStage {
  stage_id: string;
  stage_name: string;
  order_index: number;
}

export interface TrackerInterviewData {
  stage_id: string;
  verdict: string | null;
  interviewer_name: string | null;
  feedback: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_at_iso: string | null;
  interview_mode: string | null;
}

export interface TrackerRow {
  candidate_id: string;
  candidate_name: string;
  email: string;
  phone: string | null;
  source: string | null;
  position_name: string | null;
  recruiter_name: string | null;
  total_experience: number | null;
  relevant_experience: number | null;
  current_ctc: string | null;
  expected_ctc: string | null;
  notice_period: string | null;
  candidate_status: string;
  notes: string | null;
  comms_rating: number | null;
  referred_by: string | null;
  interviews: Record<string, TrackerInterviewData>;
}

export function useRecruitmentTracker(jobId: string | null) {
  const stagesQuery = useQuery({
    queryKey: ['tracker-stages', jobId],
    queryFn: async (): Promise<TrackerStage[]> => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('job_interview_stages')
        .select('id, stage_name, order_index')
        .eq('job_id', jobId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map(s => ({
        stage_id: s.id,
        stage_name: s.stage_name,
        order_index: s.order_index,
      }));
    },
    enabled: !!jobId,
  });

  const trackersQuery = useQuery({
    queryKey: ['tracker-rows', jobId],
    queryFn: async (): Promise<TrackerRow[]> => {
      if (!jobId) return [];

      // Fetch candidates for this job
      const { data: candidates, error: cErr } = await supabase
        .from('candidates')
        .select('id, name, email, phone, source, notes, candidate_status, referred_by')
        .eq('job_id', jobId);
      if (cErr) throw cErr;
      if (!candidates || candidates.length === 0) return [];

      const candidateIds = candidates.map(c => c.id);

      // Fetch job title
      const { data: job } = await supabase
        .from('jobs')
        .select('title')
        .eq('id', jobId)
        .single();

      // Fetch recruiter for this job
      const { data: recruiters } = await supabase
        .from('job_recruiters')
        .select('recruiter_user_id')
        .eq('job_id', jobId);

      let recruiterName: string | null = null;
      if (recruiters && recruiters.length > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', recruiters[0].recruiter_user_id)
          .single();
        recruiterName = profile?.full_name || null;
      }

      // Fetch prescreens
      const { data: prescreens } = await supabase
        .from('candidate_prescreens')
        .select('candidate_id, total_experience_years, relevant_experience_years, current_ctc, expected_ctc, notice_period, comms_rating')
        .in('candidate_id', candidateIds);

      const prescreenMap = new Map(
        (prescreens || []).map(p => [p.candidate_id, p])
      );

      // Fetch interviews with interviewer profiles
      const { data: interviews } = await supabase
        .from('candidate_interviews')
        .select('candidate_id, job_interview_stage_id, verdict, feedback, scheduled_at, interview_mode, interviewer_user_id')
        .in('candidate_id', candidateIds);

      // Fetch interviewer names
      const interviewerIds = [...new Set((interviews || []).map(i => i.interviewer_user_id).filter(Boolean))] as string[];
      let interviewerMap = new Map<string, string>();
      if (interviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', interviewerIds);
        interviewerMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      }

      // Build interview lookup: candidateId -> stageId -> data
      const interviewLookup = new Map<string, Record<string, TrackerInterviewData>>();
      for (const iv of (interviews || [])) {
        if (!iv.job_interview_stage_id) continue;
        if (!interviewLookup.has(iv.candidate_id)) {
          interviewLookup.set(iv.candidate_id, {});
        }
        const stageMap = interviewLookup.get(iv.candidate_id)!;
        const scheduledAt = iv.scheduled_at ? new Date(iv.scheduled_at) : null;
        stageMap[iv.job_interview_stage_id] = {
          stage_id: iv.job_interview_stage_id,
          verdict: iv.verdict,
          interviewer_name: iv.interviewer_user_id ? (interviewerMap.get(iv.interviewer_user_id) || null) : null,
          feedback: iv.feedback,
          scheduled_date: scheduledAt ? scheduledAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : null,
          scheduled_time: scheduledAt ? scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
          scheduled_at_iso: iv.scheduled_at ?? null,
          interview_mode: iv.interview_mode,
        };
      }

      return candidates.map(c => {
        const ps = prescreenMap.get(c.id);
        return {
          candidate_id: c.id,
          candidate_name: c.name,
          email: c.email,
          phone: c.phone,
          source: c.source,
          position_name: job?.title || null,
          recruiter_name: recruiterName,
          total_experience: ps?.total_experience_years ?? null,
          relevant_experience: ps?.relevant_experience_years ?? null,
          current_ctc: ps?.current_ctc ?? null,
          expected_ctc: ps?.expected_ctc ?? null,
          notice_period: ps?.notice_period ?? null,
          candidate_status: c.candidate_status,
          notes: c.notes,
          comms_rating: ps?.comms_rating ?? null,
          referred_by: (c as any).referred_by ?? null,
          interviews: interviewLookup.get(c.id) || {},
        };
      });
    },
    enabled: !!jobId,
  });

  return {
    stages: stagesQuery.data || [],
    rows: trackersQuery.data || [],
    isLoading: stagesQuery.isLoading || trackersQuery.isLoading,
  };
}
