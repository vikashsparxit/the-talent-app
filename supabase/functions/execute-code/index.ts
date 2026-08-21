import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-access-token',
};

// Piston API endpoint (free, no API key required)
const PISTON_API = 'https://emkc.org/api/v2/piston';

// Language mappings for Piston API
const languageMap: Record<string, { language: string; version: string }> = {
  'javascript': { language: 'javascript', version: '18.15.0' },
  'python': { language: 'python', version: '3.10.0' },
  'java': { language: 'java', version: '15.0.2' },
  'cpp': { language: 'c++', version: '10.2.0' },
  'c': { language: 'c', version: '10.2.0' },
  'typescript': { language: 'typescript', version: '5.0.3' },
  'go': { language: 'go', version: '1.16.2' },
  'rust': { language: 'rust', version: '1.68.2' },
  'ruby': { language: 'ruby', version: '3.0.1' },
  'php': { language: 'php', version: '8.2.3' },
  'csharp': { language: 'csharp', version: '6.12.0' },
  'kotlin': { language: 'kotlin', version: '1.8.20' },
  'swift': { language: 'swift', version: '5.3.3' },
};

interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

interface ExecuteRequest {
  code: string;
  language: string;
  test_cases?: TestCase[];
  question_id?: string;
  access_token?: string;
}

interface TestResult {
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
  is_hidden: boolean;
  error?: string;
  execution_time?: number;
}

interface ExecuteResponse {
  success: boolean;
  results: TestResult[];
  passed_count: number;
  total_count: number;
  score_percentage: number;
  compilation_error?: string;
}

async function executeCode(code: string, language: string, stdin: string): Promise<{ output: string; error?: string; time?: number }> {
  const langConfig = languageMap[language.toLowerCase()];
  
  if (!langConfig) {
    return { output: '', error: `Unsupported language: ${language}` };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s hard timeout

    let response: Response;
    try {
      response = await fetch(`${PISTON_API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          language: langConfig.language,
          version: langConfig.version,
          files: [{ content: code }],
          stdin,
          run_timeout: 10000, // 10 second timeout inside Piston
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Piston API error:', errorText);
      return { output: '', error: `Execution service error: ${response.status}` };
    }

    const result = await response.json();
    console.log('Piston result:', JSON.stringify(result));

    // Check for compilation errors
    if (result.compile && result.compile.code !== 0) {
      return { 
        output: '', 
        error: result.compile.stderr || result.compile.output || 'Compilation error' 
      };
    }

    // Check for runtime errors
    if (result.run && result.run.code !== 0 && result.run.stderr) {
      return { 
        output: result.run.output || '', 
        error: result.run.stderr,
        time: result.run.time ? parseFloat(result.run.time) * 1000 : undefined
      };
    }

    return { 
      output: result.run?.output?.trim() || '',
      time: result.run?.time ? parseFloat(result.run.time) * 1000 : undefined
    };
  } catch (err) {
    console.error('Execution error:', err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { output: '', error: 'Execution timed out (15s limit exceeded)' };
    }
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { output: '', error: `Execution failed: ${errorMessage}` };
  }
}

function normalizeOutput(output: string): string {
  return output.trim().replace(/\r\n/g, '\n').replace(/\s+$/gm, '');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ExecuteRequest = await req.json();
    const { code, language, test_cases: providedTestCases, question_id, access_token } = body;

    console.log(`Executing ${language} code`);

    if (!code || !language) {
      return new Response(
        JSON.stringify({ error: 'Code and language are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authentication check: require either access_token or Authorization header
    const authHeader = req.headers.get('Authorization');
    let isAuthenticated = false;
    let candidateAssessmentId: string | null = null;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check access token for candidate portal
    if (access_token) {
      const { data: ca } = await supabaseAdmin
        .from('candidate_assessments')
        .select('id, status, assessment_id, token_expires_at')
        .eq('access_token', access_token)
        .eq('status', 'in_progress')
        .maybeSingle();

      if (ca) {
        // Reject expired tokens
        if (ca.token_expires_at && new Date(ca.token_expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ error: 'Assessment token has expired. Please contact your recruiter.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        isAuthenticated = true;
        candidateAssessmentId = ca.id;
      }
    }

    // Check JWT for authenticated users (admin/HR)
    if (!isAuthenticated && authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.replace('Bearer ', '');
      const { data } = await supabaseAdmin.auth.getUser(jwt);
      if (data?.user) {
        // Verify user has admin/HR role
        const { data: hasRole } = await supabaseAdmin.rpc('is_admin_or_hr', { _user_id: data.user.id });
        if (hasRole) {
          isAuthenticated = true;
        }
      }
    }

    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get test cases from database if question_id provided (for candidates)
    let test_cases: TestCase[] = providedTestCases || [];
    
    if (question_id && candidateAssessmentId) {
      // Fetch test cases from database for this question
      const { data: question } = await supabaseAdmin
        .from('questions')
        .select('coding_test_cases')
        .eq('id', question_id)
        .single();

      if (question?.coding_test_cases && Array.isArray(question.coding_test_cases)) {
        test_cases = question.coding_test_cases.map((tc: Record<string, unknown>) => ({
          input: String(tc.input ?? ''),
          expected_output: String(tc.expected_output ?? ''),
          is_hidden: Boolean(tc.is_hidden ?? false),
        }));
      }
    }

    if (!test_cases || test_cases.length === 0) {
      // If no test cases, just run the code
      const result = await executeCode(code, language, '');
      return new Response(
        JSON.stringify({
          success: !result.error,
          results: [{
            input: '',
            expected_output: '',
            actual_output: result.output,
            passed: true,
            is_hidden: false,
            error: result.error,
            execution_time: result.time,
          }],
          passed_count: result.error ? 0 : 1,
          total_count: 1,
          score_percentage: result.error ? 0 : 100,
          compilation_error: result.error,
        } as ExecuteResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: TestResult[] = [];
    let passedCount = 0;

    for (const testCase of test_cases) {
      const result = await executeCode(code, language, testCase.input);
      
      const actualOutput = normalizeOutput(result.output);
      const expectedOutput = normalizeOutput(testCase.expected_output);
      const passed = !result.error && actualOutput === expectedOutput;

      if (passed) passedCount++;

      results.push({
        input: testCase.input,
        expected_output: testCase.expected_output,
        actual_output: result.output,
        passed,
        is_hidden: testCase.is_hidden,
        error: result.error,
        execution_time: result.time,
      });

      // If there's a compilation error, it applies to all test cases
      if (result.error && result.error.includes('Compilation')) {
        // Fill remaining results with same error
        for (let i = results.length; i < test_cases.length; i++) {
          results.push({
            input: test_cases[i].input,
            expected_output: test_cases[i].expected_output,
            actual_output: '',
            passed: false,
            is_hidden: test_cases[i].is_hidden,
            error: result.error,
          });
        }
        break;
      }
    }

    const response: ExecuteResponse = {
      success: passedCount === test_cases.length,
      results,
      passed_count: passedCount,
      total_count: test_cases.length,
      score_percentage: Math.round((passedCount / test_cases.length) * 100),
    };

    console.log(`Execution complete: ${passedCount}/${test_cases.length} passed`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Handler error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
