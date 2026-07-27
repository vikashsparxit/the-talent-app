// ─────────────────────────────────────────────────────────────────────────────
// chitra-chat — Chitragupta's two-way natural language chat for super admin
//
// Receives a plain-text question from the super admin, uses Gemini with
// function-calling to query live recruitment data, and returns a natural
// language answer.
//
// The user's message is stored as { type: 'chitra_query', source: 'user' }
// and the response as { type: 'chitra_nudge', source: 'chitra' }.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolQueryPipeline(
  supabase: ReturnType<typeof createClient>,
  args: { job_id?: string; job_title?: string },
) {
  // Find job by title if provided
  let jobId = args.job_id;
  if (!jobId && args.job_title) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, title")
      .ilike("title", `%${args.job_title}%`)
      .limit(1)
      .maybeSingle();
    jobId = (job as any)?.id;
    if (!jobId) return { error: `No job found matching "${args.job_title}"` };
  }

  const jobFilter = jobId
    ? supabase.from("jobs").select("id, title, status").eq("id", jobId)
    : supabase.from("jobs").select("id, title, status").eq("status", "open");

  const { data: jobs } = await jobFilter;

  const result: any[] = [];

  for (const job of (jobs ?? []) as any[]) {
    const { data: stages } = await supabase
      .from("job_interview_stages")
      .select("id, stage_name, stage_order")
      .eq("job_id", job.id)
      .order("stage_order", { ascending: true });

    const stageIds = (stages ?? []).map((s: any) => s.id);

    const { data: interviews } = await supabase
      .from("candidate_interviews")
      .select("job_interview_stage_id, verdict, candidate:candidates!candidate_interviews_candidate_id_fkey(name)")
      .in("job_interview_stage_id", stageIds.length > 0 ? stageIds : ["none"]);

    const stageSummaries = (stages ?? []).map((s: any) => {
      const stageInterviews = (interviews ?? []).filter(
        (iv: any) => iv.job_interview_stage_id === s.id,
      );
      return {
        stage: s.stage_name,
        total: stageInterviews.length,
        proceeded: stageInterviews.filter((iv: any) => iv.verdict === "proceeded").length,
        rejected: stageInterviews.filter((iv: any) => iv.verdict === "rejected").length,
        pending: stageInterviews.filter((iv: any) => iv.verdict === null).length,
        candidates: stageInterviews
          .filter((iv: any) => iv.verdict === null)
          .map((iv: any) => (iv as any).candidate?.name ?? "Unknown")
          .slice(0, 5),
      };
    });

    result.push({ job: job.title, status: job.status, stages: stageSummaries });
  }

  return result;
}

