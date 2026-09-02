import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { extractResumePlainText } from "../_shared/resume.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveStageKey(stageName?: string | null): string {
  if (!stageName) return "general";
  const n = stageName.toLowerCase();
  if (/screen|phone|initial|recruiter|prescreen/.test(n)) return "screening";
  if (/tech|coding|system|engineering|dev|architect/.test(n)) return "technical";
  if (/manager|lead|director|panel|leadership/.test(n)) return "managerial";
  if (/\bhr\b|culture|final|offer/.test(n)) return "hr_final";
  return "general";
}

function joinList(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map(String).join(", ");
}

function buildJobContext(job: Record<string, unknown> | null | undefined): string {
  if (!job) return "";
  const requiredSkills = joinList(job.required_skills);
  const benefits = joinList(job.benefits);
  return [
    job.title && `Job Title: ${job.title}`,
    job.department && `Department: ${job.department}`,
    job.location && `Location: ${job.location}`,
    job.job_type && `Job Type: ${String(job.job_type).replace("_", " ")}`,
    job.experience_level && `Experience Level: ${job.experience_level}`,
    job.experience_years_range && `Experience Range: ${job.experience_years_range}`,
    job.description && `Description:\n${job.description}`,
    requiredSkills && `Required Skills: ${requiredSkills}`,
    benefits && `Benefits: ${benefits}`,
  ].filter(Boolean).join("\n");
}

function buildCandidateContext(
  candidate: Record<string, unknown>,
  resumeText: string | null,
): string {
  const workExp = Array.isArray(candidate.work_experience)
    ? candidate.work_experience
      .map((e: Record<string, unknown>) =>
        `${e.title || e.role || "Role"} at ${e.company || "Company"} (${e.start_date || "?"} – ${e.end_date || "Present"})`
      )
      .join("; ")
    : null;
  const education = Array.isArray(candidate.education)
    ? candidate.education
      .map((e: Record<string, unknown>) =>
        `${e.degree || e.qualification || "Degree"} from ${e.institution || "Institution"}`
      )
      .join("; ")
    : null;
  const certs = Array.isArray(candidate.certifications)
    ? candidate.certifications.map((c: Record<string, unknown>) => c.name).filter(Boolean).join(", ")
    : null;
  const suitability = candidate.suitability_analysis as Record<string, unknown> | null;
  const suitabilitySummary = typeof suitability?.summary === "string" ? suitability.summary : null;

  return [
    `Name: ${candidate.name || "Unknown"}`,
    candidate.role_applied && `Role Applied: ${candidate.role_applied}`,
    candidate.candidate_current_role && `Current Role: ${candidate.candidate_current_role}`,
    candidate.candidate_current_company && `Current Company: ${candidate.candidate_current_company}`,
    candidate.experience_years != null && `Experience Years: ${candidate.experience_years}`,
    joinList(candidate.skills) && `Skills: ${joinList(candidate.skills)}`,
    joinList(candidate.skills_tags) && `Skill Tags: ${joinList(candidate.skills_tags)}`,
    workExp && `Work Experience: ${workExp}`,
    education && `Education: ${education}`,
    certs && `Certifications: ${certs}`,
    typeof candidate.ai_summary === "string" && candidate.ai_summary.trim()
      && `AI Profile Summary: ${candidate.ai_summary.trim()}`,
    suitabilitySummary && `Suitability Notes: ${suitabilitySummary}`,
    resumeText && `Resume Text:\n${resumeText}`,
    candidate.resume_url && !resumeText && "Resume: PDF on file (see structured profile above)",
  ].filter(Boolean).join("\n");
}

