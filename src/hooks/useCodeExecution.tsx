import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

export interface TestResult {
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
  is_hidden: boolean;
  error?: string;
  execution_time?: number;
}

export interface ExecutionResult {
  success: boolean;
  results: TestResult[];
  passed_count: number;
  total_count: number;
  score_percentage: number;
  compilation_error?: string;
}

interface ExecuteCodeParams {
  code: string;
  language: string;
  test_cases?: TestCase[];
  question_id?: string;
  access_token?: string;
}

export function useExecuteCode() {
  return useMutation({
    mutationFn: async ({ code, language, test_cases, question_id, access_token }: ExecuteCodeParams): Promise<ExecutionResult> => {
      const { data, error } = await supabase.functions.invoke('execute-code', {
        body: { code, language, test_cases, question_id, access_token },
      });

      if (error) {
        throw new Error(error.message || 'Failed to execute code');
      }

      return data as ExecutionResult;
    },
  });
}
