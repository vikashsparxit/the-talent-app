import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AcademicRecord {
  level: '10th' | '12th' | 'graduation' | 'post_graduation';
  institution: string;
  marks: string;
  percentile: string;
}

export interface PreScreenData {
  id?: string;
  candidate_id: string;
  total_experience_years?: number | null;
  relevant_experience_years?: number | null;
  relevant_experience_domain?: string;
  current_ctc?: string;
  expected_ctc?: string;
  notice_period?: string;
  lwd?: string;
  current_location?: string;
  preferred_location?: string;
  open_to_relocation?: string | null;        // 'yes' | 'no' | 'maybe'
  work_mode_preference?: string[] | null;    // ['wfo','wfh','hybrid','flexible']
  comms_rating?: number | null;
  nutshell?: string;
  academics?: AcademicRecord[];
  screened_by?: string | null;
  screened_at?: string | null;
}

export function usePreScreen(candidateId: string | null, isInterviewerOnly = false) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: prescreen, isLoading } = useQuery({
    queryKey: ['prescreen', candidateId, isInterviewerOnly],
    queryFn: async () => {
      if (!candidateId) return null;

      // Interviewers use the restricted RPC function (no CTC/notice/LWD)
      if (isInterviewerOnly) {
        const { data, error } = await supabase.rpc('get_interviewer_prescreen', {
          _candidate_id: candidateId,
        });
        if (error) throw error;
        if (!data || data.length === 0) return null;
        const row = data[0];
        return {
          ...row,
          academics: (row.academics as unknown as AcademicRecord[]) || [],
        } as PreScreenData;
      }

      const { data, error } = await supabase
        .from('candidate_prescreens')
        .select('*')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        academics: (data.academics as unknown as AcademicRecord[]) || [],
      } as PreScreenData;
    },
    enabled: !!candidateId,
  });

  const upsert = useMutation({
    mutationFn: async (values: Omit<PreScreenData, 'id'>) => {
      const { data: existing } = await supabase
        .from('candidate_prescreens')
        .select('id')
        .eq('candidate_id', values.candidate_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('candidate_prescreens')
          .update({
            ...values,
            academics: values.academics as any,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('candidate_prescreens')
          .insert({
            ...values,
            academics: values.academics as any,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescreen', candidateId] });
      toast({ title: 'Pre-screen saved' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save pre-screen', description: err.message, variant: 'destructive' });
    },
  });

  return { prescreen, isLoading, upsert };
}
