import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { candidate_id } = body as { candidate_id?: string };
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: "candidate_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("Gemini API key not set. Add GOOGLE_AI_API_KEY or GEMINI_API_KEY to the environment of your Edge Functions service (self-hosted: see docs/EDGE_FUNCTIONS_SECRETS_SELF_HOSTED.md).");
    }

    // Fetch candidate with linked job
    const { data: candidate, error: fetchError } = await supabase
      .from("candidates")
      .select("*, job:jobs(*)")
      .eq("id", candidate_id)
      .single();

    if (fetchError || !candidate) {
      throw new Error("Candidate not found");
    }

    const job = candidate.job as Record<string, unknown> | null;

    if (!job) {
      return new Response(
        JSON.stringify({ error: "Candidate has no linked job. Please assign a job first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build candidate profile
    const candidateProfile = `
Candidate Name: ${candidate.name}
Current Role: ${candidate.candidate_current_role || "N/A"}
Current Company: ${candidate.candidate_current_company || "N/A"}
Experience Years: ${candidate.experience_years || "N/A"}
Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(", ") : "N/A"}
Skill Tags: ${Array.isArray(candidate.skills_tags) ? candidate.skills_tags.join(", ") : "N/A"}
Role Applied For: ${candidate.role_applied || "N/A"}
    `.trim();

    // Build job description
    const requiredSkills = Array.isArray(job.required_skills) ? job.required_skills.join(", ") : "N/A";
    const benefits = Array.isArray(job.benefits) ? job.benefits.join(", ") : "N/A";
    const jobDescription = `
Job Title: ${job.title || "N/A"}
Department: ${job.department || "N/A"}
Location: ${job.location || "N/A"}
Job Type: ${String(job.job_type || "N/A").replace("_", " ")}
Experience Level Required: ${job.experience_level || "N/A"}
Description: ${job.description || "N/A"}
Required Skills: ${requiredSkills}
Benefits: ${benefits}
    `.trim();

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are an expert HR analyst. Analyze how well a candidate matches a job description. 
Be precise and objective. Score based on:
1. Skills Match (40%): How many required skills does the candidate have?
2. Experience Match (30%): Does the candidate's experience level match the job requirements?
3. Role Relevance (30%): How relevant is the candidate's current/past role to the job?

Provide an overall suitability score 0-100 and a brief breakdown.`,
            },
            {
              role: "user",
              content: `Analyze this candidate's suitability for the job:\n\n--- CANDIDATE ---\n${candidateProfile}\n\n--- JOB DESCRIPTION ---\n${jobDescription}\n\nUse the analyze_suitability tool to return structured results.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "analyze_suitability",
                description: "Return structured suitability analysis for a candidate-job match",
                parameters: {
                  type: "object",
                  properties: {
                    suitability_score: {
                      type: "integer",
                      description: "Overall suitability score 0-100",
                    },
                    skills_match: {
                      type: "integer",
                      description: "Skills match percentage 0-100",
                    },
                    experience_match: {
                      type: "integer",
                      description: "Experience level match percentage 0-100",
                    },
                    role_relevance: {
                      type: "integer",
                      description: "Role relevance percentage 0-100",
                    },
                    matched_skills: {
                      type: "array",
                      items: { type: "string" },
                      description: "Skills that match the job requirements",
                    },
                    missing_skills: {
                      type: "array",
                      items: { type: "string" },
                      description: "Required skills the candidate is missing",
                    },
                    summary: {
                      type: "string",
                      description: "Brief 1-2 sentence summary of the candidate's fit for the role",
                    },
                  },
                  required: [
                    "suitability_score",
                    "skills_match",
                    "experience_match",
                    "role_relevance",
                    "matched_skills",
                    "missing_skills",
                    "summary",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "analyze_suitability" },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Google AI error:", aiResponse.status, errorText);
      let reason = `HTTP ${aiResponse.status}`;
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.error?.message ?? errJson?.message ?? errJson?.error;
        if (msg) reason = typeof msg === "string" ? msg : String(msg);
      } catch {
        if (errorText.length < 200) reason = errorText;
      }
      throw new Error(`Gemini API error: ${reason}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return analysis data");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Update candidate with suitability data
    const { error: updateError } = await supabase
      .from("candidates")
      .update({
        suitability_score: analysis.suitability_score,
        suitability_analysis: analysis,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", candidate_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-candidate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});