// ─────────────────────────────────────────────────────────────────────────────
// chitra-kra-phase3 — Chitragupta's Phase 3 KRA enforcement
//
// KRA  8 — Scheduling SLA: proceeded candidates with no next interview scheduled
// KRA  9 — No-Show Follow-Up: no-show interviews not rescheduled
// KRA 10 — On-Hold Resolution: candidates stuck on hold too long
// KRA 11 — Workload Balancing: interviewers overloaded relative to team avg
// KRA 13 — Pre-Screen Monitoring: new candidates not pre-screened
// KRA 14 — Assessment Abandonment: stalled invited/in-progress assessments
// KRA 15 — Recruiter Silence: recruiter with zero activity over N days
//
// Schedule: hourly (same cron as chitra-engine)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Thresholds {
  kra8_schedule_sla_hours: number;
  kra9_noshow_followup_hours: number;
  kra10_hold_days: number;
  kra10_level1_hours: number;
  kra11_max_weekly_interviews: number;
  kra13_prescreen_days: number;
  kra14_invite_days: number;
  kra14_inprogress_hours: number;
  kra15_inactivity_days: number;
}

// ── Shared helpers (mirrors chitra-kra234 pattern) ────────────────────────────

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
  extraButtons: { label: string; link: string }[] = [],
) {
  await insertNotification(supabase, superAdminId, type, title, message, link, "View Pipeline", extraButtons);
}

async function getHRUserIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", "hr");
  return (data ?? []).map((r: any) => r.user_id);
}

