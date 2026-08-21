// ─────────────────────────────────────────────────────────────────────────────
// chitra-weekly-report — Chitragupta's weekly pipeline intelligence report
//
// Generates a comprehensive weekly funnel analysis and delivers it to the
// super admin as a Chitragupta notification.
//
// Schedule: Sunday 8 AM IST (cron: 30 2 * * 0  UTC)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fanOutChitraWeeklyReportEmail } from "../_shared/chitraEmailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface StageFunnel {
  stage_name: string;
  total: number;
  proceeded: number;
  rejected: number;
  pending: number;
  passRate: number; // 0-100
  rejectRate: number; // 0-100
}

interface JobFunnel {
  jobId: string;
  jobTitle: string;
  totalCandidates: number;
  activeCandidates: number;
  stages: StageFunnel[];
  bottlenecks: string[]; // stage names with >60% rejection rate
  isThinPipeline: boolean; // <3 active candidates
  topRejectionReasons: { reason: string; count: number }[];
}

interface InterviewerSpeed {
  name: string;
  avgMinutes: number;
  count: number;
}

interface WeeklyMetrics {
  weekStart: string;
  weekEnd: string;
  jobs: JobFunnel[];
  topInterviewers: InterviewerSpeed[];
  topRecruiter: { name: string; advanced: number } | null;
  openJobs: number;
  newCandidatesThisWeek: number;
  feedbackSubmittedThisWeek: number;
}

// ── Gemini brief generator ────────────────────────────────────────────────────