async function generateQuestionsWithGemini(
  apiKey: string,
  stageName: string,
  jobContext: string,
  candidateContext: string,
): Promise<string[]> {
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const aiRes = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: "system",
            content: `You are an expert interviewer at SparxIT. Generate 6–10 focused, open-ended interview questions for the given stage.
Questions must be specific to THIS candidate and THIS job — reference skills, experience gaps, and role requirements from the materials provided.
Probe: skills match vs JD, experience depth, notable gaps, and 1–2 realistic role-specific scenarios.
Be fair and professional. Do not ask discriminatory questions. Return only via the tool.`,
          },
          {
            role: "user",
            content: [
              `Interview Stage: ${stageName}`,
              jobContext ? `\n--- JOB DESCRIPTION ---\n${jobContext}` : "",
              candidateContext ? `\n--- CANDIDATE RESUME / PROFILE ---\n${candidateContext}` : "",
              "\nGenerate the interview kit using the generate_questions tool.",
            ].filter(Boolean).join(""),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_questions",
              description: "Generate read-only interview question list",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 6,
                    maxItems: 10,
                  },
                },
                required: ["questions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_questions" } },
      }),
    },
  );

  if (!aiRes.ok) throw new Error(`Gemini error: ${aiRes.status}`);
  const aiResult = await aiRes.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call returned");

  const parsed = JSON.parse(toolCall.function.arguments);
  const questions = (parsed.questions as string[] | undefined)?.filter((q) => q?.trim()) ?? [];
  if (questions.length < 4) throw new Error("Insufficient questions returned");
  return questions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const {
      interview_id,
      force_gemini,
      force_regenerate,
    } = body as {
      interview_id?: string;
      force_gemini?: boolean;
      force_regenerate?: boolean;
    };

    if (!interview_id) {
      return new Response(JSON.stringify({ error: "interview_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shouldRegenerate = force_regenerate || force_gemini;

    if (!shouldRegenerate) {
      const { data: existing } = await supabase
        .from("interview_kits")
        .select("id, candidate_interview_id, questions, source, scorecard_template_id, generated_at")
        .eq("candidate_interview_id", interview_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, kit: existing }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: interview, error: interviewError } = await supabase
      .from("candidate_interviews")
      .select(`
        id,
        candidate:candidates(
          name, role_applied, candidate_current_role, candidate_current_company,
          experience_years, skills, skills_tags, work_experience, education,
          certifications, ai_summary, suitability_analysis, resume_url, job_id
        ),
        job_interview_stage:job_interview_stages(
          stage_name,
          job:jobs(
            title, description, required_skills, benefits, department,
            location, job_type, experience_level, experience_years_range
          )
        )
      `)
      .eq("id", interview_id)
      .single();

    if (interviewError || !interview) {
      throw new Error("Interview not found");
    }

    const candidate = interview.candidate as Record<string, unknown> | null;
    const stage = interview.job_interview_stage as {
      stage_name?: string;
      job?: Record<string, unknown>;
    } | null;
    const stageName = stage?.stage_name || "Interview";
    const stageKey = resolveStageKey(stageName);

    const { data: template } = await supabase
      .from("scorecard_templates")
      .select("id, prompt_questions")
      .eq("stage_key", stageKey)
      .eq("is_active", true)
      .maybeSingle();

    const templateQuestions = (template?.prompt_questions as string[]) || [];
    let questions = templateQuestions;
    let source: "template" | "gemini" = "template";

    const job = stage?.job ?? null;
    const jobContext = buildJobContext(job);
    const resumeText = candidate
      ? await extractResumePlainText(supabase, candidate.resume_url as string | null)
      : null;
    const candidateContext = candidate ? buildCandidateContext(candidate, resumeText) : "";
    const hasGenerationContext = !!(jobContext.trim() || candidateContext.trim());

    if (hasGenerationContext) {
      const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
      if (GOOGLE_AI_API_KEY) {
        try {
          questions = await generateQuestionsWithGemini(
            GOOGLE_AI_API_KEY,
            stageName,
            jobContext,
            candidateContext,
          );
          source = "gemini";
        } catch (geminiErr) {
          console.error("Gemini kit generation failed, using template fallback:", geminiErr);
          if (templateQuestions.length === 0) throw geminiErr;
        }
      } else if (templateQuestions.length === 0) {
        throw new Error("Gemini API key not configured");
      }
    }

    const payload = {
      candidate_interview_id: interview_id,
      questions,
      source,
      scorecard_template_id: template?.id ?? null,
      generated_at: new Date().toISOString(),
    };

    const { data: kit, error: upsertError } = await supabase
      .from("interview_kits")
      .upsert(payload, { onConflict: "candidate_interview_id" })
      .select("id, candidate_interview_id, questions, source, scorecard_template_id, generated_at")
      .single();

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ success: true, kit }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-interview-kit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
