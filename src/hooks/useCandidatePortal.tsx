import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface CodingTestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

export interface PortalQuestion {
  id: string;
  question_text: string;
  type: 'mcq' | 'coding' | 'subjective';
  marks: number;
  order_index: number;
  options: Array<{ id: string; text: string }> | null;
  coding_language: string | null;
  coding_starter_code: string | null;
  coding_test_cases: CodingTestCase[] | null;
  subjective_max_words: number | null;
  section_id: string;
}

export interface PortalSection {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  weightage: number;
  questions: PortalQuestion[];
}

export interface PortalAssessment {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  settings: {
    randomize_questions?: boolean;
    show_score_immediately?: boolean;
    allow_review?: boolean;
  };
  sections: PortalSection[];
}

export interface CandidateAssessmentInfo {
  id: string;
  status: 'invited' | 'in_progress' | 'completed' | 'evaluated' | 'expired';
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  total_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  integrity_log?: Array<{ type: string; timestamp: string; duration_seconds?: number }>;
  candidate: {
    id: string;
    name: string;
    email: string;
  };
  assessment: PortalAssessment;
}

export interface CandidateResponse {
  id: string;
  question_id: string;
  response: Json;
  time_spent_seconds: number | null;
}

export function useValidateAccessToken(accessToken: string | undefined) {
  return useQuery({
    queryKey: ['portal-access', accessToken],
    queryFn: async (): Promise<CandidateAssessmentInfo | null> => {
      if (!accessToken) return null;

      const { data, error } = await supabase.functions.invoke('candidate-portal', {
        body: { 
          action: 'validate',
          access_token: accessToken,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Validation failed');
      
      return data.data as CandidateAssessmentInfo;
    },
    enabled: !!accessToken,
    staleTime: 30000,
  });
}

export function useCandidateResponses(candidateAssessmentId: string | undefined, accessToken: string | undefined) {
  return useQuery({
    queryKey: ['candidate-responses', candidateAssessmentId],
    queryFn: async () => {
      if (!candidateAssessmentId || !accessToken) return [];

      // If using session auth, query directly
      if (accessToken === 'session') {
        const { data, error } = await supabase
          .from('candidate_responses')
          .select('id, question_id, response, time_spent_seconds')
          .eq('candidate_assessment_id', candidateAssessmentId);

        if (error) throw error;
        return (data || []).map(r => ({
          id: r.id,
          question_id: r.question_id,
          response: r.response,
          time_spent_seconds: r.time_spent_seconds,
        })) as CandidateResponse[];
      }

      // Otherwise use edge function for magic link auth
      const { data, error } = await supabase.functions.invoke('candidate-portal', {
        body: { 
          action: 'get-responses',
          access_token: accessToken,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch responses');
      
      return data.data as CandidateResponse[];
    },
    enabled: !!candidateAssessmentId && !!accessToken,
  });
}

export function useStartAssessment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      accessToken,
      consentSource = 'exam_portal_magic_link',
    }: {
      candidateAssessmentId: string;
      accessToken: string;
      consentSource?: string;
    }) => {
      if (accessToken === 'session') {
        const { error } = await supabase
          .from('candidate_assessments')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString(),
            consent_given: true,
            consent_given_at: new Date().toISOString(),
            consent_source: consentSource,
          } as any)
          .eq('id', candidateAssessmentId);

        if (error) throw error;
        return { success: true };
      }

      const { data, error } = await supabase.functions.invoke('candidate-portal', {
        body: {
          action: 'start',
          access_token: accessToken,
          data: {
            consent_given: true,
            consent_source: consentSource,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to start assessment');
      
      return data;
    },
    onSuccess: (_, { candidateAssessmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['portal-access'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-responses', candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['applicant-assessments'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to start assessment',
        description: error.message,
      });
    },
  });
}

export function useSaveResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      questionId,
      response,
      timeSpent,
      autoScore,
      accessToken,
    }: {
      candidateAssessmentId: string;
      questionId: string;
      response: Json;
      timeSpent?: number;
      autoScore?: number;
      accessToken: string;
    }) => {
      // If using session auth, upsert directly
      if (accessToken === 'session') {
        // Check if response exists
        const { data: existing } = await supabase
          .from('candidate_responses')
          .select('id')
          .eq('candidate_assessment_id', candidateAssessmentId)
          .eq('question_id', questionId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('candidate_responses')
            .update({
              response,
              time_spent_seconds: timeSpent,
              auto_score: autoScore,
              final_score: autoScore, // For MCQ auto-scoring
            })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('candidate_responses')
            .insert({
              candidate_assessment_id: candidateAssessmentId,
              question_id: questionId,
              response,
              time_spent_seconds: timeSpent,
              auto_score: autoScore,
              final_score: autoScore,
            });

          if (error) throw error;
        }
        return;
      }

      // Otherwise use edge function
      const { data, error } = await supabase.functions.invoke('candidate-portal', {
        body: { 
          action: 'save-response',
          access_token: accessToken,
          data: {
            question_id: questionId,
            response,
            time_spent: timeSpent,
            auto_score: autoScore,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save response');
    },
    onSuccess: (_, { candidateAssessmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-responses', candidateAssessmentId] });
    },
  });
}

export function useSubmitAssessment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      accessToken,
    }: {
      candidateAssessmentId: string;
      accessToken: string;
    }) => {
      // If using session auth, submit directly
      if (accessToken === 'session') {
        const { error } = await supabase
          .from('candidate_assessments')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', candidateAssessmentId);

        if (error) throw error;

        await supabase.functions.invoke('candidate-portal', {
          body: {
            action: 'notify-staff-complete',
            data: { candidate_assessment_id: candidateAssessmentId },
          },
        });

        return { percentage: null, passed: null };
      }

      // Otherwise use edge function
      const { data, error } = await supabase.functions.invoke('candidate-portal', {
        body: { 
          action: 'submit',
          access_token: accessToken,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to submit assessment');
      
      return data.data as { percentage: number | null; passed: boolean | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-access'] });
      queryClient.invalidateQueries({ queryKey: ['applicant-assessments'] });
      toast({
        title: 'Assessment submitted',
        description: 'Your responses have been recorded successfully.',
      });
    },
  });
}

export function useLogIntegrityEvent() {
  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      event,
      accessToken,
    }: {
      candidateAssessmentId: string;
      event: { type: string; timestamp: string; duration_seconds?: number };
      accessToken: string;
    }) => {
      try {
        // If using session auth, update directly
        if (accessToken === 'session') {
          // Get current integrity log
          const { data: current, error: fetchError } = await supabase
            .from('candidate_assessments')
            .select('integrity_log')
            .eq('id', candidateAssessmentId)
            .single();

          if (fetchError) throw fetchError;

          const existingLog = (current?.integrity_log as any[]) || [];
          const updatedLog = [...existingLog, event];

          const { error } = await supabase
            .from('candidate_assessments')
            .update({ integrity_log: updatedLog })
            .eq('id', candidateAssessmentId);

          if (error) throw error;
          return;
        }

        // Otherwise use edge function
        const { data, error } = await supabase.functions.invoke('candidate-portal', {
          body: { 
            action: 'log-integrity',
            access_token: accessToken,
            data: { event },
          },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to log event');
      } catch (err) {
        console.warn('Integrity event log failed (non-blocking):', err);
      }
    },
  });
}