async function getPrimaryRecruiter(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
): Promise<{ id: string; name: string } | null> {
  for (const isPrimary of [true, false]) {
    const q = supabase
      .from("job_recruiters")
      .select("recruiter_user_id, profile:profiles!job_recruiters_recruiter_user_id_fkey(full_name)")
      .eq("job_id", jobId);

    if (isPrimary) (q as any).eq("is_primary", true);

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

// Get or create open escalation; returns null if already at max level or cooldown active
async function getOpenEscalation(
  supabase: ReturnType<typeof createClient>,
  violationType: string,
  referenceId: string,
) {
  const { data } = await supabase
    .from("chitra_escalations")
    .select("id, escalation_level, last_escalated_at")
    .eq("violation_type", violationType)
    .eq("reference_id", referenceId)
    .is("resolved_at", null)
    .maybeSingle();
  return data as any;
}

async function createEscalation(
  supabase: ReturnType<typeof createClient>,
  violationType: string,
  referenceId: string,
  subjectUserId: string | null,
  now: Date,
) {
  await supabase.from("chitra_escalations").insert({
    violation_type: violationType,
    subject_user_id: subjectUserId,
    reference_id: referenceId,
    escalation_level: 0,
    last_escalated_at: now.toISOString(),
  });
}

async function advanceEscalation(
  supabase: ReturnType<typeof createClient>,
  escalationId: string,
  newLevel: number,
  now: Date,
) {
  await supabase
    .from("chitra_escalations")
    .update({ escalation_level: newLevel, last_escalated_at: now.toISOString() })
    .eq("id", escalationId);
}

async function resolveEscalation(
  supabase: ReturnType<typeof createClient>,
  violationType: string,
  referenceId: string,
  now: Date,
) {
  await supabase
    .from("chitra_escalations")
    .update({ resolved_at: now.toISOString() })
    .eq("violation_type", violationType)
    .eq("reference_id", referenceId)
    .is("resolved_at", null);
}

// ── KRA 8 — Scheduling SLA ────────────────────────────────────────────────────
// After verdict = 'proceeded', recruiter must schedule next interview within N hours

async function runKRA8(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ found: number; actioned: number }> {
  const slaCutoff = new Date(
    now.getTime() - thresholds.kra8_schedule_sla_hours * 3_600_000,
  ).toISOString();

  // Find interviews where verdict = 'proceeded' and set more than N hours ago
  const { data: proceededRows } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, updated_at,
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        job_id,
        job:jobs!job_interview_stages_job_id_fkey(id, title)
      ),
      candidate:candidates!candidate_interviews_candidate_id_fkey(name, candidate_status)
    `)
    .eq("verdict", "proceeded")
    .lt("updated_at", slaCutoff);

  let found = 0;
  let actioned = 0;

  for (const iv of (proceededRows ?? []) as any[]) {
    const jobId: string = iv.stage?.job_id ?? "";
    const jobTitle: string = iv.stage?.job?.title ?? "Unknown Job";
    const candidateName: string = iv.candidate?.name ?? "Unknown";
    const candidateStatus: string = iv.candidate?.candidate_status ?? "";

    // Skip if candidate is already rejected/selected
    if (["rejected", "selected"].includes(candidateStatus)) continue;

    // Check if a newer interview exists for this candidate in the same job
    const { data: nextInterviews } = await supabase
      .from("candidate_interviews")
      .select("id")
      .eq("candidate_id", iv.candidate_id)
      .gt("created_at", iv.updated_at)
      .limit(1);

    if ((nextInterviews ?? []).length > 0) {
      // Next stage scheduled — auto-resolve any open escalation
      await resolveEscalation(supabase, "scheduling_sla", iv.id, now);
      continue;
    }

    found++;

    const esc = await getOpenEscalation(supabase, "scheduling_sla", iv.id);
    const recruiter = await getPrimaryRecruiter(supabase, jobId);
    const hoursElapsed = (now.getTime() - new Date(iv.updated_at).getTime()) / 3_600_000;

    if (!esc) {
      await createEscalation(supabase, "scheduling_sla", iv.id, recruiter?.id ?? null, now);

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `Schedule Next Interview — ${candidateName}`,
          `${candidateName} was marked as proceeded for ${jobTitle} but no next interview has been scheduled yet. Please arrange the next stage.`,
          "/pipeline", "View Pipeline",
        );
      }
      actioned++;
      continue;
    }

    const hoursSinceLast = (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    if (esc.escalation_level >= 1 || hoursSinceLast < 24) continue;

    // Level 1 — escalate to HR + SA
    await advanceEscalation(supabase, esc.id, 1, now);

    if (recruiter) {
      await insertNotification(
        supabase, recruiter.id, "chitra_warning",
        `Overdue: Next Stage Not Scheduled — ${jobTitle}`,
        `${candidateName} was marked proceeded ${Math.floor(hoursElapsed)}h ago for ${jobTitle} but no next interview is scheduled. HR has been informed.`,
        "/pipeline", "View Pipeline",
      );
    }

    for (const hrId of hrUserIds) {
      await insertNotification(
        supabase, hrId, "chitra_warning",
        `Scheduling SLA Breach — ${jobTitle}`,
        `${candidateName} proceeded in ${jobTitle} ${Math.floor(hoursElapsed)}h ago, but no next interview has been arranged. Recruiter was previously notified.`,
        "/pipeline", "View Pipeline",
      );
    }

    if (superAdminId) {
      await tellSuperAdmin(
        supabase, superAdminId, "chitra_warning",
        `Scheduling Delay — ${candidateName}`,
        `${candidateName} (${jobTitle}) has been waiting ${Math.floor(hoursElapsed)}h for a next interview after proceeding. Recruiter and HR have been notified.`,
        "/pipeline",
      );
    }
    actioned++;
  }

  return { found, actioned };
}

// ── KRA 9 — No-Show Follow-Up ─────────────────────────────────────────────────
// After verdict = 'no_show', recruiter must take action within N hours

async function runKRA9(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ found: number; actioned: number }> {
  const followupCutoff = new Date(
    now.getTime() - thresholds.kra9_noshow_followup_hours * 3_600_000,
  ).toISOString();

  const { data: noShowRows } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, updated_at,
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        job_id,
        job:jobs!job_interview_stages_job_id_fkey(title)
      ),
      candidate:candidates!candidate_interviews_candidate_id_fkey(name, candidate_status)
    `)
    .eq("verdict", "no_show")
    .lt("updated_at", followupCutoff);

  let found = 0;
  let actioned = 0;

  for (const iv of (noShowRows ?? []) as any[]) {
    const jobId: string = iv.stage?.job_id ?? "";
    const jobTitle: string = iv.stage?.job?.title ?? "Unknown Job";
    const candidateName: string = iv.candidate?.name ?? "Unknown";
    const candidateStatus: string = iv.candidate?.candidate_status ?? "";

    if (["rejected", "selected"].includes(candidateStatus)) {
      await resolveEscalation(supabase, "noshow_followup", iv.id, now);
      continue;
    }

    // Check if a new interview row exists after this no-show (reschedule or decision made)
    const { data: followupRows } = await supabase
      .from("candidate_interviews")
      .select("id")
      .eq("candidate_id", iv.candidate_id)
      .gt("created_at", iv.updated_at)
      .limit(1);

    if ((followupRows ?? []).length > 0) {
      await resolveEscalation(supabase, "noshow_followup", iv.id, now);
      continue;
    }

    found++;

    const esc = await getOpenEscalation(supabase, "noshow_followup", iv.id);
    const recruiter = await getPrimaryRecruiter(supabase, jobId);

    if (!esc) {
      await createEscalation(supabase, "noshow_followup", iv.id, recruiter?.id ?? null, now);

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `No-Show — Decision Needed: ${candidateName}`,
          `${candidateName} did not show for their ${jobTitle} interview. Should they be rescheduled or rejected? Please take action.`,
          "/pipeline", "View Pipeline",
        );
      }
      actioned++;
      continue;
    }

    // Already escalated — check for repeat no-shows (high-risk flag)
    if (esc.escalation_level >= 1) continue;
    const hoursSinceLast = (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    if (hoursSinceLast < 24) continue;

    // Count total no-shows for this candidate
    const { count: noShowCount } = await supabase
      .from("candidate_interviews")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", iv.candidate_id)
      .eq("verdict", "no_show");

    await advanceEscalation(supabase, esc.id, 1, now);

    const isRepeat = (noShowCount ?? 0) >= 2;
    const nType = isRepeat ? "chitra_warning" : "chitra_nudge";
    const title = isRepeat ? `High-Risk No-Show — ${candidateName}` : `No-Show Unresolved — ${candidateName}`;
    const msg = isRepeat
      ? `${candidateName} has ${noShowCount} no-shows recorded and no recruiter action taken yet on ${jobTitle}. Consider rejection.`
      : `${candidateName}'s no-show on ${jobTitle} has not been actioned by the recruiter after 24h.`;

    for (const hrId of hrUserIds) {
      await insertNotification(supabase, hrId, nType, title, msg, "/pipeline", "View Pipeline");
    }
    if (superAdminId) {
      await tellSuperAdmin(supabase, superAdminId, nType, title, msg, "/pipeline");
    }
    actioned++;
  }

  return { found, actioned };
}

