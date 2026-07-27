// ─────────────────────────────────────────────────────────────────────────────
// chitra-kra234 — Chitragupta's KRA 2, 3, and 4 enforcement
//
// KRA 2 — Stage Stagnation: candidates stuck in a pipeline stage >N days
// KRA 3 — Job Deadline Pipeline Risk: jobs near deadline with thin pipeline
// KRA 4 — Reward & Recognition: praise interviewers/recruiters for excellence
//
// Schedule: hourly (same cron as chitra-engine)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fanOutChitraPraiseEmail } from "../_shared/chitraEmailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Returns a friendly first name from a full_name or email string
function friendlyName(name: string): string {
  const base = name.includes("@") ? name.split("@")[0] : name.split(" ")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Thresholds {
  // KRA 2
  kra2_stagnation_days: number;
  kra2_level1_hours: number;
  kra2_level2_hours: number;
  // KRA 3
  kra3_deadline_buffer_days: number;
  kra3_min_proceeded: number;
  kra3_level1_hours: number;
  // KRA 4
  kra4_feedback_grace_minutes: number;
  kra4_streak_length: number;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  title: string,
  message: string,
  link: string,
  actionLabel: string,
  extraButtons: { label: string; link: string }[] = [],
) {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title: title.slice(0, 60),
    message: message.slice(0, 200),
    link,
    source: "chitra",
    action_buttons: [{ label: actionLabel, link }, ...extraButtons],
  });
  if (error) console.error(`Notification insert failed (${userId}):`, error.message);
}

async function tellSuperAdmin(
  supabase: ReturnType<typeof createClient>,
  superAdminId: string,
  type: string,
  title: string,
  message: string,
  link = "/pipeline",
) {
  await insertNotification(supabase, superAdminId, type, title, message, link, "View Pipeline");
}

async function getHRUserIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", "hr");
  return (data ?? []).map((r: any) => r.user_id);
}

async function getPrimaryRecruiter(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
): Promise<{ id: string; name: string } | null> {
  // Prefer the primary recruiter, fall back to any recruiter on the job
  for (const filter of [{ is_primary: true }, {}]) {
    const q = supabase
      .from("job_recruiters")
      .select("recruiter_user_id, profile:profiles!job_recruiters_recruiter_user_id_fkey(full_name)")
      .eq("job_id", jobId);

    if ("is_primary" in filter) (q as any).eq("is_primary", true);

    const { data } = await q.limit(1).maybeSingle();
    if (data) {
      return {
        id: (data as any).recruiter_user_id,
        name: (data as any).profile?.full_name ?? "Recruiter",
      };
    }
  }
  return null;
}

// Log a reward event in chitra_escalations (resolved immediately — acts as a de-dup log)
async function logReward(
  supabase: ReturnType<typeof createClient>,
  subjectUserId: string,
  referenceId: string,
  violationType: string,
) {
  const now = new Date().toISOString();
  await supabase.from("chitra_escalations").insert({
    violation_type: violationType,
    subject_user_id: subjectUserId,
    reference_id: referenceId,
    escalation_level: 0,
    last_escalated_at: now,
    resolved_at: now, // immediately resolved — this is just a log entry
  });
}

