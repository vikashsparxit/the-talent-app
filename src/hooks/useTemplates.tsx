import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import type { AssessmentWithDetails, AssessmentSection, Question } from '@/types/database';

export interface TemplateData {
  title: string;
  description: string | null;
  duration_minutes: number;
  passing_score: number;
  settings: Record<string, unknown>;
  sections: Array<{
    title: string;
    description: string | null;
    order_index: number;
    weightage: number;
    questions: Array<{
      type: 'mcq' | 'coding' | 'subjective' | 'file_upload';
      question_text: string;
      marks: number;
      order_index: number;
      options?: unknown;
      correct_answer?: unknown;
      coding_language?: string | null;
      coding_starter_code?: string | null;
      coding_test_cases?: unknown;
      subjective_max_words?: number | null;
      subjective_rubric?: string | null;
      file_config?: unknown;
    }>;
  }>;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  template_data: TemplateData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(d => ({
        ...d,
        template_data: d.template_data as unknown as TemplateData,
      })) as Template[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string;
      template_data: TemplateData;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const insertData = {
        name: template.name,
        description: template.description,
        template_data: template.template_data as unknown,
        created_by: user?.id,
      };
      
      const { data, error } = await supabase
        .from('assessment_templates')
        .insert({
          name: template.name,
          description: template.description,
          template_data: template.template_data as unknown as Json,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Template saved successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to save template', 
        description: error.message 
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assessment_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Template deleted successfully' });
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to delete template', 
        description: error.message 
      });
    },
  });

  return {
    templates: templatesQuery.data ?? [],
    isLoading: templatesQuery.isLoading,
    error: templatesQuery.error,
    createTemplate,
    deleteTemplate,
    refetch: templatesQuery.refetch,
  };
}

// Helper to convert an assessment to template data
export function assessmentToTemplateData(assessment: AssessmentWithDetails): TemplateData {
  const settings = assessment.settings as unknown as Record<string, unknown>;
  return {
    title: assessment.title,
    description: assessment.description,
    duration_minutes: assessment.duration_minutes,
    passing_score: assessment.passing_score,
    settings: settings,
    sections: assessment.sections.map(section => ({
      title: section.title,
      description: section.description,
      order_index: section.order_index,
      weightage: section.weightage,
      questions: section.questions.map(q => ({
        type: q.type,
        question_text: q.question_text,
        marks: q.marks,
        order_index: q.order_index,
        options: q.options,
        correct_answer: q.correct_answer,
        coding_language: q.coding_language,
        coding_starter_code: q.coding_starter_code,
        coding_test_cases: q.coding_test_cases,
        subjective_max_words: q.subjective_max_words,
        subjective_rubric: q.subjective_rubric,
        file_config: q.file_config ?? null,
      })),
    })),
  };
}
