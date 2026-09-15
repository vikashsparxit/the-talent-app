import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireStaff(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { interview_id, notes, candidate_name, stage_name, job_title, criteria } = body as {
      interview_id?: string;
      notes?: string;
      candidate_name?: string;
      stage_name?: string;
      job_title?: string;
      criteria?: { key: string; label: string }[];
    };

    if (!notes?.trim()) {
      return new Response(JSON.stringify({ error: "notes is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("Gemini API key not configured");

    const context = [
      candidate_name && `Candidate: ${candidate_name}`,
      job_title && `Job: ${job_title}`,
      stage_name && `Interview Stage: ${stage_name}`,
    ].filter(Boolean).join("\n");

    const ratingCriteria = (criteria?.length ? criteria : [
      { key: "technical", label: "Technical skills" },
      { key: "communication", label: "Communication" },
      { key: "problem_solving", label: "Problem solving" },
      { key: "culture_fit", label: "Culture fit" },
    ]);

    const ratingProperties: Record<string, unknown> = {};
    const ratingRequired: string[] = [];
    for (const c of ratingCriteria) {
      ratingProperties[c.key] = {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description: `${c.label} rating 1–5`,
      };
      ratingRequired.push(c.key);
    }

    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [
            {
              role: "system",
              content: `You are an experienced HR interviewer helping draft structured feedback from raw interview notes.
Your job: convert raw, informal notes into a professional, fair, and constructive feedback entry.
Be balanced — acknowledge both strengths and areas for improvement.
Ratings are 1–5 (1=poor, 3=average, 5=excellent).
Verdict options: 'proceeded' (recommend advancing), 'rejected' (do not advance), 'hold' (need more information or panel discussion).
Keep the feedback concise (2–4 sentences). Use professional language. Base everything strictly on the notes.`,
            },
            {
              role: "user",
              content: `${context}\n\nScorecard criteria: ${ratingCriteria.map(c => c.label).join(", ")}\n\nRaw interview notes:\n${notes.trim()}\n\nDraft structured feedback using the draft_feedback tool.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "draft_feedback",
                description: "Generate structured interview feedback from raw notes",
                parameters: {
                  type: "object",
                  properties: {
                    verdict_suggestion: {
                      type: "string",
                      enum: ["proceeded", "rejected", "hold"],
                      description: "Recommended verdict based on the notes",
                    },
                    ...ratingProperties,
                    feedback: {
                      type: "string",
                      description: "Professional feedback summary (2–4 sentences)",
                    },
                  },
                  required: ["verdict_suggestion", ...ratingRequired, "feedback"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "draft_feedback" } },
        }),
      }
    );

    if (!aiRes.ok) throw new Error(`Gemini error: ${aiRes.status}`);
    const aiResult = await aiRes.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const draft = JSON.parse(toolCall.function.arguments);

    // Optionally persist notes if interview_id provided
    if (interview_id) {
      await supabase
        .from("candidate_interviews")
        .update({ interview_notes: notes } as any)
        .eq("id", interview_id);
    }

    return new Response(
      JSON.stringify({ success: true, draft }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("draft-feedback error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
