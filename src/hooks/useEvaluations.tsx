import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { upgradeSkillsFromAssessment } from '@/hooks/useSkillUpgrade';
import type { 
  CandidateResponse, 
  Question,
  MCQOption,
  CodingTestCase
} from '@/types/database';
import type { Json } from '@/integrations/supabase/types';

// Helper functions for parsing JSON
const parseOptions = (options: Json | null): MCQOption[] | undefined => {
  if (!options || !Array.isArray(options)) return undefined;
  return options.map((opt, index) => {
    if (typeof opt === 'object' && opt !== null && !Array.isArray(opt)) {
      const o = opt as Record<string, unknown>;
      return {
        id: String(o.id || index),
        text: String(o.text || ''),
        is_correct: Boolean(o.is_correct),
      };
    }
    return { id: String(index), text: String(opt), is_correct: false };
  });
};

const parseTestCases = (testCases: Json | null): CodingTestCase[] | undefined => {
  if (!testCases || !Array.isArray(testCases)) return undefined;
  return testCases.map(tc => {
    if (typeof tc === 'object' && tc !== null && !Array.isArray(tc)) {
      const t = tc as Record<string, unknown>;
      return {
        input: String(t.input || ''),
        expected_output: String(t.expected_output || ''),
        is_hidden: Boolean(t.is_hidden),
      };
    }
    return { input: '', expected_output: '', is_hidden: false };
  });
};

export interface EvaluationListItem {
  id: string;
  candidate_id: string;
  assessment_id: string;
  job_id: string | null;
  access_token: string;
  status: string;
  invited_at: string;
  deadline: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  integrity_log: unknown[];
  created_at: string;
  updated_at: string;
  candidate: {
    id: string;
    name: string;
    email: string;
    job_id: string | null;
  } | null;
  assessment: {
    id: string;
    title: string;
    passing_score: number;
  } | null;
}

export function usePendingEvaluations() {
  const { isInterviewer, isAdminOrHR, isRecruiter } = useAuth();
  // Interviewer-only users: RLS is source of truth; job filter is defense-in-depth.
  const interviewerOnly = isInterviewer && !isAdminOrHR && !isRecruiter;

  return useQuery({
    queryKey: ['pending-evaluations', interviewerOnly],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_assessments')
        .select(`
          *,
          candidate:candidates(id, name, email, job_id),
          assessment:assessments(id, title, passing_score)
        `)
        .in('status', ['completed', 'evaluated'])
        .order('completed_at', { ascending: false });

      if (error) throw error;

      let rows = data ?? [];

      if (interviewerOnly) {
        const { data: assignedJobs, error: jobsError } = await supabase
          .from('jobs')
          .select('id');
        if (jobsError) throw jobsError;
        const assignedJobIds = new Set((assignedJobs ?? []).map((j) => j.id));
        rows = rows.filter((item) => {
          const jobId = item.job_id ?? item.candidate?.job_id ?? null;
          if (jobId) return assignedJobIds.has(jobId);
          // No job on row: keep only if candidate embed passed RLS (assigned candidate).
          return item.candidate != null;
        });
      }

      return rows.map(item => ({
        ...item,
        integrity_log: Array.isArray(item.integrity_log) ? item.integrity_log : [],
      })) as EvaluationListItem[];
    },
  });
}

export interface EvaluationDetails {
  candidateAssessment: {
    id: string;
    candidate_id: string;
    assessment_id: string;
    status: string;
    invited_at: string;
    started_at: string | null;
    completed_at: string | null;
    total_score: number | null;
    percentage: number | null;
    passed: boolean | null;
    integrity_log: unknown[];
    evaluator_notes: string | null;
    candidate: { id: string; name: string; email: string } | null;
    assessment: { id: string; title: string; passing_score: number; duration_minutes: number } | null;
  };
  responses: (CandidateResponse & { question: Question })[];
  allQuestions: Question[];
  totalMarks: number;
  earnedMarks: number;
}

export function useEvaluationDetails(candidateAssessmentId: string | undefined) {
  return useQuery({
    queryKey: ['evaluation', candidateAssessmentId],
    queryFn: async (): Promise<EvaluationDetails | null> => {
      if (!candidateAssessmentId) return null;

      // Fetch candidate assessment with candidate and assessment details
      const { data: caData, error: caError } = await supabase
        .from('candidate_assessments')
        .select(`
          *,
          candidate:candidates(id, name, email),
          assessment:assessments(id, title, passing_score, duration_minutes)
        `)
        .eq('id', candidateAssessmentId)
        .single();

      if (caError) throw caError;

      // Fetch responses with questions
      const { data: responsesData, error: responsesError } = await supabase
        .from('candidate_responses')
        .select(`
          *,
          question:questions(*)
        `)
        .eq('candidate_assessment_id', candidateAssessmentId)
        .order('created_at');

      if (responsesError) throw responsesError;

      // Fetch ALL questions for this assessment (including unanswered)
      const { data: allQuestionsData, error: allQError } = await supabase
        .from('assessment_sections')
        .select(`
          id, title, order_index,
          questions(*)
        `)
        .eq('assessment_id', caData.assessment_id)
        .order('order_index');

      if (allQError) throw allQError;

      // Flatten all questions with section info
      const allQuestions = (allQuestionsData || [])
        .sort((a, b) => a.order_index - b.order_index)
        .flatMap(section =>
          (section.questions || [])
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((q: any) => ({
              ...q,
              type: q.type as Question['type'],
              options: parseOptions(q.options),
              coding_test_cases: parseTestCases(q.coding_test_cases),
              _sectionTitle: section.title,
            }))
        ) as (Question & { _sectionTitle: string })[];

      // Parse question data in responses
      const responses = responsesData.map(r => ({
        ...r,
        question: r.question ? {
          ...r.question,
          type: r.question.type as Question['type'],
          options: parseOptions(r.question.options),
          coding_test_cases: parseTestCases(r.question.coding_test_cases),
        } : undefined,
      })) as (CandidateResponse & { question: Question })[];

      // Calculate totals based on ALL questions, not just responded ones
      const totalMarks = allQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
      const earnedMarks = responses.reduce((sum, r) => sum + (r.final_score || 0), 0);

      return {
        candidateAssessment: {
          ...caData,
          integrity_log: Array.isArray(caData.integrity_log) ? caData.integrity_log : [],
          evaluator_notes: (caData as any).evaluator_notes ?? null,
        },
        responses,
        allQuestions,
        totalMarks,
        earnedMarks,
      } as EvaluationDetails;
    },
    enabled: !!candidateAssessmentId,
  });
}