// ── KRA 10 — On-Hold Resolution ───────────────────────────────────────────────
// Candidates stuck on 'hold' verdict for too long

async function runKRA10(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ found: number; actioned: number }> {
  const holdCutoff = new Date(
    now.getTime() - thresholds.kra10_hold_days * 86_400_000,
  ).toISOString();

  const { data: holdRows } = await supabase
    .from("candidate_interviews")
    .select(`
      id, candidate_id, updated_at,
      stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
        job_id,
        job:jobs!job_interview_stages_job_id_fkey(title)
      ),
      candidate:candidates!candidate_interviews_candidate_id_fkey(name, candidate_status)
    `)
    .eq("verdict", "hold")
    .lt("updated_at", holdCutoff);

  let found = 0;
  let actioned = 0;

  for (const iv of (holdRows ?? []) as any[]) {
    const jobId: string = iv.stage?.job_id ?? "";
    const jobTitle: string = iv.stage?.job?.title ?? "Unknown Job";
    const candidateName: string = iv.candidate?.name ?? "Unknown";
    const candidateStatus: string = iv.candidate?.candidate_status ?? "";

    if (["rejected", "selected"].includes(candidateStatus)) {
      await resolveEscalation(supabase, "hold_resolution", iv.id, now);
      continue;
    }

    // Check if a newer interview row exists (hold was resolved by scheduling next)
    const { data: newerRows } = await supabase
      .from("candidate_interviews")
      .select("id")
      .eq("candidate_id", iv.candidate_id)
      .gt("created_at", iv.updated_at)
      .limit(1);

    if ((newerRows ?? []).length > 0) {
      await resolveEscalation(supabase, "hold_resolution", iv.id, now);
      continue;
    }

    found++;

    const daysOnHold = Math.floor((now.getTime() - new Date(iv.updated_at).getTime()) / 86_400_000);
    const recruiter = await getPrimaryRecruiter(supabase, jobId);
    const esc = await getOpenEscalation(supabase, "hold_resolution", iv.id);

    if (!esc) {
      await createEscalation(supabase, "hold_resolution", iv.id, recruiter?.id ?? null, now);

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `On-Hold Too Long — ${candidateName}`,
          `${candidateName} has been on hold for ${daysOnHold} days for ${jobTitle}. Time to make a call — proceed or reject?`,
          "/pipeline", "View Pipeline",
        );
      }
      actioned++;
      continue;
    }

    const hoursSinceLast = (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    if (esc.escalation_level >= 1 || hoursSinceLast < thresholds.kra10_level1_hours) continue;

    // Level 1 — escalate to HR + SA
    await advanceEscalation(supabase, esc.id, 1, now);

    if (recruiter) {
      await insertNotification(
        supabase, recruiter.id, "chitra_warning",
        `Urgent: Candidate on Hold ${daysOnHold} Days`,
        `${candidateName} for ${jobTitle} has been on hold for ${daysOnHold} days with no decision. HR has been notified.`,
        "/pipeline", "View Pipeline",
      );
    }

    for (const hrId of hrUserIds) {
      await insertNotification(
        supabase, hrId, "chitra_warning",
        `Prolonged Hold — ${candidateName}`,
        `${candidateName} (${jobTitle}) has been on hold for ${daysOnHold} days. Recruiter was notified earlier with no action taken.`,
        "/pipeline", "View Pipeline",
      );
    }

    if (superAdminId) {
      await tellSuperAdmin(
        supabase, superAdminId, "chitra_warning",
        `${daysOnHold}-Day Hold — ${candidateName}`,
        `${candidateName} has been on hold for ${jobTitle} for ${daysOnHold} days. Both recruiter and HR have been notified with no resolution.`,
        "/pipeline",
      );
    }
    actioned++;
  }

  return { found, actioned };
}

