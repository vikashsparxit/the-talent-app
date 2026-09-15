// ─────────────────────────────────────────────────────────────────────────────
// chitra-daily-brief — Chitragupta's daily executive work update
//
// Sent every morning to the super admin via the Chitragupta widget.
// Covers: overall system health, per-recruiter activity, per-interviewer
// activity, open escalations, and upcoming interviews.
//
// Schedule: daily at 9 AM (set in Supabase Dashboard → Edge Functions → Schedule)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fanOutChitraDailyReportEmail } from "../_shared/chitraEmailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecruiterStat {
  user_id: string;
  name: string;
  candidatesSourced: number;
  candidatesAdvanced: number;
  jobsManaged: number;
}

interface InterviewerStat {
  user_id: string;
  name: string;
  interviewsConducted: number;
  feedbackSubmitted: number;
  feedbackPending: number;
}

interface DailyMetrics {
  date: string;
  overall: {
    newCandidates: number;
    interviewsScheduled: number;
    feedbackSubmitted: number;
    feedbackPending: number;
    upcomingInterviews: number;
    openEscalations: number;
    openJobs: number;
    // KRA 5 additions
    stagnantCandidates: number;
    atRiskJobs: number;
    rewardsGiven: number;
  };
  recruiters: RecruiterStat[];
  interviewers: InterviewerStat[];
}

// ── Gemini message generator ──────────────────────────────────────────────────

