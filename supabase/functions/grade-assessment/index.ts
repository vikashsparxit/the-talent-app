import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRADEABLE_TYPES = new Set(["subjective", "coding", "file_upload"]);
const GEMINI_CONCURRENCY = 3;
const MAX_FILE_BYTES_FOR_AI = 8 * 1024 * 1024;
const MULTIMODAL_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface GradeRequest {
  candidate_assessment_id?: string;
  all_pending?: boolean;
  /** When true, overwrite AI-only scores (auto_score with null manual_score). Never overwrites manual_score. */
  regrade?: boolean;
  /** Cap how many assessments to process when all_pending is true */
  limit?: number;
}

interface QuestionRow {
  id: string;
  type: string;
  question_text: string;
  marks: number;
  subjective_rubric: string | null;
  coding_language: string | null;
  coding_starter_code: string | null;
  coding_test_cases: Json;
}

interface ResponseRow {
  id: string;
  candidate_assessment_id: string;
  question_id: string;
  response: Json;
  auto_score: number | null;
  manual_score: number | null;
  final_score: number | null;
  feedback: string | null;
  question: QuestionRow | QuestionRow[] | null;
}

interface GradeResult {
  response_id: string;
  question_id: string;
  question_type: string;
  status: "graded" | "skipped" | "failed";
  reason?: string;
  score?: number;
  method?: "execution" | "ai" | "ai_multimodal" | "ai_link";
}

interface AssessmentGradeSummary {
  candidate_assessment_id: string;
  graded: number;
  skipped: number;
  failed: number;
  results: GradeResult[];
  error?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unwrapQuestion(q: ResponseRow["question"]): QuestionRow | null {
  if (!q) return null;
  if (Array.isArray(q)) return q[0] ?? null;
  return q;
}

function clampScore(score: number, maxMarks: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(maxMarks, Math.round(score * 100) / 100));
}

function extractTextAnswer(response: Json): string {
  if (response == null) return "";
  if (typeof response === "string") return response.trim();
  if (typeof response === "object" && !Array.isArray(response)) {
    const o = response as Record<string, unknown>;
    if (typeof o.answer === "string") return o.answer.trim();
    if (typeof o.text === "string") return o.text.trim();
  }
  return "";
}

function extractCode(response: Json): string {
  if (response == null) return "";
  if (typeof response === "string") return response;
  if (typeof response === "object" && !Array.isArray(response)) {
    const o = response as Record<string, unknown>;
    if (typeof o.code === "string") return o.code;
  }
  return "";
}

function extractExecutionScore(response: Json, maxMarks: number): number | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const er = (response as Record<string, unknown>).execution_result;
  if (!er || typeof er !== "object" || Array.isArray(er)) return null;
  const o = er as Record<string, unknown>;

  const passed = typeof o.passed_count === "number" ? o.passed_count : null;
  const total = typeof o.total_count === "number" ? o.total_count : null;
  if (passed != null && total != null && total > 0) {
    return clampScore((passed / total) * maxMarks, maxMarks);
  }

  const pct = typeof o.score_percentage === "number" ? o.score_percentage : null;
  if (pct != null) {
    return clampScore((pct / 100) * maxMarks, maxMarks);
  }

  return null;
}