async function generateWeeklyBrief(
  apiKey: string,
  metrics: WeeklyMetrics,
  adminFirstName: string,
): Promise<{ title: string; message: string }> {
  const bottleneckJobs = metrics.jobs.filter((j) => j.bottlenecks.length > 0);
  const thinJobs = metrics.jobs.filter((j) => j.isThinPipeline);
  const topJob = metrics.jobs.sort((a, b) => b.totalCandidates - a.totalCandidates)[0];

  const prompt = `You are Chitragupta, AI HR Manager for SparxIT. Write a concise weekly pipeline intelligence brief for the super admin.

Week: ${metrics.weekStart} to ${metrics.weekEnd}
Admin: ${adminFirstName}

Pipeline overview:
- ${metrics.openJobs} open jobs, ${metrics.newCandidatesThisWeek} new candidates this week
- ${metrics.feedbackSubmittedThisWeek} interviews with feedback submitted
- ${thinJobs.length > 0 ? `Thin pipelines (< 3 active): ${thinJobs.map((j) => j.jobTitle).join(", ")}` : "All pipelines adequately staffed"}
- ${bottleneckJobs.length > 0 ? `Bottleneck stages detected: ${bottleneckJobs.map((j) => `${j.jobTitle} at ${j.bottlenecks.join(", ")}`).join("; ")}` : "No major bottlenecks detected"}

Top job by activity: ${topJob ? `${topJob.jobTitle} (${topJob.totalCandidates} candidates, ${topJob.activeCandidates} active)` : "No jobs"}

Top interviewers by feedback speed: ${metrics.topInterviewers.length > 0 ? metrics.topInterviewers.map((i) => `${i.name} (avg ${i.avgMinutes}min, ${i.count} submitted)`).join("; ") : "No data"}

Top recruiter by pipeline advancement: ${metrics.topRecruiter ? `${metrics.topRecruiter.name} (${metrics.topRecruiter.advanced} advancements)` : "No data"}

Rules:
- Tone: sharp, executive — like a weekly board update
- Title: max 55 chars, include "Weekly Brief" and the week dates
- Message: MUST start with "Hey ${adminFirstName}, " then the brief. Max 300 chars, plain text, no markdown, no emojis.
- Highlight the most important signal: a bottleneck, a thin pipeline, a top performer, or a win
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
    console.error("Gemini weekly brief error:", e);
  }

  // Fallback
  const thinNote = thinJobs.length > 0 ? ` ${thinJobs.length} thin pipeline(s).` : "";
  const bottleneckNote = bottleneckJobs.length > 0 ? ` ${bottleneckJobs.length} bottleneck(s) flagged.` : "";
  return {
    title: `Weekly Brief — ${metrics.weekStart} to ${metrics.weekEnd}`,
    message: `Hey ${adminFirstName}, ${metrics.newCandidatesThisWeek} new candidates this week across ${metrics.openJobs} open jobs.${thinNote}${bottleneckNote} ${metrics.feedbackSubmittedThisWeek} feedback submissions.`,
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
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const weekStart = weekAgo.toISOString().split("T")[0];
    const weekEnd = now.toISOString().split("T")[0];

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
    const fullName: string = (superAdminRow as any)?.full_name ?? "there";
    const adminFirstName = fullName.split(" ")[0];

    // ── 2. Open jobs ──────────────────────────────────────────────────────────
    const { data: openJobs } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("status", "open");

    const { count: openJobCount } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    // ── 3. Per-job funnel ─────────────────────────────────────────────────────
    const jobFunnels: JobFunnel[] = [];

    for (const job of (openJobs ?? []) as any[]) {
      // Get all stages for this job
      const { data: stages } = await supabase
        .from("job_interview_stages")
        .select("id, stage_name, stage_order")
        .eq("job_id", job.id)
        .order("stage_order", { ascending: true });

      if (!stages || stages.length === 0) continue;

      const stageIds = (stages as any[]).map((s) => s.id);

      // Get all interviews for this job
      const { data: interviews } = await supabase
        .from("candidate_interviews")
        .select("id, candidate_id, job_interview_stage_id, verdict, updated_at, scheduled_at, rejection_reason")
        .in("job_interview_stage_id", stageIds);

      const allInterviews = (interviews ?? []) as any[];

      // Per-stage funnel
      const stageFunnels: StageFunnel[] = [];
      for (const stage of (stages as any[])) {
        const stageInterviews = allInterviews.filter(
          (iv) => iv.job_interview_stage_id === stage.id,
        );
        const total = stageInterviews.length;
        const proceeded = stageInterviews.filter((iv) => iv.verdict === "proceeded").length;
        const rejected = stageInterviews.filter((iv) => iv.verdict === "rejected").length;
        const pending = stageInterviews.filter((iv) => iv.verdict === null).length;

        const passRate = total > 0 ? Math.round((proceeded / total) * 100) : 0;
        const rejectRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

        stageFunnels.push({
          stage_name: stage.stage_name,
          total,
          proceeded,
          rejected,
          pending,
          passRate,
          rejectRate,
        });
      }

      const bottlenecks = stageFunnels
        .filter((s) => s.rejectRate > 60 && s.total >= 3)
        .map((s) => s.stage_name);

      // Active candidates (not rejected, not selected)
      const rejectedCandidates = new Set(
        allInterviews
          .filter((iv) => iv.verdict === "rejected")
          .map((iv) => iv.candidate_id),
      );

      const { data: jobCandidates } = await supabase
        .from("candidates")
        .select("id, candidate_status")
        .eq("job_id", job.id);

      const allCandidateCount = (jobCandidates ?? []).length;
      const activeCandidateCount = (jobCandidates ?? []).filter(
        (c: any) => !["rejected", "selected"].includes(c.candidate_status ?? "") &&
          !rejectedCandidates.has(c.id),
      ).length;

      // Rejection reasons (KRA 17 — column may or may not exist yet)
      const rejectionReasonCounts: Record<string, number> = {};
      for (const iv of allInterviews) {
        if (iv.verdict === "rejected" && iv.rejection_reason) {
          rejectionReasonCounts[iv.rejection_reason] =
            (rejectionReasonCounts[iv.rejection_reason] ?? 0) + 1;
        }
      }
      const topRejectionReasons = Object.entries(rejectionReasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count }));

      jobFunnels.push({
        jobId: job.id,
        jobTitle: job.title,
        totalCandidates: allCandidateCount,
        activeCandidates: activeCandidateCount,
        stages: stageFunnels,
        bottlenecks,
        isThinPipeline: activeCandidateCount < 3,
        topRejectionReasons,
      });
    }

    // ── 4. Top interviewers by feedback speed ─────────────────────────────────
    const { data: feedbackRows } = await supabase
      .from("candidate_interviews")
      .select(`
        interviewer_user_id, scheduled_at, updated_at,
        interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name)
      `)
      .not("verdict", "is", null)
      .not("interviewer_user_id", "is", null)
      .gte("updated_at", weekAgo.toISOString());

    const interviewerSpeedMap = new Map<string, { name: string; totalMinutes: number; count: number }>();
    for (const row of (feedbackRows ?? []) as any[]) {
      const uid: string = row.interviewer_user_id;
      const name: string = row.interviewer?.full_name ?? "Unknown";
      const scheduledMs = new Date(row.scheduled_at).getTime();
      const submittedMs = new Date(row.updated_at).getTime();
      const minutesTaken = Math.max(0, (submittedMs - scheduledMs) / 60_000);

      const existing = interviewerSpeedMap.get(uid);
      if (existing) {
        existing.totalMinutes += minutesTaken;
        existing.count++;
      } else {
        interviewerSpeedMap.set(uid, { name, totalMinutes: minutesTaken, count: 1 });
      }
    }

    const topInterviewers: InterviewerSpeed[] = Array.from(interviewerSpeedMap.values())
      .filter((v) => v.count >= 2)
      .map((v) => ({ name: v.name, avgMinutes: Math.round(v.totalMinutes / v.count), count: v.count }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes)
      .slice(0, 3);

    // ── 5. Top recruiter by advancements ─────────────────────────────────────
    const { data: recruiters } = await supabase
      .from("user_roles")
      .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
      .eq("role", "recruiter");

    let topRecruiter: { name: string; advanced: number } | null = null;

    for (const r of (recruiters ?? []) as any[]) {
      const { count: advanced } = await supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .eq("advanced_by", r.user_id)
        .gte("advanced_at", weekAgo.toISOString());

      const n = advanced ?? 0;
      if (n > 0 && (!topRecruiter || n > topRecruiter.advanced)) {
        topRecruiter = { name: r.profile?.full_name ?? "Unknown", advanced: n };
      }
    }

    // ── 6. Overall week stats ─────────────────────────────────────────────────
    const [{ count: newCandidatesThisWeek }, { count: feedbackSubmittedThisWeek }] =
      await Promise.all([
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo.toISOString()),

        supabase
          .from("candidate_interviews")
          .select("id", { count: "exact", head: true })
          .not("verdict", "is", null)
          .gte("updated_at", weekAgo.toISOString()),
      ]);

    // ── 7. Assemble & generate brief ──────────────────────────────────────────
    const metrics: WeeklyMetrics = {
      weekStart,
      weekEnd,
      jobs: jobFunnels,
      topInterviewers,
      topRecruiter,
      openJobs: openJobCount ?? 0,
      newCandidatesThisWeek: newCandidatesThisWeek ?? 0,
      feedbackSubmittedThisWeek: feedbackSubmittedThisWeek ?? 0,
    };

    const { title, message } = await generateWeeklyBrief(GEMINI_API_KEY, metrics, adminFirstName);

    // ── 8. Send to super admin ────────────────────────────────────────────────
    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: superAdminId,
      type: "chitra_nudge",
      source: "chitra",
      title,
      message,
      link: "/analytics",
      action_buttons: [
        { label: "View Analytics", link: "/analytics" },
        { label: "View Pipeline", link: "/pipeline" },
      ],
    });

    if (notifError) console.error("Notification error:", notifError.message);
    else {
      await fanOutChitraWeeklyReportEmail(supabase, superAdminId, title, message, "/analytics");
    }

    return new Response(
      JSON.stringify({ title, message, metrics, notified: !notifError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("chitra-weekly-report error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