async function generateBrief(
  apiKey: string,
  metrics: DailyMetrics,
  adminFirstName: string,
): Promise<{ title: string; message: string }> {
  const date = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "short",
  });

  const recruiterLines = metrics.recruiters
    .filter((r) => r.candidatesSourced > 0 || r.candidatesAdvanced > 0)
    .map((r) =>
      `${r.name}: ${r.candidatesSourced} sourced, ${r.candidatesAdvanced} advanced (manages ${r.jobsManaged} job${r.jobsManaged !== 1 ? "s" : ""})`
    )
    .join("; ") || "No recruiter activity today.";

  const interviewerLines = metrics.interviewers
    .filter((i) => i.interviewsConducted > 0 || i.feedbackPending > 0)
    .map((i) =>
      `${i.name}: ${i.feedbackSubmitted}/${i.interviewsConducted} feedback done` +
      (i.feedbackPending > 0 ? ` (${i.feedbackPending} pending)` : "")
    )
    .join("; ") || "No interviewer activity today.";

  const o = metrics.overall;
  const prompt = `You are Chitragupta, AI HR Manager for SparxIT. Write a concise daily executive brief for the super admin.

Date: ${date}
Admin's first name: ${adminFirstName}
Overall: ${o.newCandidates} new candidates, ${o.interviewsScheduled} interviews scheduled, ${o.feedbackSubmitted} feedback submitted, ${o.feedbackPending} feedback pending, ${o.upcomingInterviews} interviews coming up tomorrow, ${o.openEscalations} open escalations, ${o.openJobs} open jobs.
Pipeline health: ${o.stagnantCandidates} stagnant candidates (stuck >5 days), ${o.atRiskJobs} jobs with deadline risk.
Recognition: ${o.rewardsGiven} praise notifications sent today.
Recruiters: ${recruiterLines}
Interviewers: ${interviewerLines}

Rules:
- Tone: professional but warm, like a capable EA briefing their executive
- Title: max 55 chars, include the date (e.g. "Daily Brief — Mon 21 Apr")
- Message: MUST start with "Hey ${adminFirstName}, Good Morning! " then the brief. Max 300 chars total, plain text only, no markdown, no emojis.
- Highlight what's notable: celebrate good performance, flag pipeline risks or stagnation
- If everything is quiet, say so briefly
- Return ONLY valid JSON: { "title": "...", "message": "..." }`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          response_format: { type: "json_object" },
        }),
      },
    );
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text);
    if (parsed.title && parsed.message) return parsed;
  } catch (e) {
    console.error("Gemini error:", e);
  }

  // Fallback
  const { overall } = metrics;
  return {
    title: `Daily Brief — ${date}`,
    message:
      `Hey ${adminFirstName}, Good Morning! ${overall.newCandidates} new candidates · ${overall.feedbackSubmitted} feedback submitted · ${overall.feedbackPending} pending · ${overall.openEscalations} escalations open · ${overall.upcomingInterviews} interviews tomorrow.`,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_API_KEY =
    Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const next24h = new Date(now.getTime() + 24 * 3_600_000).toISOString();

    // ── 1. Super admin ────────────────────────────────────────────────────────
    const { data: superAdminRow } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("is_super_admin", true)
      .maybeSingle();

    const superAdminId: string | null = (superAdminRow as any)?.user_id ?? null;
    if (!superAdminId) {
      return new Response(
        JSON.stringify({ error: "No super admin configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Use just the first name for the personal greeting
    const fullName: string = (superAdminRow as any)?.full_name ?? "there";
    const adminFirstName = fullName.split(" ")[0];

    // ── 2. Overall metrics ────────────────────────────────────────────────────

    const [
      { count: newCandidates },
      { count: interviewsScheduled },
      { count: feedbackSubmitted },
      { count: feedbackPending },
      { count: upcomingInterviews },
      { count: openEscalations },
      { count: openJobs },
    ] = await Promise.all([
      // New candidates added in last 24h
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),

      // Interviews created (scheduled) in last 24h
      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),

      // Feedback submitted in last 24h (verdict set, updated_at recent)
      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .not("verdict", "is", null)
        .gte("updated_at", since24h),

      // All interviews past scheduled_at with no verdict (overdue feedback)
      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .lt("scheduled_at", now.toISOString())
        .is("verdict", null)
        .not("interviewer_user_id", "is", null),

      // Interviews coming up in next 24h
      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", next24h)
        .is("verdict", null),

      // Open Chitragupta escalations
      supabase
        .from("chitra_escalations")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null),

      // Open jobs
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ]);

    // ── 3. Recruiter stats ────────────────────────────────────────────────────

    // Get all recruiters
    const { data: recruiterRows } = await supabase
      .from("user_roles")
      .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
      .eq("role", "recruiter");

    const recruiterStats: RecruiterStat[] = [];

    for (const r of (recruiterRows ?? []) as any[]) {
      const uid = r.user_id;
      const name = r.profile?.full_name ?? "Unknown";

      const [
        { count: sourced },
        { count: advanced },
        { count: jobsManaged },
      ] = await Promise.all([
        // Candidates they uploaded in last 24h
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("uploaded_by", uid)
          .gte("created_at", since24h),

        // Candidates they advanced in last 24h
        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .eq("advanced_by", uid)
          .gte("advanced_at", since24h),

        // Jobs they're assigned to
        supabase
          .from("job_recruiters")
          .select("job_id", { count: "exact", head: true })
          .eq("recruiter_user_id", uid),
      ]);

      recruiterStats.push({
        user_id: uid,
        name,
        candidatesSourced: sourced ?? 0,
        candidatesAdvanced: advanced ?? 0,
        jobsManaged: jobsManaged ?? 0,
      });
    }

    // ── 4. Interviewer stats ──────────────────────────────────────────────────

    // Get all interviewers
    const { data: interviewerRows } = await supabase
      .from("user_roles")
      .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
      .eq("role", "interviewer");

    // Also include anyone who has conducted an interview in last 24h regardless of role
    const { data: activeInterviewers } = await supabase
      .from("candidate_interviews")
      .select("interviewer_user_id, interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name)")
      .gte("scheduled_at", since24h)
      .not("interviewer_user_id", "is", null);

    // Merge: dedicated interviewers + anyone who had interviews today
    const interviewerMap = new Map<string, string>();
    for (const r of (interviewerRows ?? []) as any[]) {
      interviewerMap.set(r.user_id, r.profile?.full_name ?? "Unknown");
    }
    for (const r of (activeInterviewers ?? []) as any[]) {
      if (!interviewerMap.has(r.interviewer_user_id)) {
        interviewerMap.set(r.interviewer_user_id, r.interviewer?.full_name ?? "Unknown");
      }
    }

    const interviewerStats: InterviewerStat[] = [];

    for (const [uid, name] of interviewerMap.entries()) {
      const [
        { count: conducted },
        { count: submitted },
        { count: pending },
      ] = await Promise.all([
        // Interviews they had scheduled in last 24h (regardless of verdict)
        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .eq("interviewer_user_id", uid)
          .gte("scheduled_at", since24h)
          .lte("scheduled_at", now.toISOString()),

        // Feedback they submitted in last 24h
        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .eq("interviewer_user_id", uid)
          .not("verdict", "is", null)
          .gte("updated_at", since24h),

        // All their interviews that are overdue (past scheduled_at, no verdict)
        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .eq("interviewer_user_id", uid)
          .lt("scheduled_at", now.toISOString())
          .is("verdict", null),
      ]);

      // Only include if they have any activity
      if ((conducted ?? 0) > 0 || (pending ?? 0) > 0) {
        interviewerStats.push({
          user_id: uid,
          name,
          interviewsConducted: conducted ?? 0,
          feedbackSubmitted: submitted ?? 0,
          feedbackPending: pending ?? 0,
        });
      }
    }

    // ── 5. KRA 5 — Pipeline health & reward metrics ───────────────────────────

    // Stagnant candidates (verdict IS NULL, no movement in last 5 days)
    const stagnationCutoff = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    const { count: stagnantCandidates } = await supabase
      .from("candidate_interviews")
      .select("id", { count: "exact", head: true })
      .is("verdict", null)
      .or(`advanced_at.lt.${stagnationCutoff},and(advanced_at.is.null,created_at.lt.${stagnationCutoff})`);

    // Open deadline-risk escalations
    const { count: atRiskJobs } = await supabase
      .from("chitra_escalations")
      .select("id", { count: "exact", head: true })
      .eq("violation_type", "deadline_pipeline_risk")
      .is("resolved_at", null);

    // Praise notifications sent in last 24h
    const { count: rewardsGiven } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "chitra_praise")
      .gte("created_at", since24h);

    // ── 6. Assemble metrics ───────────────────────────────────────────────────

    const metrics: DailyMetrics = {
      date: now.toISOString().split("T")[0],
      overall: {
        newCandidates: newCandidates ?? 0,
        interviewsScheduled: interviewsScheduled ?? 0,
        feedbackSubmitted: feedbackSubmitted ?? 0,
        feedbackPending: feedbackPending ?? 0,
        upcomingInterviews: upcomingInterviews ?? 0,
        openEscalations: openEscalations ?? 0,
        openJobs: openJobs ?? 0,
        stagnantCandidates: stagnantCandidates ?? 0,
        atRiskJobs: atRiskJobs ?? 0,
        rewardsGiven: rewardsGiven ?? 0,
      },
      recruiters: recruiterStats,
      interviewers: interviewerStats,
    };

    // ── 6. Generate AI brief ──────────────────────────────────────────────────

    const { title, message } = await generateBrief(GEMINI_API_KEY, metrics, adminFirstName);

    // ── 7. Send to super admin via Chitragupta ────────────────────────────────

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: superAdminId,
      type: "chitra_nudge",
      source: "chitra",
      title,
      message,
      link: "/analytics",
      action_buttons: [
        { label: "View Pipeline", link: "/pipeline" },
        { label: "Analytics", link: "/analytics" },
      ],
    });

    if (notifError) console.error("Notification error:", notifError.message);
    else {
      await fanOutChitraDailyReportEmail(supabase, superAdminId, title, message, "/analytics");
    }

    return new Response(
      JSON.stringify({ title, message, metrics, notified: !notifError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("chitra-daily-brief error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