// ── KRA 11 — Workload Balancing ───────────────────────────────────────────────
// Alert SA when an interviewer has >N upcoming interviews AND >2x team avg

async function runKRA11(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ notified: number }> {
  if (!superAdminId && hrUserIds.length === 0) return { notified: 0 };

  const next7days = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  const { data: upcomingRows } = await supabase
    .from("candidate_interviews")
    .select("interviewer_user_id, interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name)")
    .is("verdict", null)
    .not("interviewer_user_id", "is", null)
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", next7days);

  // Count per interviewer
  const countMap = new Map<string, { name: string; count: number }>();
  for (const row of (upcomingRows ?? []) as any[]) {
    const uid: string = row.interviewer_user_id;
    const name: string = row.interviewer?.full_name ?? "Unknown";
    const existing = countMap.get(uid);
    if (existing) {
      existing.count++;
    } else {
      countMap.set(uid, { name, count: 1 });
    }
  }

  if (countMap.size === 0) return { notified: 0 };

  const counts = Array.from(countMap.values()).map((v) => v.count);
  const teamAvg = counts.reduce((a, b) => a + b, 0) / counts.length;

  let notified = 0;

  for (const [uid, { name, count }] of countMap.entries()) {
    if (count <= thresholds.kra11_max_weekly_interviews) continue;
    if (count <= teamAvg * 2) continue;

    // De-dup: only notify once every 48h per interviewer
    const twoDaysAgo = new Date(now.getTime() - 48 * 3_600_000).toISOString();
    const { data: recentEsc } = await supabase
      .from("chitra_escalations")
      .select("id")
      .eq("violation_type", "workload_imbalance")
      .eq("reference_id", uid)
      .gte("created_at", twoDaysAgo)
      .limit(1)
      .maybeSingle();

    if (recentEsc) continue;

    await supabase.from("chitra_escalations").insert({
      violation_type: "workload_imbalance",
      subject_user_id: uid,
      reference_id: uid,
      escalation_level: 0,
      last_escalated_at: now.toISOString(),
      resolved_at: now.toISOString(), // informational — auto-resolved
    });

    const imbalanceTitle = `Workload Imbalance — ${name}`;
    const imbalanceMsg = `${name} has ${count} interviews scheduled in the next 7 days — ${Math.round(count / teamAvg)}x the team average (${teamAvg.toFixed(1)}). Consider redistributing.`;

    for (const hrId of hrUserIds) {
      await insertNotification(supabase, hrId, "chitra_nudge", imbalanceTitle, imbalanceMsg, "/pipeline", "View Pipeline");
    }
    if (superAdminId) {
      await tellSuperAdmin(supabase, superAdminId, "chitra_nudge", imbalanceTitle, imbalanceMsg, "/pipeline");
    }
    notified++;
  }

  return { notified };
}

