import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { PortalError, portalErrorFromBody, portalErrorFromDb } from '@/lib/assessmentGrading';

/**
 * Calls the candidate-portal function and turns non-2xx responses into a
 * PortalError carrying the server's message and code (supabase-js otherwise
 * only reports "non-2xx status code").
 */
async function invokePortal<T = unknown>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('candidate-portal', { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null);
      throw portalErrorFromBody(payload, fallback);
    }
    throw new PortalError(error.message || fallback);
  }
  if (!data?.success) throw portalErrorFromBody(data, fallback);
  return data as T;
}

function throwDbError(error: { message?: string } | null): void {
  if (!error) return;
  throw portalErrorFromDb(error) ?? error;
}

export interface CodingTestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

export interface PortalQuestion {
  id: string;
  question_text: string;
  type: 'mcq' | 'coding' | 'subjective' | 'file_upload';
  marks: number;
  order_index: number;
  options: Array<{ id: string; text: string }> | null;
  coding_language: string | null;
  coding_starter_code: string | null;
  coding_test_cases: CodingTestCase[] | null;
  subjective_max_words: number | null;
  file_config?: {
    allow_file: boolean;
    allow_link: boolean;
    allowed_mime_types: string[];
    max_file_bytes: number;
    max_files?: number;
  } | null;
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
  /** AI grading still running (link path); percentage / passed are not final. */
  grading_pending?: boolean;
  /** Server-side end of the attempt (start + duration or deadline, plus grace). */
  time_limit_at?: string | null;
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

      const data = await invokePortal<{ data: CandidateAssessmentInfo }>(
        { action: 'validate', access_token: accessToken },
        'Validation failed',
      );
      return data.data;
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
        // started_at is set by the database when the status moves to in_progress.
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

        throwDbError(error);
        return { success: true };
      }

      return invokePortal(
        {
          action: 'start',
          access_token: accessToken,
          data: {
            consent_given: true,
            consent_source: consentSource,
          },
        },
        'Failed to start assessment',
      );
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

function stripClientScoreFields(response: Json): Json {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const clone = { ...(response as Record<string, unknown>) };
  delete clone.execution_result;
  delete clone.auto_score;
  delete clone.final_score;
  delete clone.manual_score;
  return clone as Json;
}

export function useSaveResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      questionId,
      response,
      timeSpent,
      accessToken,
    }: {
      candidateAssessmentId: string;
      questionId: string;
      response: Json;
      timeSpent?: number;
      autoScore?: number;
      accessToken: string;
    }) => {
      const sanitizedResponse = stripClientScoreFields(response);

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
              response: sanitizedResponse,
              time_spent_seconds: timeSpent,
            })
            .eq('id', existing.id);

          throwDbError(error);
        } else {
          const { error } = await supabase
            .from('candidate_responses')
            .insert({
              candidate_assessment_id: candidateAssessmentId,
              question_id: questionId,
              response: sanitizedResponse,
              time_spent_seconds: timeSpent,
            });

          throwDbError(error);
        }
        return;
      }

      // Otherwise use edge function
      await invokePortal(
        {
          action: 'save-response',
          access_token: accessToken,
          data: {
            question_id: questionId,
            response: sanitizedResponse,
            time_spent: timeSpent,
          },
        },
        'Failed to save response',
      );
    },
    onSuccess: (_, { candidateAssessmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-responses', candidateAssessmentId] });
    },
  });
}

export interface SubmitResult {
  percentage: number | null;
  passed: boolean | null;
  /** AI grading still running; percentage / passed are not final. */
  grading_pending?: boolean;
  /** The server had already submitted the attempt because its time limit passed. */
  auto_submitted?: boolean;
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
    }): Promise<SubmitResult> => {
      // If using session auth, submit directly
      if (accessToken === 'session') {
        const { data: completed, error } = await supabase
          .from('candidate_assessments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', candidateAssessmentId)
          .select('access_token')
          .maybeSingle();

        throwDbError(error);

        // Same grading trigger as the link submit: notify-staff-complete queues
        // AI grading once and notifies recruiters once, so retries are safe.
        let gradingPending = false;
        if (completed?.access_token) {
          try {
            const notified = await invokePortal<{ data?: { grading_pending?: boolean } }>(
              {
                action: 'notify-staff-complete',
                access_token: completed.access_token,
                data: { candidate_assessment_id: candidateAssessmentId },
              },
              'Failed to notify the hiring team',
            );
            gradingPending = notified.data?.grading_pending === true;
          } catch (notifyError) {
            // The submit itself succeeded; the overdue sweep re-queues grading.
            console.warn('notify-staff-complete failed:', notifyError);
          }
        }

        return { percentage: null, passed: null, grading_pending: gradingPending };
      }

      // Otherwise use edge function
      const data = await invokePortal<{ data: SubmitResult }>(
        { action: 'submit', access_token: accessToken },
        'Failed to submit assessment',
      );
      return data.data;
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
      event: {
        type: string;
        timestamp: string;
        duration_seconds?: number;
        question_id?: string;
        question_index?: number;
        section_title?: string;
      };
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

/** The attempt's link token; signed-in applicants read it through RLS. */
export async function resolvePortalAccessToken(
  accessToken: string,
  candidateAssessmentId: string,
): Promise<string> {
  if (accessToken !== 'session') return accessToken;
  const { data, error } = await supabase
    .from('candidate_assessments')
    .select('access_token')
    .eq('id', candidateAssessmentId)
    .maybeSingle();
  if (error || !data?.access_token) {
    throw new Error('Unable to authorize file upload');
  }
  return data.access_token;
}

/** Create a signed upload for assessment file_upload answers (stores path, not public URL). */
export function useCreateAssessmentFileUpload() {
  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      questionId,
      file,
      accessToken,
    }: {
      candidateAssessmentId: string;
      questionId: string;
      file: File;
      accessToken: string;
    }) => {
      const token = await resolvePortalAccessToken(accessToken, candidateAssessmentId);

      const data = await invokePortal<{ data: unknown }>(
        {
          action: 'create-file-upload',
          access_token: token,
          data: {
            question_id: questionId,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
          },
        },
        'Failed to create upload URL',
      );

      const upload = data.data as {
        path: string;
        token: string;
        name: string;
        mime: string;
        size: number;
      };

      const { error: uploadError } = await supabase.storage
        .from('assessment-artifacts')
        .uploadToSignedUrl(upload.path, upload.token, file);

      if (uploadError) throw uploadError;

      return {
        path: upload.path,
        name: upload.name,
        mime: upload.mime,
        size: upload.size,
      };
    },
  });
}