// Returns true if a reward of this type was already sent for this referenceId
async function alreadyRewarded(
  supabase: ReturnType<typeof createClient>,
  referenceId: string,
  violationType: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("chitra_escalations")
    .select("id")
    .eq("violation_type", violationType)
    .eq("reference_id", referenceId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ── KRA 2 — Stage Stagnation ──────────────────────────────────────────────────

async function runKRA2(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ stagnantFound: number; stagnantActioned: number }> {
  const stagnationCutoff = new Date(
    now.getTime() - thresholds.kra2_stagnation_days * 86_400_000,
  ).toISOString();

  // ── 2a. Resolve escalations where candidate has now been advanced or decided ─
  const { data: openEscs } = await supabase
    .from("chitra_escalations")
    .select("id, reference_id")
    .eq("violation_type", "stage_stagnation")
    .is("resolved_at", null);

  for (const esc of (openEscs ?? []) as any[]) {
    const { data: iv } = await supabase
      .from("candidate_interviews")
      .select("verdict, advanced_at, candidate:candidates!candidate_interviews_candidate_id_fkey(candidate_status)")
      .eq("id", esc.reference_id)
      .maybeSingle();

    if (!iv) continue;
    const resolved =
      (iv as any).verdict !== null ||
      (iv as any).advanced_at > stagnationCutoff ||
      ["rejected", "selected"].includes((iv as any).candidate?.candidate_status ?? "");

    if (resolved) {
      await supabase
        .from("chitra_escalations")
        .update({ resolved_at: now.toISOString() })
        .eq("id", esc.id);
    }
  }

  // ── 2b. Find stagnant interviews ──────────────────────────────────────────

  const { data: stagnantRows } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, advanced_at, created_at,
      candidate:candidates!candidate_interviews_candidate_id_fkey(name, candidate_status),
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        stage_name, job_id,
        job:jobs!job_interview_stages_job_id_fkey(id, title)
      )
    `)
    .is("verdict", null)
    .or(`advanced_at.lt.${stagnationCutoff},and(advanced_at.is.null,created_at.lt.${stagnationCutoff})`);

  const stagnant = ((stagnantRows ?? []) as any[]).filter(
    (r) => !["rejected", "selected"].includes(r.candidate?.candidate_status ?? ""),
  );

  let actioned = 0;

  for (const iv of stagnant) {
    const jobId: string = iv.stage?.job_id ?? "";
    const jobTitle: string = iv.stage?.job?.title ?? "Unknown Job";
    const stageName: string = iv.stage?.stage_name ?? "Interview";
    const candidateName: string = iv.candidate?.name ?? "Unknown Candidate";
    const lastMove = iv.advanced_at ?? iv.created_at;
    const daysStuck = Math.floor((now.getTime() - new Date(lastMove).getTime()) / 86_400_000);
    const pipelineLink = "/pipeline";

    // Find open escalation
    const { data: existing } = await supabase
      .from("chitra_escalations")
      .select("id, escalation_level, last_escalated_at")
      .eq("violation_type", "stage_stagnation")
      .eq("reference_id", iv.id)
      .is("resolved_at", null)
      .maybeSingle();

    const esc = existing as any;
    const recruiter = await getPrimaryRecruiter(supabase, jobId);

    if (!esc) {
      // Level 0 — soft nudge to recruiter
      await supabase.from("chitra_escalations").insert({
        violation_type: "stage_stagnation",
        subject_user_id: recruiter?.id ?? null,
        reference_id: iv.id,
        escalation_level: 0,
        last_escalated_at: now.toISOString(),
      });

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `Candidate Stalled — ${candidateName}`,
          `${candidateName} has been in ${stageName} for ${daysStuck} days with no progress. Worth a follow-up?`,
          pipelineLink, "View Pipeline",
        );
      }
      actioned++;
      continue;
    }

    const hoursSinceLast =
      (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    const currentLevel: number = esc.escalation_level;

    if (currentLevel >= 2) continue;

    const advanceAfter = [
      thresholds.kra2_level1_hours,
      thresholds.kra2_level2_hours - thresholds.kra2_level1_hours,
    ];

    if (hoursSinceLast < advanceAfter[currentLevel]) continue;

    const newLevel = currentLevel + 1;

    await supabase
      .from("chitra_escalations")
      .update({ escalation_level: newLevel, last_escalated_at: now.toISOString() })
      .eq("id", esc.id);

    if (newLevel === 1) {
      // Firm recruiter nudge + HR loop-in
      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `Stagnation Alert — ${candidateName}`,
          `${candidateName} has been stuck in ${stageName} for ${daysStuck} days. HR has been notified.`,
          pipelineLink, "Move Candidate",
        );
      }
      for (const hrId of hrUserIds) {
        await insertNotification(
          supabase, hrId, "chitra_nudge",
          `Candidate Stagnation — ${jobTitle}`,
          `${candidateName} has been in ${stageName} for ${daysStuck} days without progress on ${jobTitle}.`,
          pipelineLink, "View Pipeline",
        );
      }
      if (superAdminId) {
        await tellSuperAdmin(
          supabase, superAdminId, "chitra_nudge",
          `Stagnation Escalated — ${candidateName}`,
          `${candidateName} is ${daysStuck} days stuck in ${stageName} (${jobTitle}). I've nudged ${recruiter?.name ?? "the recruiter"} and looped in HR.`,
          pipelineLink,
        );
      }
    } else if (newLevel === 2) {
      // Super admin flag
      if (superAdminId) {
        await tellSuperAdmin(
          supabase, superAdminId, "chitra_warning",
          `Prolonged Stagnation — ${candidateName}`,
          `${candidateName} has been in ${stageName} for ${daysStuck} days (${jobTitle}). Recruiter and HR were both notified ${thresholds.kra2_level1_hours}h ago — no movement yet.`,
          pipelineLink,
        );
      }
    }

    actioned++;
  }

  return { stagnantFound: stagnant.length, stagnantActioned: actioned };
}