// ── KRA 13 — Pre-Screen Monitoring ───────────────────────────────────────────
// New candidates sitting in 'new'/'reviewing' without a pre-screen

async function runKRA13(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ found: number; actioned: number }> {
  const prescreenCutoff = new Date(
    now.getTime() - thresholds.kra13_prescreen_days * 86_400_000,
  ).toISOString();

  const { data: pendingCandidates } = await supabase
    .from("candidates")
    .select("id, name, job_id, candidate_status, created_at")
    .in("candidate_status", ["new", "reviewing"])
    .lt("created_at", prescreenCutoff);

  let found = 0;
  let actioned = 0;

  for (const candidate of (pendingCandidates ?? []) as any[]) {
    // Check if pre-screen exists
    const { data: prescreen } = await supabase
      .from("candidate_prescreens")
      .select("id")
      .eq("candidate_id", candidate.id)
      .maybeSingle();

    if (prescreen) {
      await resolveEscalation(supabase, "prescreen_overdue", candidate.id, now);
      continue;
    }

    found++;

    const daysWaiting = Math.floor(
      (now.getTime() - new Date(candidate.created_at).getTime()) / 86_400_000,
    );

    const esc = await getOpenEscalation(supabase, "prescreen_overdue", candidate.id);
    const recruiter = candidate.job_id
      ? await getPrimaryRecruiter(supabase, candidate.job_id)
      : null;

    const jobParam = candidate.job_id ? `?job=${candidate.job_id}` : "";
    const candidateParam = candidate.job_id
      ? `?job=${candidate.job_id}&candidate=${candidate.id}`
      : `?candidate=${candidate.id}`;
    const pipelineLink = `/pipeline${jobParam}`;
    const candidateLink = `/pipeline${candidateParam}`;

    if (!esc) {
      await createEscalation(
        supabase, "prescreen_overdue", candidate.id, recruiter?.id ?? null, now,
      );

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `Pre-Screen Pending — ${candidate.name}`,
          `${candidate.name} has been in the pipeline for ${daysWaiting} days with no pre-screening completed. Please schedule a call.`,
          candidateLink, "View Candidate",
          [{ label: "View Pipeline", link: pipelineLink }],
        );
      } else {
        // No recruiter assigned — alert SA and HR both
        if (superAdminId) {
          await insertNotification(
            supabase, superAdminId, "chitra_warning",
            `Unassigned Candidate — ${candidate.name}`,
            `${candidate.name} has been waiting ${daysWaiting} days with no pre-screen and no recruiter assigned.`,
            candidateLink, "View Candidate",
            [{ label: "View Pipeline", link: pipelineLink }],
          );
        }
        for (const hrId of hrUserIds) {
          await insertNotification(
            supabase, hrId, "chitra_warning",
            `Unassigned Candidate — ${candidate.name}`,
            `${candidate.name} has been waiting ${daysWaiting} days with no pre-screen and no recruiter assigned. Please assign a recruiter.`,
            candidateLink, "View Candidate",
            [{ label: "View Pipeline", link: pipelineLink }],
          );
        }
      }
      actioned++;
      continue;
    }

    // Level 1 after 48h
    const hoursSinceLast = (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    if (esc.escalation_level >= 1 || hoursSinceLast < 48) continue;

    await advanceEscalation(supabase, esc.id, 1, now);

    if (superAdminId) {
      await insertNotification(
        supabase, superAdminId, "chitra_warning",
        `Pre-Screen Overdue — ${candidate.name}`,
        `${candidate.name} has been in the pipeline ${daysWaiting} days without a pre-screen. The recruiter was notified earlier with no action.`,
        candidateLink, "View Candidate",
        [{ label: "View Pipeline", link: pipelineLink }],
      );
    }
    actioned++;
  }

  return { found, actioned };
}