function parseFileUpload(response: Json): {
  file?: { path: string; name: string; mime: string; size: number };
  link?: { url: string; label?: string };
} | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const o = response as Record<string, unknown>;
  if (o.mode !== "file" && o.mode !== "link" && o.mode !== "both") return null;
  const result: {
    file?: { path: string; name: string; mime: string; size: number };
    link?: { url: string; label?: string };
  } = {};
  if (o.file && typeof o.file === "object" && !Array.isArray(o.file)) {
    const f = o.file as Record<string, unknown>;
    if (
      typeof f.path === "string" &&
      typeof f.name === "string" &&
      typeof f.mime === "string" &&
      typeof f.size === "number"
    ) {
      result.file = { path: f.path, name: f.name, mime: f.mime, size: f.size };
    }
  }
  if (o.link && typeof o.link === "object" && !Array.isArray(o.link)) {
    const l = o.link as Record<string, unknown>;
    if (typeof l.url === "string") {
      result.link = {
        url: l.url,
        label: typeof l.label === "string" ? l.label : undefined,
      };
    }
  }
  return result.file || result.link ? result : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function callGeminiGrade(
  apiKey: string,
  model: string,
  prompt: string,
  maxMarks: number,
  filePart?: { mimeType: string; data: string },
): Promise<{ score: number; feedback: string }> {
  const parts: Array<Record<string, unknown>> = [];
  if (filePart) {
    parts.push({ inlineData: { mimeType: filePart.mimeType, data: filePart.data } });
  }
  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              "You are a fair, rigorous exam grader for a recruitment assessment. " +
              "Score only based on the question, rubric, and candidate submission. " +
              "Be concise. Do not invent facts not present in the answer. " +
              `Score must be between 0 and ${maxMarks} (max marks for this question).`,
          }],
        },
        contents: [{ role: "user", parts }],
        tools: [{
          functionDeclarations: [{
            name: "grade_response",
            description: "Return a numeric score and short feedback for one exam response",
            parameters: {
              type: "object",
              properties: {
                score: {
                  type: "number",
                  description: `Points awarded from 0 to ${maxMarks}`,
                },
                feedback: {
                  type: "string",
                  description: "Short feedback (1–3 sentences) explaining the score",
                },
              },
              required: ["score", "feedback"],
            },
          }],
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["grade_response"],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const fnCall = data?.candidates?.[0]?.content?.parts?.find(
    (p: { functionCall?: { name?: string; args?: unknown } }) => p.functionCall,
  )?.functionCall;

  if (!fnCall?.args) {
    throw new Error("No grade_response tool call from Gemini");
  }

  const args = typeof fnCall.args === "string" ? JSON.parse(fnCall.args) : fnCall.args;
  const score = clampScore(Number(args.score), maxMarks);
  const feedback = typeof args.feedback === "string" ? args.feedback.trim().slice(0, 500) : "";
  return { score, feedback: feedback || "AI graded." };
}

function shouldSkip(row: ResponseRow, regrade: boolean): string | null {
  if (row.manual_score != null) {
    return "human_graded";
  }
  if (!regrade && row.auto_score != null) {
    return "already_auto_scored";
  }
  const question = unwrapQuestion(row.question);
  if (!question) return "missing_question";
  if (!GRADEABLE_TYPES.has(question.type)) return "mcq_or_unsupported";
  return null;
}

async function gradeOneResponse(
  supabase: SupabaseClient,
  row: ResponseRow,
  apiKey: string,
  model: string,
  regrade: boolean,
): Promise<GradeResult> {
  const question = unwrapQuestion(row.question)!;
  const skip = shouldSkip(row, regrade);
  if (skip) {
    return {
      response_id: row.id,
      question_id: row.question_id,
      question_type: question.type,
      status: "skipped",
      reason: skip,
    };
  }

  const maxMarks = Number(question.marks) || 0;
  if (maxMarks <= 0) {
    return {
      response_id: row.id,
      question_id: row.question_id,
      question_type: question.type,
      status: "skipped",
      reason: "zero_marks",
    };
  }

  try {
    let score: number | null = null;
    let feedback = "";
    let method: GradeResult["method"] = "ai";

    if (question.type === "coding") {
      const execScore = extractExecutionScore(row.response, maxMarks);
      if (execScore != null) {
        score = execScore;
        const er = (row.response as Record<string, unknown>)?.execution_result as
          | Record<string, unknown>
          | undefined;
        const passed = er?.passed_count;
        const total = er?.total_count;
        feedback =
          typeof passed === "number" && typeof total === "number"
            ? `Auto-scored from test execution: ${passed}/${total} cases passed.`
            : `Auto-scored from test execution (${Math.round((execScore / maxMarks) * 100)}%).`;
        method = "execution";
      } else {
        const code = extractCode(row.response);
        if (!code.trim()) {
          score = 0;
          feedback = "No code submitted.";
          method = "ai";
        } else {
          const prompt = [
            `Question type: coding`,
            `Max marks: ${maxMarks}`,
            `Language: ${question.coding_language || "unspecified"}`,
            `Prompt:\n${question.question_text}`,
            question.subjective_rubric ? `Rubric:\n${question.subjective_rubric}` : "",
            `Candidate code:\n\`\`\`\n${code.slice(0, 12000)}\n\`\`\``,
            `Grade the code for correctness, completeness, and quality against the prompt. Return score 0–${maxMarks}.`,
          ].filter(Boolean).join("\n\n");
          const graded = await callGeminiGrade(apiKey, model, prompt, maxMarks);
          score = graded.score;
          feedback = graded.feedback;
          method = "ai";
        }
      }
    } else if (question.type === "subjective") {
      const answer = extractTextAnswer(row.response);
      if (!answer) {
        score = 0;
        feedback = "No answer submitted.";
        method = "ai";
      } else {
        const prompt = [
          `Question type: subjective`,
          `Max marks: ${maxMarks}`,
          `Question:\n${question.question_text}`,
          question.subjective_rubric ? `Rubric:\n${question.subjective_rubric}` : "No rubric provided — grade on relevance, clarity, and completeness.",
          `Candidate answer:\n${answer.slice(0, 8000)}`,
          `Return score 0–${maxMarks} and short feedback.`,
        ].join("\n\n");
        const graded = await callGeminiGrade(apiKey, model, prompt, maxMarks);
        score = graded.score;
        feedback = graded.feedback;
        method = "ai";
      }
    } else if (question.type === "file_upload") {
      const parsed = parseFileUpload(row.response);
      if (!parsed) {
        score = 0;
        feedback = "No file or link submitted.";
        method = "ai";
      } else if (parsed.file?.path && MULTIMODAL_MIMES.has(parsed.file.mime) && parsed.file.size <= MAX_FILE_BYTES_FOR_AI) {
        try {
          const { data: blob, error: dlError } = await supabase.storage
            .from("assessment-artifacts")
            .download(parsed.file.path);
          if (dlError || !blob) throw new Error(dlError?.message || "download failed");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const prompt = [
            `Question type: file_upload`,
            `Max marks: ${maxMarks}`,
            `Question:\n${question.question_text}`,
            question.subjective_rubric ? `Rubric:\n${question.subjective_rubric}` : "Grade based on whether the submission addresses the question.",
            parsed.link?.url ? `Also provided Drive link: ${parsed.link.url}` : "",
            `File name: ${parsed.file.name} (${parsed.file.mime}). Review the attached file and score 0–${maxMarks}.`,
          ].filter(Boolean).join("\n\n");
          const graded = await callGeminiGrade(apiKey, model, prompt, maxMarks, {
            mimeType: parsed.file.mime,
            data: bytesToBase64(bytes),
          });
          score = graded.score;
          feedback = graded.feedback;
          method = "ai_multimodal";
        } catch (fileErr) {
          console.error("file multimodal grade failed, falling back:", fileErr);
          // Fall through to link/context grade
          const prompt = [
            `Question type: file_upload (file could not be loaded for multimodal review)`,
            `Max marks: ${maxMarks}`,
            `Question:\n${question.question_text}`,
            question.subjective_rubric ? `Rubric:\n${question.subjective_rubric}` : "",
            `File metadata: name=${parsed.file.name}, mime=${parsed.file.mime}, size=${parsed.file.size}`,
            parsed.link?.url ? `Drive link: ${parsed.link.url}` : "No Drive link.",
            `Give a conservative score 0–${maxMarks} based only on available context, or 0 if insufficient.`,
          ].filter(Boolean).join("\n\n");
          const graded = await callGeminiGrade(apiKey, model, prompt, maxMarks);
          score = graded.score;
          feedback = `File review limited: ${graded.feedback}`;
          method = "ai";
        }
      } else if (parsed.link?.url) {
        const prompt = [
          `Question type: file_upload (Google Drive / Docs link only — you cannot open the file)`,
          `Max marks: ${maxMarks}`,
          `Question:\n${question.question_text}`,
          question.subjective_rubric ? `Rubric:\n${question.subjective_rubric}` : "",
          `Candidate shared link: ${parsed.link.url}`,
          parsed.link.label ? `Link label: ${parsed.link.label}` : "",
          `You cannot access Drive contents. Award a light partial score only if the link appears relevant (valid share URL for the ask); otherwise score 0 and note that staff should review the file. Score 0–${maxMarks}.`,
        ].filter(Boolean).join("\n\n");
        const graded = await callGeminiGrade(apiKey, model, prompt, maxMarks);
        score = graded.score;
        feedback = graded.feedback;
        method = "ai_link";
      } else if (parsed.file) {
        // File present but unsupported mime / too large
        score = null;
        return {
          response_id: row.id,
          question_id: row.question_id,
          question_type: question.type,
          status: "skipped",
          reason: "file_unsupported_or_too_large",
        };
      }
    }

    if (score == null) {
      return {
        response_id: row.id,
        question_id: row.question_id,
        question_type: question.type,
        status: "skipped",
        reason: "unable_to_score",
      };
    }

    const { error: updateError } = await supabase
      .from("candidate_responses")
      .update({
        auto_score: score,
        feedback: feedback || null,
        // Leave manual_score null so Edit can override via COALESCE(manual, auto)
      })
      .eq("id", row.id)
      .is("manual_score", null);

    if (updateError) throw updateError;

    return {
      response_id: row.id,
      question_id: row.question_id,
      question_type: question.type,
      status: "graded",
      score,
      method,
    };
  } catch (e) {
    console.error(`grade response ${row.id} failed:`, e);
    return {
      response_id: row.id,
      question_id: row.question_id,
      question_type: question.type,
      status: "failed",
      reason: e instanceof Error ? e.message : "unknown_error",
    };
  }
}

async function gradeAssessment(
  supabase: SupabaseClient,
  candidateAssessmentId: string,
  apiKey: string,
  model: string,
  regrade: boolean,
): Promise<AssessmentGradeSummary> {
  const { data: rows, error } = await supabase
    .from("candidate_responses")
    .select(`
      id,
      candidate_assessment_id,
      question_id,
      response,
      auto_score,
      manual_score,
      final_score,
      feedback,
      question:questions(
        id, type, question_text, marks, subjective_rubric,
        coding_language, coding_starter_code, coding_test_cases
      )
    `)
    .eq("candidate_assessment_id", candidateAssessmentId);

  if (error) {
    return {
      candidate_assessment_id: candidateAssessmentId,
      graded: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: error.message,
    };
  }

  const targets = ((rows || []) as ResponseRow[]).filter((r) => {
    const q = unwrapQuestion(r.question);
    return q && GRADEABLE_TYPES.has(q.type);
  });

  const results = await mapPool(targets, GEMINI_CONCURRENCY, (row) =>
    gradeOneResponse(supabase, row, apiKey, model, regrade)
  );

  const graded = results.filter((r) => r.status === "graded").length;
  if (graded > 0) {
    const { error: rpcError } = await supabase.rpc("calculate_assessment_total_score", {
      _candidate_assessment_id: candidateAssessmentId,
    });
    if (rpcError) {
      console.error("calculate_assessment_total_score failed:", rpcError);
    }
  }

  return {
    candidate_assessment_id: candidateAssessmentId,
    graded,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

async function findPendingAssessmentIds(
  supabase: SupabaseClient,
  regrade: boolean,
  limit: number,
): Promise<string[]> {
  // Pull completed/evaluated assessments; filter those with gradeable unscored responses
  const { data: assessments, error } = await supabase
    .from("candidate_assessments")
    .select("id")
    .in("status", ["completed", "evaluated"])
    .order("completed_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error || !assessments?.length) return [];

  const ids: string[] = [];
  for (const a of assessments) {
    const { data: responses } = await supabase
      .from("candidate_responses")
      .select(`
        id, auto_score, manual_score,
        question:questions(type)
      `)
      .eq("candidate_assessment_id", a.id);

    const needs = (responses || []).some((r: ResponseRow) => {
      const q = unwrapQuestion(r.question);
      if (!q || !GRADEABLE_TYPES.has(q.type)) return false;
      if (r.manual_score != null) return false;
      if (regrade) return true;
      return r.auto_score == null;
    });

    if (needs) ids.push(a.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await requireStaff(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as GradeRequest;
    const regrade = Boolean(body.regrade);
    const allPending = Boolean(body.all_pending);
    const limit = typeof body.limit === "number" ? body.limit : 20;

    if (!allPending && !body.candidate_assessment_id) {
      return jsonResponse(
        { error: "Provide candidate_assessment_id or all_pending: true" },
        400,
      );
    }

    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "Gemini API key not configured" }, 500);
    }
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    let assessmentIds: string[] = [];
    if (allPending) {
      assessmentIds = await findPendingAssessmentIds(supabase, regrade, limit);
    } else if (body.candidate_assessment_id) {
      assessmentIds = [body.candidate_assessment_id];
    }

    if (assessmentIds.length === 0) {
      return jsonResponse({
        success: true,
        message: "No assessments need AI grading",
        assessments: [],
      });
    }

    // Process assessments sequentially to avoid Gemini/timeout pile-up;
    // within each assessment, questions run with limited concurrency.
    const summaries: AssessmentGradeSummary[] = [];
    for (const id of assessmentIds) {
      summaries.push(await gradeAssessment(supabase, id, apiKey, model, regrade));
    }

    const totals = summaries.reduce(
      (acc, s) => {
        acc.graded += s.graded;
        acc.skipped += s.skipped;
        acc.failed += s.failed;
        return acc;
      },
      { graded: 0, skipped: 0, failed: 0 },
    );

    return jsonResponse({
      success: true,
      regrade,
      assessment_count: summaries.length,
      totals,
      assessments: summaries,
    });
  } catch (e) {
    console.error("grade-assessment error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