// ── KRA 3 — Job Deadline Pipeline Risk ───────────────────────────────────────

async function runKRA3(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ atRiskFound: number; atRiskActioned: number }> {
  const deadlineCutoff = new Date(
    now.getTime() + thresholds.kra3_deadline_buffer_days * 86_400_000,
  ).toISOString();

  // ── 3a. Resolve escalations where job has been filled or deadline passed ───
  const { data: openEscs } = await supabase
    .from("chitra_escalations")
    .select("id, reference_id")
    .eq("violation_type", "deadline_pipeline_risk")
    .is("resolved_at", null);

  for (const esc of (openEscs ?? []) as any[]) {
    const { data: job } = await supabase
      .from("jobs")
      .select("status, application_deadline")
      .eq("id", esc.reference_id)
      .maybeSingle();

    if (!job) continue;

    // Resolve if deadline passed or job closed
    if (
      (job as any).status !== "open" ||
      new Date((job as any).application_deadline) <= now
    ) {
      await supabase
        .from("chitra_escalations")
        .update({ resolved_at: now.toISOString() })
        .eq("id", esc.id);
      continue;
    }

    // Resolve if pipeline now filled
    const { data: stages } = await supabase
      .from("job_interview_stages")
      .select("id")
      .eq("job_id", esc.reference_id);

    const stageIds = (stages ?? []).map((s: any) => s.id);
    if (!stageIds.length) continue;

    const { data: proceededRows } = await supabase
      .from("candidate_interviews")
      .select("candidate_id")
      .in("job_interview_stage_id", stageIds)
      .eq("verdict", "proceeded");

    const uniqueProceeded = new Set((proceededRows ?? []).map((r: any) => r.candidate_id)).size;
    if (uniqueProceeded >= thresholds.kra3_min_proceeded) {
      await supabase
        .from("chitra_escalations")
        .update({ resolved_at: now.toISOString() })
        .eq("id", esc.id);
    }
  }

  // ── 3b. Find at-risk jobs ─────────────────────────────────────────────────

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, title, application_deadline")
    .eq("status", "open")
    .not("application_deadline", "is", null)
    .gte("application_deadline", now.toISOString())
    .lte("application_deadline", deadlineCutoff);

  let atRiskFound = 0;
  let actioned = 0;

  for (const job of (jobRows ?? []) as any[]) {
    // Count proceeded candidates
    const { data: stages } = await supabase
      .from("job_interview_stages")
      .select("id")
      .eq("job_id", job.id);

    const stageIds = (stages ?? []).map((s: any) => s.id);
    if (!stageIds.length) continue;

    const { data: proceededRows } = await supabase
      .from("candidate_interviews")
      .select("candidate_id")
      .in("job_interview_stage_id", stageIds)
      .eq("verdict", "proceeded");

    const uniqueProceeded = new Set((proceededRows ?? []).map((r: any) => r.candidate_id)).size;

    if (uniqueProceeded >= thresholds.kra3_min_proceeded) continue; // Pipeline healthy

    atRiskFound++;

    const daysUntil = Math.ceil(
      (new Date(job.application_deadline).getTime() - now.getTime()) / 86_400_000,
    );
    const pipelineLink = "/pipeline";
    const recruiter = await getPrimaryRecruiter(supabase, job.id);

    const { data: existing } = await supabase
      .from("chitra_escalations")
      .select("id, escalation_level, last_escalated_at")
      .eq("violation_type", "deadline_pipeline_risk")
      .eq("reference_id", job.id)
      .is("resolved_at", null)
      .maybeSingle();

    const esc = existing as any;

    if (!esc) {
      // Level 0 — alert recruiter
      await supabase.from("chitra_escalations").insert({
        violation_type: "deadline_pipeline_risk",
        subject_user_id: recruiter?.id ?? null,
        reference_id: job.id,
        escalation_level: 0,
        last_escalated_at: now.toISOString(),
      });

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_warning",
          `Pipeline Alert — ${job.title}`,
          `${job.title} deadline is in ${daysUntil} days but only ${uniqueProceeded} of ${thresholds.kra3_min_proceeded} required candidates have proceeded. Time to push.`,
          pipelineLink, "View Pipeline",
        );
      }

      if (superAdminId) {
        await tellSuperAdmin(
          supabase, superAdminId, "chitra_warning",
          `Deadline Risk — ${job.title}`,
          `${job.title} closes in ${daysUntil} days with only ${uniqueProceeded} proceeded candidate(s). I've alerted ${recruiter?.name ?? "the recruiter"}.`,
          pipelineLink,
        );
      }

      actioned++;
      continue;
    }

    const hoursSinceLast =
      (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    const currentLevel: number = esc.escalation_level;

    if (currentLevel >= 1 || hoursSinceLast < thresholds.kra3_level1_hours) continue;

    // Level 1 — urgent escalation to HR + SA
    await supabase
      .from("chitra_escalations")
      .update({ escalation_level: 1, last_escalated_at: now.toISOString() })
      .eq("id", esc.id);

    if (recruiter) {
      await insertNotification(
        supabase, recruiter.id, "chitra_warning",
        `Urgent: Pipeline Critically Thin — ${job.title}`,
        `${job.title} deadline is in ${daysUntil} days. Only ${uniqueProceeded} proceeded candidate(s). HR has been notified.`,
        pipelineLink, "View Pipeline",
      );
    }

    for (const hrId of hrUserIds) {
      await insertNotification(
        supabase, hrId, "chitra_warning",
        `Urgent Pipeline Risk — ${job.title}`,
        `${job.title} closes in ${daysUntil} days with critically thin pipeline (${uniqueProceeded} proceeded). Consider pulling from talent pool.`,
        pipelineLink, "View Pipeline",
        [{ label: "Analytics", link: "/analytics" }],
      );
    }

    if (superAdminId) {
      await tellSuperAdmin(
        supabase, superAdminId, "chitra_warning",
        `Critical: ${job.title} Deadline in ${daysUntil} Days`,
        `${job.title} has only ${uniqueProceeded} proceeded candidate(s) with ${daysUntil} days left. I've escalated to ${recruiter?.name ?? "the recruiter"} and HR.`,
        pipelineLink,
      );
    }

    actioned++;
  }

  return { atRiskFound, atRiskActioned: actioned };
}