// ── KRA 14 — Assessment Abandonment ──────────────────────────────────────────
// Invited assessments not started, or in-progress assessments stalled

async function runKRA14(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ found: number; actioned: number }> {
  const inviteCutoff = new Date(
    now.getTime() - thresholds.kra14_invite_days * 86_400_000,
  ).toISOString();
  const inProgressCutoff = new Date(
    now.getTime() - thresholds.kra14_inprogress_hours * 3_600_000,
  ).toISOString();

  // Invited but not started
  const { data: invitedRows } = await supabase
    .from("candidate_assessments")
    .select("id, candidate_id, invited_at, candidate:candidates!candidate_assessments_candidate_id_fkey(name, job_id)")
    .eq("status", "invited")
    .lt("invited_at", inviteCutoff);

  // In-progress but stalled
  const { data: inProgressRows } = await supabase
    .from("candidate_assessments")
    .select("id, candidate_id, updated_at, candidate:candidates!candidate_assessments_candidate_id_fkey(name, job_id)")
    .eq("status", "in_progress")
    .lt("updated_at", inProgressCutoff);

  const allRows = [
    ...((invitedRows ?? []) as any[]).map((r) => ({ ...r, abandonType: "not_started" })),
    ...((inProgressRows ?? []) as any[]).map((r) => ({ ...r, abandonType: "stalled" })),
  ];

  let found = 0;
  let actioned = 0;

  for (const row of allRows) {
    const candidateName: string = row.candidate?.name ?? "Unknown";
    const jobId: string = row.candidate?.job_id ?? "";

    found++;

    const esc = await getOpenEscalation(supabase, "assessment_abandoned", row.id);
    const recruiter = jobId ? await getPrimaryRecruiter(supabase, jobId) : null;

    if (!esc) {
      await createEscalation(
        supabase, "assessment_abandoned", row.id, recruiter?.id ?? null, now,
      );

      const msg = row.abandonType === "not_started"
        ? `${candidateName} was invited to an assessment but hasn't started it yet. Follow up or reassign.`
        : `${candidateName} started an assessment but has been inactive for over ${thresholds.kra14_inprogress_hours}h.`;

      if (recruiter) {
        await insertNotification(
          supabase, recruiter.id, "chitra_nudge",
          `Assessment Stalled — ${candidateName}`,
          msg,
          "/pipeline", "View Pipeline",
        );
      } else if (superAdminId) {
        await tellSuperAdmin(
          supabase, superAdminId, "chitra_nudge",
          `Assessment Stalled — ${candidateName}`,
          msg, "/pipeline",
        );
      }
      actioned++;
      continue;
    }

    const hoursSinceLast = (now.getTime() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;
    if (esc.escalation_level >= 1 || hoursSinceLast < 48) continue;

    await advanceEscalation(supabase, esc.id, 1, now);

    const abandonTitle = `Assessment Abandoned — ${candidateName}`;
    const abandonMsg = `${candidateName}'s assessment has been ${row.abandonType === "not_started" ? "uninitiated" : "stalled"} for an extended period. Recruiter was notified with no follow-up.`;

    for (const hrId of hrUserIds) {
      await insertNotification(supabase, hrId, "chitra_warning", abandonTitle, abandonMsg, "/pipeline", "View Pipeline");
    }
    if (superAdminId) {
      await tellSuperAdmin(supabase, superAdminId, "chitra_warning", abandonTitle, abandonMsg, "/pipeline");
    }
    actioned++;
  }

  return { found, actioned };
}

// ── KRA 15 — Recruiter Silence ────────────────────────────────────────────────
// Recruiter with zero uploads AND zero advancements in N days

async function runKRA15(
  supabase: ReturnType<typeof createClient>,
  thresholds: Thresholds,
  superAdminId: string | null,
  hrUserIds: string[],
  now: Date,
): Promise<{ silentFound: number }> {
  if (!superAdminId && hrUserIds.length === 0) return { silentFound: 0 };

  const activityCutoff = new Date(
    now.getTime() - thresholds.kra15_inactivity_days * 86_400_000,
  ).toISOString();

  const { data: recruiters } = await supabase
    .from("user_roles")
    .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name)")
    .eq("role", "recruiter");

  let silentFound = 0;

  for (const r of (recruiters ?? []) as any[]) {
    const uid: string = r.user_id;
    const name: string = r.profile?.full_name ?? "A recruiter";

    const [{ count: uploads }, { count: advancements }] = await Promise.all([
      supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("uploaded_by", uid)
        .gte("created_at", activityCutoff),

      supabase
        .from("candidate_interviews")
        .select("id", { count: "exact", head: true })
        .eq("advanced_by", uid)
        .gte("advanced_at", activityCutoff),
    ]);

    if ((uploads ?? 0) > 0 || (advancements ?? 0) > 0) continue;

    // De-dup: only notify once per inactivity window
    const { data: recentEsc } = await supabase
      .from("chitra_escalations")
      .select("id")
      .eq("violation_type", "recruiter_silence")
      .eq("reference_id", uid)
      .gte("created_at", activityCutoff)
      .limit(1)
      .maybeSingle();

    if (recentEsc) continue;

    await supabase.from("chitra_escalations").insert({
      violation_type: "recruiter_silence",
      subject_user_id: uid,
      reference_id: uid,
      escalation_level: 0,
      last_escalated_at: now.toISOString(),
      resolved_at: now.toISOString(), // informational — auto-resolved
    });

    const silenceTitle = `No Activity — ${name}`;
    const silenceMsg = `${name} has had zero candidate uploads or pipeline advancements in the last ${thresholds.kra15_inactivity_days} days. Worth a check-in?`;

    for (const hrId of hrUserIds) {
      await insertNotification(supabase, hrId, "chitra_nudge", silenceTitle, silenceMsg, "/analytics", "View Analytics");
    }
    if (superAdminId) {
      await tellSuperAdmin(supabase, superAdminId, "chitra_nudge", silenceTitle, silenceMsg, "/analytics");
    }

    silentFound++;
  }

  return { silentFound };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const auth = await requireServiceRoleOrStaff(req, supabase, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();

    // ── Load thresholds ───────────────────────────────────────────────────────
    const { data: cfgRow } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "chitra_escalation_thresholds")
      .maybeSingle();

    const thresholds: Thresholds = {
      kra8_schedule_sla_hours: 48,
      kra9_noshow_followup_hours: 24,
      kra10_hold_days: 7,
      kra10_level1_hours: 48,
      kra11_max_weekly_interviews: 5,
      kra13_prescreen_days: 3,
      kra14_invite_days: 3,
      kra14_inprogress_hours: 48,
      kra15_inactivity_days: 5,
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
    const [kra8, kra9, kra10, kra11, kra13, kra14, kra15] = await Promise.all([
      runKRA8(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA9(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA10(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA11(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA13(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA14(supabase, thresholds, superAdminId, hrUserIds, now),
      runKRA15(supabase, thresholds, superAdminId, hrUserIds, now),
    ]);

    console.log(`[phase3] KRA8: ${kra8.found} found, ${kra8.actioned} actioned`);
    console.log(`[phase3] KRA9: ${kra9.found} found, ${kra9.actioned} actioned`);
    console.log(`[phase3] KRA10: ${kra10.found} found, ${kra10.actioned} actioned`);
    console.log(`[phase3] KRA11: ${kra11.notified} workload alerts sent`);
    console.log(`[phase3] KRA13: ${kra13.found} found, ${kra13.actioned} actioned`);
    console.log(`[phase3] KRA14: ${kra14.found} found, ${kra14.actioned} actioned`);
    console.log(`[phase3] KRA15: ${kra15.silentFound} silent recruiters alerted`);

    return new Response(
      JSON.stringify({ kra8, kra9, kra10, kra11, kra13, kra14, kra15 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("chitra-kra-phase3 error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
