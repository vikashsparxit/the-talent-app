import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { 
  Assessment, 
  AssessmentSection, 
  Question, 
  AssessmentWithDetails,
  AssessmentSettings,
  MCQOption,
  CodingTestCase,
  QuestionFileConfig,
} from '@/types/database';
import type { Json } from '@/integrations/supabase/types';
import { parseFileConfig } from '@/lib/assessmentFileUpload';

// Helper to safely cast JSON to AssessmentSettings
const parseSettings = (settings: Json | null): AssessmentSettings => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {
      randomize_questions: false,
      show_score_immediately: false,
      allow_review: false,
    };
  }
  const s = settings as Record<string, unknown>;
  return {
    randomize_questions: Boolean(s.randomize_questions),
    show_score_immediately: Boolean(s.show_score_immediately),
    allow_review: Boolean(s.allow_review),
  };
};

// Helper to safely cast JSON to MCQOption[]
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

// Helper to safely cast JSON to CodingTestCase[]
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

export function useAssessments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(a => ({
        ...a,
        settings: parseSettings(a.settings)
      })) as Assessment[];
    },
  });

  const createAssessment = useMutation({
    mutationFn: async (assessment: {
      title: string;
      description?: string;
      duration_minutes?: number;
      passing_score?: number;
      status?: 'draft' | 'active' | 'archived';
      settings?: AssessmentSettings;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('assessments')
        .insert({
          title: assessment.title,
          description: assessment.description,
          duration_minutes: assessment.duration_minutes ?? 60,
          passing_score: assessment.passing_score ?? 60,
          status: assessment.status ?? 'draft',
          settings: assessment.settings as unknown as Json,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast({ title: 'Assessment created successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to create assessment', 
        description: error.message 
      });
    },
  });

  const updateAssessment = useMutation({
    mutationFn: async ({ id, settings, ...updates }: { 
      id: string; 
      title?: string;
      description?: string;
      duration_minutes?: number;
      passing_score?: number;
      status?: 'draft' | 'active' | 'archived';
      settings?: AssessmentSettings;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (settings) {
        updateData.settings = settings as unknown as Json;
      }
      
      const { data, error } = await supabase
        .from('assessments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast({ title: 'Assessment updated successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to update assessment', 
        description: error.message 
      });
    },
  });

  const deleteAssessment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast({ title: 'Assessment deleted successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to delete assessment', 
        description: error.message 
      });
    },
  });

  return {
    assessments: assessmentsQuery.data ?? [],
    isLoading: assessmentsQuery.isLoading,
    error: assessmentsQuery.error,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    refetch: assessmentsQuery.refetch,
  };
}

export function useAssessmentDetails(assessmentId: string | undefined) {
  return useQuery({
    queryKey: ['assessment', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return null;

      const { data: assessment, error: assessmentError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();
      
      if (assessmentError) throw assessmentError;

      const { data: sections, error: sectionsError } = await supabase
        .from('assessment_sections')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('order_index');
      
      if (sectionsError) throw sectionsError;

      const sectionIds = sections.map(s => s.id);
      
      let questions: Question[] = [];
      if (sectionIds.length > 0) {
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .in('section_id', sectionIds)
          .order('order_index');
        
        if (questionsError) throw questionsError;
        
        questions = questionsData.map(q => ({
          ...q,
          type: q.type as Question['type'],
          options: parseOptions(q.options),
          correct_answer: q.correct_answer,
          coding_test_cases: parseTestCases(q.coding_test_cases),
          file_config: q.file_config
            ? parseFileConfig(q.file_config)
            : q.type === 'file_upload'
              ? parseFileConfig(null)
              : null,
        })) as Question[];
      }

      const sectionsWithQuestions = sections.map(section => ({
        ...section,
        questions: questions.filter(q => q.section_id === section.id),
      }));

      return {
        ...assessment,
        settings: parseSettings(assessment.settings),
        sections: sectionsWithQuestions,
      } as AssessmentWithDetails;
    },
    enabled: !!assessmentId,
  });
}

export function useSections(assessmentId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createSection = useMutation({
    mutationFn: async (section: {
      assessment_id: string;
      title: string;
      description?: string;
      order_index?: number;
      weightage?: number;
      skill_tags?: string[];
    }) => {
      const { skill_tags, ...rest } = section;
      const insertData: Record<string, unknown> = { ...rest };
      if (skill_tags && skill_tags.length > 0) {
        insertData.skill_tags = skill_tags as unknown as Json;
      }
      const { data, error } = await supabase
        .from('assessment_sections')
        .insert(insertData as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast({ title: 'Section added successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to add section', 
        description: error.message 
      });
    },
  });

  const updateSection = useMutation({
    mutationFn: async ({ id, skill_tags, ...updates }: { 
      id: string;
      title?: string;
      description?: string;
      order_index?: number;
      weightage?: number;
      skill_tags?: string[];
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (skill_tags !== undefined) {
        updateData.skill_tags = skill_tags as unknown as Json;
      }
      const { data, error } = await supabase
        .from('assessment_sections')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast({ title: 'Section updated successfully' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update section',
        description: error.message,
      });
    },
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assessment_sections')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast({ title: 'Section deleted successfully' });
    },
  });

  return { createSection, updateSection, deleteSection };
}

export function useQuestions(assessmentId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createQuestion = useMutation({
    mutationFn: async (question: {
      section_id: string;
      type: 'mcq' | 'coding' | 'subjective' | 'file_upload';
      question_text: string;
      options?: MCQOption[];
      correct_answer?: unknown;
      marks?: number;
      order_index?: number;
      coding_language?: string;
      coding_starter_code?: string;
      coding_test_cases?: CodingTestCase[];
      subjective_max_words?: number;
      subjective_rubric?: string;
      file_config?: QuestionFileConfig | null;
    }) => {
      const { data, error } = await supabase
        .from('questions')
        .insert({
          section_id: question.section_id,
          type: question.type,
          question_text: question.question_text,
          options: question.options as unknown as Json,
          correct_answer: question.correct_answer as Json,
          marks: question.marks ?? 1,
          order_index: question.order_index ?? 0,
          coding_language: question.coding_language,
          coding_starter_code: question.coding_starter_code,
          coding_test_cases: question.coding_test_cases as unknown as Json,
          subjective_max_words: question.subjective_max_words,
          subjective_rubric: question.subjective_rubric,
          file_config: question.file_config as unknown as Json,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast({ title: 'Question added successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to add question', 
        description: error.message 
      });
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, options, coding_test_cases, correct_answer, file_config, ...updates }: { 
      id: string;
      section_id?: string;
      type?: 'mcq' | 'coding' | 'subjective' | 'file_upload';
      question_text?: string;
      options?: MCQOption[];
      correct_answer?: unknown;
      marks?: number;
      order_index?: number;
      coding_language?: string;
      coding_starter_code?: string;
      coding_test_cases?: CodingTestCase[];
      subjective_max_words?: number;
      subjective_rubric?: string;
      file_config?: QuestionFileConfig | null;
    }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (options !== undefined) updateData.options = options as unknown as Json;
      if (coding_test_cases !== undefined) updateData.coding_test_cases = coding_test_cases as unknown as Json;
      if (correct_answer !== undefined) updateData.correct_answer = correct_answer as Json;
      if (file_config !== undefined) updateData.file_config = file_config as unknown as Json;
      
      const { data, error } = await supabase
        .from('questions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast({ title: 'Question deleted successfully' });
    },
  });

  return { createQuestion, updateQuestion, deleteQuestion };
}