// ── KRA 4 — Reward & Recognition ─────────────────────────────────────────────

async function runKRA4(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  now: Date,
): Promise<{ praisesSent: number }> {
  // Window: last 70 min (60 min cron + 10 min buffer)
  const recentWindow = new Date(now.getTime() - 70 * 60 * 1000).toISOString();
  const graceCutoff = thresholds.kra4_feedback_grace_minutes * 60 * 1000;
  let praisesSent = 0;

  // ── 4a. On-time feedback ─────────────────────────────────────────────────
  // Find interviews where verdict was just set AND it was within grace period

  const { data: recentFeedback } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, interviewer_user_id, scheduled_at, updated_at,
      candidate:candidates!candidate_interviews_candidate_id_fkey(name),
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        stage_name, job_id,
        job:jobs!job_interview_stages_job_id_fkey(title)
      ),
      interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name)
    `)
    .not("verdict", "is", null)
    .gte("updated_at", recentWindow);

  for (const iv of (recentFeedback ?? []) as any[]) {
    if (!iv.interviewer_user_id) continue;

    const submittedMs = new Date(iv.updated_at).getTime() - new Date(iv.scheduled_at).getTime();
    const isOnTime = submittedMs >= 0 && submittedMs <= graceCutoff;

    if (!isOnTime) continue;
    if (await alreadyRewarded(supabase, iv.id, "reward_ontime_feedback")) continue;

    const interviewerName: string = iv.interviewer?.full_name ?? "Interviewer";
    const candidateName: string = iv.candidate?.name ?? "the candidate";
    const stageName: string = iv.stage?.stage_name ?? "interview";
    const jobTitle: string = iv.stage?.job?.title ?? "the role";
    const minutesTaken = Math.round(submittedMs / 60_000);

    await insertNotification(
      supabase, iv.interviewer_user_id, "chitra_praise",
      "Feedback Submitted On Time",
      `Great work, ${interviewerName}! You submitted feedback for ${candidateName}'s ${stageName} in ${minutesTaken} min. Exactly the responsiveness we need.`,
      "/pipeline", "View Pipeline",
    );
    await fanOutChitraPraiseEmail(
      supabase,
      iv.interviewer_user_id,
      "Feedback Submitted On Time",
      `Great work, ${interviewerName}! You submitted feedback for ${candidateName}'s ${stageName} in ${minutesTaken} min. Exactly the responsiveness we need.`,
      "/pipeline",
      {
        candidateId: iv.candidate_id,
        candidateName,
        jobId: iv.stage?.job_id,
      },
    );

    await logReward(supabase, iv.interviewer_user_id, iv.id, "reward_ontime_feedback");
    praisesSent++;

    // ── 4b. Streak check ────────────────────────────────────────────────────
    const { data: lastN } = await supabase
      .from("candidate_interviews")
      .select("id, updated_at, scheduled_at")
      .eq("interviewer_user_id", iv.interviewer_user_id)
      .not("verdict", "is", null)
      .order("updated_at", { ascending: false })
      .limit(thresholds.kra4_streak_length);

    if ((lastN?.length ?? 0) < thresholds.kra4_streak_length) continue;

    const allOnTime = (lastN as any[]).every((f) => {
      const ms = new Date(f.updated_at).getTime() - new Date(f.scheduled_at).getTime();
      return ms >= 0 && ms <= graceCutoff;
    });

    if (!allOnTime) continue;

    // Check not already praised for streak in last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const { data: recentStreakReward } = await supabase
      .from("chitra_escalations")
      .select("id")
      .eq("violation_type", "reward_streak")
      .eq("subject_user_id", iv.interviewer_user_id)
      .gte("created_at", thirtyDaysAgo)
      .limit(1)
      .maybeSingle();

    if (recentStreakReward) continue;

    // Fire streak praise
    await insertNotification(
      supabase, iv.interviewer_user_id, "chitra_praise",
      `${thresholds.kra4_streak_length}-Interview On-Time Streak!`,
      `Exceptional, ${interviewerName}! You've submitted feedback on time for ${thresholds.kra4_streak_length} consecutive interviews. This has been noted formally.`,
      "/pipeline", "View Pipeline",
    );
    await fanOutChitraPraiseEmail(
      supabase,
      iv.interviewer_user_id,
      `${thresholds.kra4_streak_length}-Interview On-Time Streak!`,
      `Exceptional, ${interviewerName}! You've submitted feedback on time for ${thresholds.kra4_streak_length} consecutive interviews. This has been noted formally.`,
      "/pipeline",
    );

    if (superAdminId) {
      await tellSuperAdmin(
        supabase, superAdminId, "chitra_praise",
        `Streak Achievement — ${interviewerName}`,
        `${interviewerName} just hit a ${thresholds.kra4_streak_length}-interview on-time feedback streak on ${jobTitle}. Worth recognising.`,
        "/analytics",
      );
    }

    // Publish team-wide announcement — auto-expires in 24h
    await supabase.from("announcements").insert({
      message: `${friendlyName(interviewerName)} just hit a ${thresholds.kra4_streak_length}-interview on-time feedback streak on ${jobTitle}. Worth recognising!`,
      type: "info",
      is_active: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Log streak reward with the latest interview as reference
    const latestInterviewId = (lastN as any[])[0].id;
    await logReward(supabase, iv.interviewer_user_id, latestInterviewId, "reward_streak");
    praisesSent++;
  }

  // ── 4c. Same-day advance (recruiter moved candidate on day of verdict) ────
  const { data: sameDay } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, advanced_by, advanced_at, updated_at,
      candidate:candidates!candidate_interviews_candidate_id_fkey(name),
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        stage_name, job_id,
        job:jobs!job_interview_stages_job_id_fkey(title)
      ),
      recruiter:profiles!candidate_interviews_advanced_by_fkey(full_name)
    `)
    .not("verdict", "is", null)
    .not("advanced_by", "is", null)
    .not("advanced_at", "is", null)
    .gte("advanced_at", recentWindow);

  for (const iv of (sameDay ?? []) as any[]) {
    // Same day = advanced_at and updated_at on same calendar day
    const advancedDate = new Date(iv.advanced_at).toDateString();
    const verdictDate = new Date(iv.updated_at).toDateString();
    if (advancedDate !== verdictDate) continue;

    if (await alreadyRewarded(supabase, iv.id, "reward_fast_advance")) continue;

    const recruiterName: string = iv.recruiter?.full_name ?? "Recruiter";
    const candidateName: string = iv.candidate?.name ?? "the candidate";
    const stageName: string = iv.stage?.stage_name ?? "interview";

    await insertNotification(
      supabase, iv.advanced_by, "chitra_praise",
      "Fast Pipeline Move",
      `Impressive, ${recruiterName}! You moved ${candidateName} to the next stage on the same day feedback was received for ${stageName}. That's pipeline velocity.`,
      "/pipeline", "View Pipeline",
    );
    await fanOutChitraPraiseEmail(
      supabase,
      iv.advanced_by,
      "Fast Pipeline Move",
      `Impressive, ${recruiterName}! You moved ${candidateName} to the next stage on the same day feedback was received for ${stageName}. That's pipeline velocity.`,
      "/pipeline",
      {
        candidateId: iv.candidate_id,
        candidateName,
        jobId: iv.stage?.job_id,
      },
    );

    // Publish team-wide announcement — auto-expires in 24h
    await supabase.from("announcements").insert({
      message: `${friendlyName(recruiterName)} moved ${candidateName} to the next stage on the same day as feedback — pipeline velocity at its best!`,
      type: "info",
      is_active: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await logReward(supabase, iv.advanced_by, iv.id, "reward_fast_advance");
    praisesSent++;
  }

  return { praisesSent };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const now = new Date();

    // ── Load thresholds ───────────────────────────────────────────────────────
    const { data: cfgRow } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "chitra_escalation_thresholds")
      .maybeSingle();

    const thresholds: Thresholds = {
      kra2_stagnation_days: 5,
      kra2_level1_hours: 48,
      kra2_level2_hours: 96,
      kra3_deadline_buffer_days: 5,
      kra3_min_proceeded: 2,
      kra3_level1_hours: 24,
      kra4_feedback_grace_minutes: 120,
      kra4_streak_length: 5,
      ...(cfgRow?.config_value ?? {}),
    };

    // ── Shared data ───────────────────────────────────────────────────────────
    const { data: superAdminRow } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("is_super_admin", true)
      .maybeSingle();
    const superAdminId: string | null = (superAdminRow as any)?.user_id ?? null;
    const hrUserIds = await getHRUserIds(supabase);

    // ── Run KRAs ──────────────────────────────────────────────────────────────
    const [kra2, kra3, kra4] = await Promise.all([
      runKRA2(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA3(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA4(supabase, thresholds, superAdminId, now),
    ]);

    console.log(`[chitra-kra234] KRA2: ${kra2.stagnantFound} stagnant, ${kra2.stagnantActioned} actioned`);
    console.log(`[chitra-kra234] KRA3: ${kra3.atRiskFound} at-risk jobs, ${kra3.atRiskActioned} actioned`);
    console.log(`[chitra-kra234] KRA4: ${kra4.praisesSent} praises sent`);

    return new Response(
      JSON.stringify({ kra2, kra3, kra4 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("chitra-kra234 error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
