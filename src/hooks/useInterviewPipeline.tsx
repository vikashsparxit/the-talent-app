import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface InterviewStageTemplate {
  id: string;
  name: string;
  description?: string;
  stages: { name: string; order: number }[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface JobInterviewStage {
  id: string;
  job_id: string;
  stage_name: string;
  order_index: number;
  is_eliminatory: boolean;
  created_at: string;
  updated_at: string;
}

export type InterviewVerdict = 'proceeded' | 'rejected' | 'hold' | 'no_show';
export type InterviewMode = 'in_person' | 'video' | 'phone';

export interface RatingCategories {
  technical?: number;
  communication?: number;
  problem_solving?: number;
  culture_fit?: number;
}

export interface InterviewArtifact {
  id: string;
  type: 'file' | 'link';
  url: string;
  name: string;
  mime?: string;
  size?: number;
  added_at: string;
}

export interface InterviewPanelist {
  user_id: string;
  full_name: string;
  email: string;
}

export interface CandidateInterview {
  id: string;
  candidate_id: string;
  job_interview_stage_id: string;
  interviewer_user_id?: string;
  panelists?: InterviewPanelist[];
  verdict?: InterviewVerdict;
  overall_score?: number;
  rating_categories?: RatingCategories;
  feedback?: string;
  artifacts?: InterviewArtifact[];
  interview_mode?: InterviewMode;
  meeting_link?: string;
  scheduled_at?: string;
  completed_at?: string;
  advanced_by?: string;
  advanced_at?: string;
  interview_notes?: string | null;
  enrolled_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  candidate?: { id: string; name: string; email: string; role_applied?: string; resume_url?: string; candidate_status: string; hired_at?: string | null; phone?: string; uploaded_by?: string; owner?: { full_name: string } | null };
  job_interview_stage?: JobInterviewStage;
  interviewer?: { full_name: string; email: string };
}

// ─── Stage Templates ───

export function useStageTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const templatesQuery = useQuery({
    queryKey: ['interview-stage-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interview_stage_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        stages: (t.stages as any[]) || [],
      })) as InterviewStageTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: { name: string; description?: string; stages: { name: string; order: number }[] }) => {
      const { data, error } = await supabase
        .from('interview_stage_templates')
        .insert({ name: template.name, description: template.description, stages: template.stages as any })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interview-stage-templates'] });
      toast({ title: 'Template created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interview_stage_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interview-stage-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return { templates: templatesQuery.data || [], isLoading: templatesQuery.isLoading, createTemplate, deleteTemplate };
}

// ─── Job Interview Stages ───

export function useJobInterviewStages(jobId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const stagesQuery = useQuery({
    queryKey: ['job-interview-stages', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_interview_stages')
        .select('*')
        .eq('job_id', jobId!)
        .order('order_index');
      if (error) throw error;
      return data as JobInterviewStage[];
    },
  });

  const applyTemplate = useMutation({
    mutationFn: async ({ jobId, stages }: { jobId: string; stages: { name: string; order: number }[] }) => {
      // Delete existing stages first
      await supabase.from('job_interview_stages').delete().eq('job_id', jobId);
      const rows = stages.map(s => ({ job_id: jobId, stage_name: s.name, order_index: s.order }));
      const { error } = await supabase.from('job_interview_stages').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-interview-stages', jobId] });
      toast({ title: 'Interview stages applied' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addStage = useMutation({
    mutationFn: async ({ jobId, stageName, orderIndex }: { jobId: string; stageName: string; orderIndex: number }) => {
      const { error } = await supabase
        .from('job_interview_stages')
        .insert({ job_id: jobId, stage_name: stageName, order_index: orderIndex });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-interview-stages', jobId] });
      queryClient.invalidateQueries({ queryKey: ['all-job-interview-stages'] });
    },
    onError: (e: any) => toast({
      title: 'Error',
      description: e.code === '23505' || e.message?.includes('unique constraint')
        ? 'A stage with that name already exists. Please choose a different name.'
        : e.message,
      variant: 'destructive',
    }),
  });

  const deleteStage = useMutation({
    mutationFn: async (stageId: string) => {
      const { error } = await supabase.from('job_interview_stages').delete().eq('id', stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-interview-stages', jobId] });
      queryClient.invalidateQueries({ queryKey: ['all-job-interview-stages'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const renameStage = useMutation({
    mutationFn: async ({ stageId, stageName }: { stageId: string; stageName: string }) => {
      const { error } = await supabase
        .from('job_interview_stages')
        .update({ stage_name: stageName })
        .eq('id', stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-interview-stages', jobId] });
      queryClient.invalidateQueries({ queryKey: ['all-job-interview-stages'] });
    },
    onError: (e: any) => toast({
      title: 'Error',
      description: e.code === '23505' || e.message?.includes('unique constraint')
        ? 'A stage with that name already exists. Please choose a different name.'
        : e.message,
      variant: 'destructive',
    }),
  });

  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update order_index for each stage in a batch
      const updates = orderedIds.map((id, idx) =>
        supabase.from('job_interview_stages').update({ order_index: idx }).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-interview-stages', jobId] });
      queryClient.invalidateQueries({ queryKey: ['all-job-interview-stages'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return { stages: stagesQuery.data || [], isLoading: stagesQuery.isLoading, applyTemplate, addStage, deleteStage, renameStage, reorderStages };
}

// ─── Candidate Interviews (Pipeline) ───

export function useUpdateInterview(options?: { jobId?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CandidateInterview> & { id: string }) => {
      const { error } = await supabase
        .from('candidate_interviews')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['all-candidate-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interview-history'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approval'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
      queryClient.invalidateQueries({ queryKey: ['my-interviews-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['my-interviews-past'] });
      queryClient.invalidateQueries({ queryKey: ['pending-feedback-interviews'] });
      if (options?.jobId) {
        queryClient.invalidateQueries({ queryKey: ['candidate-interviews', options.jobId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['candidate-interviews'] });
      }
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useCandidateInterviews(jobId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const interviewsQuery = useQuery({
    queryKey: ['candidate-interviews', jobId],
    enabled: !!jobId,
    retry: 1,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_job_pipeline_interviews', {
        p_job_id: jobId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CandidateInterview[];
    },
  });

  const createInterview = useMutation({
    mutationFn: async (input: { candidate_id: string; job_interview_stage_id: string; interviewer_user_id?: string; scheduled_at?: string; interview_mode?: InterviewMode; meeting_link?: string; round?: number }) => {
      const { data, error } = await supabase
        .from('candidate_interviews')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews', jobId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interview-history'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approval-counts'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateInterview = useUpdateInterview({ jobId });

  const advanceCandidate = useMutation({
    mutationFn: async ({ candidateId, fromStageId, toStageId, advancedBy }: { candidateId: string; fromStageId: string; toStageId: string; advancedBy: string }) => {
      const { error } = await supabase.rpc('advance_candidate_stage', {
        p_candidate_id: candidateId,
        p_from_stage_id: fromStageId,
        p_to_stage_id: toStageId,
        p_advanced_by: advancedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews', jobId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      toast({ title: 'Candidate advanced to next stage' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeFromPipeline = useMutation({
    mutationFn: async ({ candidateId, removedBy }: { candidateId: string; removedBy: string }) => {
      if (!jobId) throw new Error('No job selected');
      const { data: stages } = await supabase
        .from('job_interview_stages')
        .select('id')
        .eq('job_id', jobId);
      if (!stages?.length) return;
      const stageIds = stages.map((s: { id: string }) => s.id);
      const { error } = await supabase
        .from('candidate_interviews')
        .update({ removed_from_pipeline_at: new Date().toISOString(), removed_by: removedBy } as any)
        .eq('candidate_id', candidateId)
        .in('job_interview_stage_id', stageIds)
        .is('removed_from_pipeline_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews', jobId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      toast({ title: 'Candidate removed from pipeline' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reopenCandidate = useMutation({
    mutationFn: async ({ candidateId }: { candidateId: string }) => {
      if (!jobId) throw new Error('No job selected');
      const { data: stages, error: stagesErr } = await supabase
        .from('job_interview_stages')
        .select('id')
        .eq('job_id', jobId)
        .order('order_index');
      if (stagesErr) throw stagesErr;
      if (!stages?.length) throw new Error('No stages found for this job');

      const stageIds = stages.map((s: { id: string }) => s.id);
      const { data: existing } = await supabase
        .from('candidate_interviews')
        .select('round')
        .eq('candidate_id', candidateId)
        .in('job_interview_stage_id', stageIds)
        .order('round' as any, { ascending: false })
        .limit(1);
      const newRound = ((existing?.[0] as { round?: number } | undefined)?.round ?? 1) + 1;

      const { error: insertErr } = await supabase
        .from('candidate_interviews')
        .insert(stages.map((s: { id: string }) => ({ candidate_id: candidateId, job_interview_stage_id: s.id, round: newRound } as any)));
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from('candidates')
        .update({ candidate_status: 'reviewing' })
        .eq('id', candidateId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews', jobId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-job-counts'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Candidate re-opened for a new round' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return {
    interviews: interviewsQuery.data || [],
    isLoading: interviewsQuery.isLoading,
    createInterview,
    updateInterview,
    advanceCandidate,
    removeFromPipeline,
    reopenCandidate,
    refetch: interviewsQuery.refetch,
  };
}

export function usePipelineJobCounts(openJobIds: string[]) {
  const jobIdsKey = openJobIds.length ? [...openJobIds].sort().join(',') : '';
  return useQuery({
    queryKey: ['pipeline-job-counts', jobIdsKey],
    enabled: openJobIds.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pipeline_job_counts', {
        p_job_ids: openJobIds,
      });
      if (error) throw error;

      const result = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ job_id: string; candidate_count: number }>) {
        result.set(row.job_id, Number(row.candidate_count));
      }
      return result;
    },
  });
}

export function usePendingApprovalCounts(openJobIds: string[]) {
  const jobIdsKey = openJobIds.length ? [...openJobIds].sort().join(',') : '';
  return useQuery({
    queryKey: ['pending-approval-counts', jobIdsKey],
    enabled: openJobIds.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const [{ data: candidates, error: candErr }, ...enrolledResults] = await Promise.all([
        supabase
          .from('candidates')
          .select('id, job_id')
          .in('job_id', openJobIds)
          .not('candidate_status', 'in', '("backout","shortlisted","rejected")'),
        ...openJobIds.map((jobId) =>
          supabase.rpc('get_job_enrolled_candidate_ids', { p_job_id: jobId }),
        ),
      ]);
      if (candErr) throw candErr;

      const enrolledByJob = new Map<string, Set<string>>();
      openJobIds.forEach((jobId, i) => {
        const { data, error } = enrolledResults[i];
        if (error) throw error;
        enrolledByJob.set(jobId, new Set((data ?? []) as string[]));
      });

      const result = new Map<string, number>();
      for (const jobId of openJobIds) result.set(jobId, 0);

      for (const c of candidates ?? []) {
        if (!enrolledByJob.get(c.job_id)?.has(c.id)) {
          result.set(c.job_id, (result.get(c.job_id) ?? 0) + 1);
        }
      }
      return result;
    },
  });
}

export interface HolisticInterview extends CandidateInterview {
  job?: { id: string; title: string; department?: string };
}
