// ─────────────────────────────────────────────────────────────────────────────
// product-insight — Chitragupta's weekly product intelligence report
//
// Reads DB metrics, calls Claude API, generates 3-5 actionable insights,
// delivers them to the super admin via the Chitragupta widget.
//
// Invoke manually or schedule weekly (e.g. every Monday 8 AM).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireSuperAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Claude API call ───────────────────────────────────────────────────────────

async function generateInsights(
  apiKey: string,
  metrics: Record<string, unknown>,
): Promise<string[]> {
  const prompt = `You are Chitragupta, the AI HR Manager for The Talent App recruitment platform.

Analyse the following recruitment metrics from the past week and generate exactly 3 to 5 concise, actionable insights. Each insight should be one sentence, max 120 characters, and immediately useful to the recruitment team lead.

Focus on: bottlenecks, standout performers, deadline risks, pipeline health, and process improvements.
Do NOT state the obvious. Do NOT repeat data — interpret it.

Metrics:
${JSON.stringify(metrics, null, 2)}

Return ONLY a JSON array of strings: ["insight 1", "insight 2", ...]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "[]";
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
  } catch (e) {
    console.error("Claude API error:", e);
  }

  // Fallback: plain metrics summary
  return [
    "Weekly pipeline report available — check dashboard for details.",
  ];
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const auth = await requireSuperAdmin(req, supabase, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    // ── 1. Collect metrics ──────────────────────────────────────────────────

    const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();

    // Candidates by pipeline stage
    const { data: stageData } = await supabase
      .from("candidate_interviews")
      .select(`
        id,
        verdict,
        scheduled_at,
        stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name)
      `);

    const stageCounts: Record<string, { total: number; withVerdict: number }> = {};
    for (const row of (stageData ?? []) as any[]) {
      const stage = row.stage?.stage_name ?? "Unknown";
      if (!stageCounts[stage]) stageCounts[stage] = { total: 0, withVerdict: 0 };
      stageCounts[stage].total++;
      if (row.verdict) stageCounts[stage].withVerdict++;
    }

    // Feedback completion rate per interviewer (last 7 days)
    const { data: interviewerData } = await supabase
      .from("candidate_interviews")
      .select(`
        interviewer_user_id,
        verdict,
        scheduled_at,
        interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name)
      `)
      .lt("scheduled_at", new Date().toISOString())
      .gte("scheduled_at", weekAgo)
      .not("interviewer_user_id", "is", null);

    const interviewerStats: Record<string, { name: string; total: number; submitted: number; avgHours: number }> = {};
    for (const row of (interviewerData ?? []) as any[]) {
      const uid = row.interviewer_user_id;
      if (!interviewerStats[uid]) {
        interviewerStats[uid] = {
          name: row.interviewer?.full_name ?? "Unknown",
          total: 0,
          submitted: 0,
          avgHours: 0,
        };
      }
      interviewerStats[uid].total++;
      if (row.verdict) interviewerStats[uid].submitted++;
    }

    // Open escalations
    const { data: escalations } = await supabase
      .from("chitra_escalations")
      .select("escalation_level, violation_type")
      .is("resolved_at", null);

    const escalationSummary = (escalations ?? []).reduce((acc: Record<string, number>, row: any) => {
      const key = `level_${row.escalation_level}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    // Jobs approaching deadline (next 7 days)
    const nextWeek = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    const { data: urgentJobs } = await supabase
      .from("jobs")
      .select("title, application_deadline, status")
      .eq("status", "open")
      .lte("application_deadline", nextWeek)
      .gte("application_deadline", new Date().toISOString());

    // Candidates added this week
    const { count: newCandidates } = await supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    // ── 2. Assemble metrics payload ─────────────────────────────────────────

    const metrics = {
      week_ending: new Date().toISOString().split("T")[0],
      new_candidates_this_week: newCandidates ?? 0,
      pipeline_by_stage: stageCounts,
      interviewer_feedback_rate: Object.values(interviewerStats).map((s) => ({
        name: s.name,
        interviews: s.total,
        feedback_submitted: s.submitted,
        completion_pct: s.total > 0 ? Math.round((s.submitted / s.total) * 100) : 0,
      })),
      open_escalations: escalationSummary,
      jobs_deadline_this_week: (urgentJobs ?? []).map((j: any) => ({
        title: j.title,
        deadline: j.application_deadline,
      })),
    };

    // ── 3. Generate insights via Claude ─────────────────────────────────────

    const insights = await generateInsights(CLAUDE_API_KEY, metrics);

    // ── 4. Find super admin ─────────────────────────────────────────────────

    const { data: superAdminRow } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("is_super_admin", true)
      .maybeSingle();

    const superAdminId: string | null = (superAdminRow as any)?.user_id ?? null;

    if (!superAdminId) {
      return new Response(
        JSON.stringify({ error: "No super admin found", metrics }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. Send insights to super admin via Chitragupta ─────────────────────

    const insightText = insights.map((s, i) => `${i + 1}. ${s}`).join(" ∙ ");

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: superAdminId,
      type: "chitra_nudge",
      source: "chitra",
      title: `Weekly Intelligence Report — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      message: insights[0], // First insight in the preview; full list in action
      link: "/analytics",
      action_buttons: [{ label: "View Dashboard", link: "/analytics" }],
    });

    if (notifError) console.error("Notification insert error:", notifError.message);

    return new Response(
      JSON.stringify({ insights, metrics, notified: !notifError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("product-insight error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
