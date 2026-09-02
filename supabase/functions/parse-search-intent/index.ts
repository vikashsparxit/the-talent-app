import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, origin, referer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SearchIntent = {
  textQuery?: string;
  name?: string;
  role?: string;
  skills?: string[];
  expMin?: number;
  expMax?: number;
  location?: string;
  stageName?: string;
  dateHint?: string;
};

function sanitizeIntent(raw: Record<string, unknown>): SearchIntent {
  const intent: SearchIntent = {};

  const nameRaw =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.personName === "string" && raw.personName) ||
    "";
  if (nameRaw.trim()) {
    intent.name = nameRaw.trim().slice(0, 80);
  }

  const roleRaw =
    (typeof raw.role === "string" && raw.role) ||
    (typeof raw.roleApplied === "string" && raw.roleApplied) ||
    "";
  if (roleRaw.trim()) {
    intent.role = roleRaw.trim().slice(0, 80);
  }

  if (typeof raw.textQuery === "string" && raw.textQuery.trim()) {
    intent.textQuery = raw.textQuery.trim().slice(0, 120);
  }

  if (intent.name && intent.role) {
    delete intent.textQuery;
  }

  if (Array.isArray(raw.skills)) {
    intent.skills = raw.skills
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 8);
  }

  if (typeof raw.expMin === "number" && Number.isFinite(raw.expMin) && raw.expMin >= 0) {
    intent.expMin = Math.floor(raw.expMin);
  }
  if (typeof raw.expMax === "number" && Number.isFinite(raw.expMax) && raw.expMax >= 0) {
    intent.expMax = Math.floor(raw.expMax);
  }
  if (intent.expMin != null && intent.expMax != null && intent.expMin > intent.expMax) {
    const tmp = intent.expMin;
    intent.expMin = intent.expMax;
    intent.expMax = tmp;
  }

  if (typeof raw.location === "string" && raw.location.trim()) {
    intent.location = raw.location.trim().slice(0, 80);
  }

  if (typeof raw.stageName === "string" && raw.stageName.trim()) {
    intent.stageName = raw.stageName.trim().slice(0, 80);
  }

  if (typeof raw.dateHint === "string" && raw.dateHint.trim()) {
    intent.dateHint = raw.dateHint.trim().slice(0, 80);
  }

  return intent;
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
    const { query } = body as { query?: string };
    if (!query?.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("Gemini API key not configured");
    }

    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
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
              content: `You parse natural-language recruiter search queries into structured hiring filters.
Only extract fields that are clearly implied. Omit fields not mentioned.
If the query is a question about analytics, performance, reports, or metrics (e.g. "what's the performance of Prakash recruiter"), return ONLY textQuery with the full query — do NOT extract name or role.
Map hiring pipeline stages loosely (e.g. "phone screen", "technical", "onsite", "offer").
For experience, "5+ years" → expMin 5; "3-7 years" → expMin 3, expMax 7.
When a query combines a person name with a job title, split them:
- name: the person's name (e.g. "Amit Verma")
- role: job title / role applied (e.g. "Project Manager", "Software Engineer")
Examples:
- "Amit Verma Project Manager" → name "Amit Verma", role "Project Manager"
- "find Priya Sharma data engineer in Bangalore" → name "Priya Sharma", role "data engineer", location "Bangalore"
- "React developers in Pune" → skills ["React"], location "Pune" (no name)
Use textQuery only for residual keywords (company names, misc terms) NOT already captured in name/role/skills/location.
Do NOT put the full query in textQuery when name and role are extracted.
dateHint is optional free text for time references ("last week", "this month") when no exact filter exists.
Return JSON via the parse_search_intent tool only.`,
            },
            {
              role: "user",
              content: `Parse this recruiter search query:\n"${query.trim()}"`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "parse_search_intent",
                description: "Structured hiring search intent",
                parameters: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Candidate person name when clearly present",
                    },
                    role: {
                      type: "string",
                      description: "Job title or role applied (e.g. Project Manager, Software Engineer)",
                    },
                    textQuery: {
                      type: "string",
                      description: "Residual keywords: company or misc terms not captured elsewhere",
                    },
                    skills: {
                      type: "array",
                      items: { type: "string" },
                      description: "Technical or role skills mentioned",
                    },
                    expMin: { type: "number", description: "Minimum years of experience" },
                    expMax: { type: "number", description: "Maximum years of experience" },
                    location: { type: "string", description: "City or region" },
                    stageName: { type: "string", description: "Pipeline interview stage" },
                    dateHint: { type: "string", description: "Relative date hint if any" },
                  },
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "parse_search_intent" } },
        }),
      },
    );

    if (!aiRes.ok) throw new Error(`Gemini error: ${aiRes.status}`);
    const aiResult = await aiRes.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call returned");

    const parsed = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    const intent = sanitizeIntent(parsed);

    return new Response(JSON.stringify(intent), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-search-intent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