async function toolQueryCandidates(
  supabase: ReturnType<typeof createClient>,
  args: { status?: string; verdict?: string; days_stuck?: number; limit?: number },
) {
  const limit = Math.min(args.limit ?? 10, 20);

  let query = supabase
    .from("candidates")
    .select("id, name, candidate_status, role_applied, experience_years, created_at")
    .limit(limit);

  if (args.status) query = query.eq("candidate_status", args.status);

  if (args.days_stuck) {
    const cutoff = new Date(Date.now() - args.days_stuck * 86_400_000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { data } = await query;
  return data ?? [];
}

async function toolQueryJobs(
  supabase: ReturnType<typeof createClient>,
  args: { status?: string; at_risk?: boolean },
) {
  let query = supabase
    .from("jobs")
    .select("id, title, status, application_deadline, created_at");

  if (args.status) query = query.eq("status", args.status);
  else query = query.in("status", ["open", "paused"]);

  const { data: jobs } = await query;

  if (!args.at_risk) return jobs ?? [];

  // Filter to at-risk jobs (open escalations of type deadline_pipeline_risk)
  const { data: atRisk } = await supabase
    .from("chitra_escalations")
    .select("reference_id")
    .eq("violation_type", "deadline_pipeline_risk")
    .is("resolved_at", null);

  const atRiskIds = new Set((atRisk ?? []).map((r: any) => r.reference_id));
  return (jobs ?? []).filter((j: any) => atRiskIds.has(j.id));
}

async function toolQueryEscalations(
  supabase: ReturnType<typeof createClient>,
  args: { type?: string; open_only?: boolean },
) {
  let query = supabase
    .from("chitra_escalations")
    .select(`
      id, violation_type, escalation_level, created_at, last_escalated_at, resolved_at,
      subject:profiles!chitra_escalations_subject_user_id_fkey(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (args.type) query = query.eq("violation_type", args.type);
  if (args.open_only !== false) query = query.is("resolved_at", null);

  const { data } = await query;
  return (data ?? []).map((e: any) => ({
    type: e.violation_type,
    level: e.escalation_level,
    subject: e.subject?.full_name ?? "Unknown",
    since: e.created_at,
    resolved: e.resolved_at,
  }));
}

async function toolQueryRecruiterStats(
  supabase: ReturnType<typeof createClient>,
  args: { days?: number },
) {
  const days = args.days ?? 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: recruiters } = await supabase
    .from("user_roles")
    .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
    .eq("role", "recruiter");

  const results: any[] = [];

  for (const r of (recruiters ?? []) as any[]) {
    const uid: string = r.user_id;
    const name: string = r.profile?.full_name ?? "Unknown";

    const [{ count: uploads }, { count: advancements }, { count: jobsManaged }] =
      await Promise.all([
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("uploaded_by", uid)
          .gte("created_at", since),
        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .eq("advanced_by", uid)
          .gte("advanced_at", since),
        supabase
          .from("job_recruiters")
          .select("job_id", { count: "exact", head: true })
          .eq("recruiter_user_id", uid),
      ]);

    results.push({
      name,
      uploads: uploads ?? 0,
      advancements: advancements ?? 0,
      jobsManaged: jobsManaged ?? 0,
      period: `last ${days} days`,
    });
  }

  return results.sort((a, b) => b.advancements + b.uploads - (a.advancements + a.uploads));
}

async function toolQueryInterviewerStats(
  supabase: ReturnType<typeof createClient>,
  args: { days?: number },
) {
  const days = args.days ?? 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const now = new Date().toISOString();

  const { data: interviewers } = await supabase
    .from("user_roles")
    .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
    .eq("role", "interviewer");

  const results: any[] = [];

  for (const i of (interviewers ?? []) as any[]) {
    const uid: string = i.user_id;
    const name: string = i.profile?.full_name ?? "Unknown";

    const [{ data: feedbackRows }, { count: pending }] = await Promise.all([
      supabase
        .from("candidate_interviews")
        .select("scheduled_at, updated_at")
        .eq("interviewer_user_id", uid)
        .not("verdict", "is", null)
        .gte("updated_at", since),
      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .eq("interviewer_user_id", uid)
        .lt("scheduled_at", now)
        .is("verdict", null),
    ]);

    const submitted = (feedbackRows ?? []).length;
    const avgMinutes =
      submitted > 0
        ? Math.round(
            (feedbackRows as any[]).reduce((sum, row) => {
              const ms = new Date(row.updated_at).getTime() - new Date(row.scheduled_at).getTime();
              return sum + Math.max(0, ms / 60_000);
            }, 0) / submitted,
          )
        : null;

    if (submitted > 0 || (pending ?? 0) > 0) {
      results.push({
        name,
        feedbackSubmitted: submitted,
        avgResponseMinutes: avgMinutes,
        pendingFeedback: pending ?? 0,
        period: `last ${days} days`,
      });
    }
  }

  return results.sort((a, b) => b.feedbackSubmitted - a.feedbackSubmitted);
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function dispatchTool(
  supabase: ReturnType<typeof createClient>,
  toolName: string,
  toolArgs: any,
): Promise<any> {
  switch (toolName) {
    case "query_pipeline":
      return toolQueryPipeline(supabase, toolArgs);
    case "query_candidates":
      return toolQueryCandidates(supabase, toolArgs);
    case "query_jobs":
      return toolQueryJobs(supabase, toolArgs);
    case "query_escalations":
      return toolQueryEscalations(supabase, toolArgs);
    case "query_recruiter_stats":
      return toolQueryRecruiterStats(supabase, toolArgs);
    case "query_interviewer_stats":
      return toolQueryInterviewerStats(supabase, toolArgs);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Gemini tool definitions (OpenAI-compatible format) ────────────────────────

const GEMINI_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_pipeline",
      description:
        "Get stage-by-stage pipeline breakdown for one job or all open jobs. Returns candidate counts per stage plus names of pending candidates.",
      parameters: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Specific job UUID" },
          job_title: { type: "string", description: "Partial job title to search for" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_candidates",
      description:
        "List candidates filtered by status, verdict, or how many days they have been stuck.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["new", "reviewing", "shortlisted", "rejected"],
            description: "Filter by candidate_status",
          },
          verdict: {
            type: "string",
            description: "Filter by last interview verdict (e.g. hold, no_show)",
          },
          days_stuck: {
            type: "number",
            description: "Only return candidates in pipeline for longer than N days",
          },
          limit: { type: "number", description: "Max results (default 10, max 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_jobs",
      description:
        "List jobs with their status and deadline. Set at_risk=true to see only jobs with open deadline-risk escalations.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "paused", "closed", "draft"],
            description: "Filter by job status",
          },
          at_risk: {
            type: "boolean",
            description: "If true, return only jobs with active deadline-risk escalations",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_escalations",
      description:
        "Get open Chitragupta escalations, optionally filtered by violation type.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description:
              "Violation type filter (e.g. stage_stagnation, deadline_pipeline_risk, hold_resolution)",
          },
          open_only: {
            type: "boolean",
            description: "If false, include resolved escalations too. Default true.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_recruiter_stats",
      description: "Get uploads and pipeline advancements per recruiter for the last N days.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look-back window in days (default 7)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_interviewer_stats",
      description:
        "Get feedback submission count, average response speed, and pending count per interviewer.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look-back window in days (default 7)" },
        },
      },
    },
  },
];

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_API_KEY =
    Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Auth: super admin only ────────────────────────────────────────────────
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(jwt);
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!(profileRow as any)?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Forbidden: super admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    const { message } = (await req.json()) as { message: string };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store user's message in notifications
    await supabase.from("notifications").insert({
      user_id: authData.user.id,
      type: "chitra_query",
      source: "user",
      title: message.slice(0, 60),
      message: message.slice(0, 200),
      link: null,
    });

    // ── Agentic loop: Gemini + function-calling ───────────────────────────────
    const systemPrompt = `You are Chitragupta, the AI HR Manager for SparxIT. You have access to live recruitment data through tools.

Answer the super admin's question accurately and concisely using the available tools.
- Always query actual data before answering — don't guess.
- Be direct and factual. Mention specific names, numbers, and titles.
- Response must be plain text, max 400 characters, no markdown, no emojis.
- If the question can't be answered from available tools, say so briefly.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];
    let reply = "";

    // Agentic loop — max 5 iterations to prevent runaway tool calls
    for (let iteration = 0; iteration < 5; iteration++) {
      const geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            messages,
            tools: GEMINI_TOOLS,
            max_tokens: 1024,
          }),
        },
      );

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        throw new Error(`Gemini API error: ${geminiRes.status} ${err.slice(0, 200)}`);
      }

      const geminiData = await geminiRes.json();
      const choice = geminiData.choices?.[0];
      const finishReason: string = choice?.finish_reason ?? "";
      const assistantMessage = choice?.message ?? {};

      messages.push(assistantMessage);

      if (finishReason === "stop") {
        reply = (assistantMessage.content ?? "").trim() || "I was unable to generate a response.";
        break;
      }

      if (finishReason === "tool_calls") {
        const toolCalls: any[] = assistantMessage.tool_calls ?? [];
        for (const tc of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* ignore */ }
          const toolResult = await dispatchTool(supabase, tc.function?.name ?? "", args);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }
        continue;
      }

      // Unexpected finish reason — extract text if present and stop
      if (assistantMessage.content) {
        reply = assistantMessage.content.trim();
      }
      break;
    }

    if (!reply) {
      reply = "I was unable to complete your request. Please try again.";
    }

    // Store Chitragupta's response in notifications
    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: authData.user.id,
      type: "chitra_nudge",
      source: "chitra",
      title: "Chitragupta",
      message: reply.slice(0, 200),
      link: null,
    });

    if (notifError) console.error("Notification insert error:", notifError.message);

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("chitra-chat error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