export function useGradeResponse() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      responseId,
      manualScore,
      feedback,
      candidateAssessmentId,
    }: {
      responseId: string;
      manualScore: number;
      feedback?: string;
      candidateAssessmentId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('candidate_responses')
        .update({
          manual_score: manualScore,
          feedback,
          evaluated_by: user?.id,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', responseId);

      if (error) throw error;

      // Recalculate total score
      const { error: rpcError } = await supabase.rpc('calculate_assessment_total_score', {
        _candidate_assessment_id: candidateAssessmentId,
      });

      if (rpcError) throw rpcError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['pending-evaluations'] });
      toast({ title: 'Response graded successfully' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to grade response',
        description: error.message,
      });
    },
  });
}

// New hook: create a response record for an unanswered question so evaluator can grade it
export function useCreateResponseForGrading() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      questionId,
      manualScore,
      feedback,
    }: {
      candidateAssessmentId: string;
      questionId: string;
      manualScore: number;
      feedback?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Check if a response record already exists for this question
      const { data: existing } = await supabase
        .from('candidate_responses')
        .select('id')
        .eq('candidate_assessment_id', candidateAssessmentId)
        .eq('question_id', questionId)
        .maybeSingle();

      if (existing) {
        // Update existing response
        const { error } = await supabase
          .from('candidate_responses')
          .update({
            manual_score: manualScore,
            final_score: manualScore,
            feedback,
            evaluated_by: user?.id,
            evaluated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert a new response record with manual score
        const { error } = await supabase
          .from('candidate_responses')
          .insert({
            candidate_assessment_id: candidateAssessmentId,
            question_id: questionId,
            manual_score: manualScore,
            final_score: manualScore,
            feedback,
            evaluated_by: user?.id,
            evaluated_at: new Date().toISOString(),
          });
        if (error) throw error;
      }

      // Recalculate total score
      const { error: rpcError } = await supabase.rpc('calculate_assessment_total_score', {
        _candidate_assessment_id: candidateAssessmentId,
      });

      if (rpcError) throw rpcError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['pending-evaluations'] });
      toast({ title: 'Score assigned successfully' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to assign score',
        description: error.message,
      });
    },
  });
}

export function useAiGradeAssessment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      regrade = false,
    }: {
      candidateAssessmentId: string;
      regrade?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('grade-assessment', {
        body: {
          candidate_assessment_id: candidateAssessmentId,
          regrade,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        success: boolean;
        totals?: { graded: number; skipped: number; failed: number };
        assessments?: Array<{ graded: number; skipped: number; failed: number }>;
      };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['pending-evaluations'] });
      const totals = data.totals ?? data.assessments?.[0];
      const graded = totals?.graded ?? 0;
      const failed = totals?.failed ?? 0;
      toast({
        title: graded > 0 ? 'AI grading complete' : 'Nothing new to grade',
        description:
          failed > 0
            ? `Graded ${graded} question(s); ${failed} failed. You can retry or edit manually.`
            : graded > 0
              ? `Updated scores for ${graded} question(s). Review and override via Edit if needed.`
              : 'Unscored non-MCQ questions were already graded, human-scored, or skipped.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'AI grading failed',
        description: error.message,
      });
    },
  });
}

export function useMarkAsEvaluated() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidateAssessmentId: string) => {
      const { error } = await supabase
        .from('candidate_assessments')
        .update({ status: 'evaluated' })
        .eq('id', candidateAssessmentId);

      if (error) throw error;

      // Phase 3: Upgrade candidate skills based on assessment performance
      await upgradeSkillsFromAssessment(candidateAssessmentId);
    },
    onSuccess: (_, candidateAssessmentId) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['pending-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Evaluation completed' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to complete evaluation',
        description: error.message,
      });
    },
  });
}

export function useOverrideResult() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      passed,
    }: {
      candidateAssessmentId: string;
      passed: boolean;
    }) => {
      const { error } = await supabase
        .from('candidate_assessments')
        .update({ passed })
        .eq('id', candidateAssessmentId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.candidateAssessmentId] });
      queryClient.invalidateQueries({ queryKey: ['pending-evaluations'] });
      toast({ title: `Result overridden to ${variables.passed ? 'Passed' : 'Failed'}` });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to override result',
        description: error.message,
      });
    },
  });
}

export function useSaveEvaluatorNotes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      candidateAssessmentId,
      notes,
    }: {
      candidateAssessmentId: string;
      notes: string;
    }) => {
      const { error } = await supabase
        .from('candidate_assessments')
        .update({ evaluator_notes: notes } as any)
        .eq('id', candidateAssessmentId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.candidateAssessmentId] });
      toast({ title: 'Notes saved' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save notes',
        description: error.message,
      });
    },
  });
}
