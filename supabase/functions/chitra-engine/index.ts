// ────────────────────────────────────────────────────────────────────────────
// Chitragupta — AI HR Manager Engine
// Runs hourly. Scans for overdue interview feedback, creates/advances
// escalations, sends Gemini-generated notifications, and narrates every
// meaningful action back to the super admin in real time.
// ────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrStaff } from "../_shared/auth.ts";
import { fanOutChitraWarningEmail } from "../_shared/chitraEmailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface EscalationThresholds {
  grace_minutes: number;
  level1_hours: number;
  level2_hours: number;
  level3_hours: number;
  level4_hours: number;
}

interface OverdueInterview {
  id: string;
  candidate_id: string;
  candidate_name: string;
  interviewer_user_id: string;
  interviewer_name: string;
  stage_name: string;
  job_id: string;
  job_title: string;
  scheduled_at: string;
}

interface ChitraEscalation {
  id: string;
  escalation_level: number;
  last_escalated_at: string;
}

interface GeminiMessage {
  title: string;
  message: string;
}

/** Cap Gemini calls per hourly run to avoid edge-function CPU soft limits. */
const MAX_GEMINI_CALLS_PER_RUN = 15;

function fallbackMessage(
  level: number,
  interviewerName: string,
  candidateName: string,
  jobTitle: string,
  stageName: string,
  hoursOverdue: number,
): GeminiMessage {
  const hrs = Math.round(hoursOverdue);
  const fallbacks: GeminiMessage[] = [
    { title: "Feedback Reminder", message: `Hi ${interviewerName}, please submit feedback for ${candidateName}'s ${stageName} interview.` },
    { title: "Feedback Still Pending", message: `${candidateName}'s ${stageName} feedback is ${hrs}h overdue. Please submit.` },
    { title: "Feedback Escalation — HR Notified", message: `${interviewerName}'s feedback for ${candidateName} (${jobTitle}) is now ${hrs}h overdue.` },
    { title: "Pending Feedback — Admin Report", message: `${candidateName} (${jobTitle} / ${stageName}): feedback ${hrs}h overdue.` },
    { title: "Formal Warning: Feedback Overdue", message: `This is a formal notice. Feedback for ${candidateName}'s ${stageName} interview is ${hrs}h overdue.` },
  ];
  return fallbacks[level] ?? fallbacks[0];
}

/** Strip markdown fences and extract a JSON object from Gemini prose responses. */
function parseGeminiJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.replace(/```json?\n?/gi, "").replace(/```/g, "").trim(),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* try next */ }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* ignore */ }
  }

  return null;
}

// Returns a friendly first name: strips email domain if full_name is an email,
// otherwise returns the first word. Capitalizes the result.
function friendlyName(fullName: string | null | undefined, fallback = "Interviewer"): string {
  if (!fullName) return fallback;
  const base = fullName.includes("@") ? fullName.split("@")[0] : fullName.split(" ")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ── Gemini message generator ─────────────────────────────────────────────────

async function generateMessage(
  apiKey: string,
  level: number,
  interviewerName: string,
  candidateName: string,
  jobTitle: string,
  stageName: string,
  hoursOverdue: number,
  geminiBudget: { remaining: number },
): Promise<GeminiMessage> {
  const fallback = () =>
    fallbackMessage(level, interviewerName, candidateName, jobTitle, stageName, hoursOverdue);

  if (!apiKey || geminiBudget.remaining <= 0) return fallback();

  const toneGuide = [
    `0 = warm and helpful. Start with "Hi ${interviewerName}," and gently remind them. Approachable, no pressure.`,
    `1 = firm but collegial. Point out this is a follow-up. Professional tone, light urgency.`,
    `2 = professional formal. This is an HR escalation notice. Factual and measured.`,
    `3 = concise admin summary bullet. No greeting. One sentence for a report.`,
    `4 = formal on-record warning. Serious tone. State this is a formal notice being recorded.`,
  ][level] ?? "professional";

  const prompt = `You are Chitragupta, an AI HR Manager for a recruitment platform called SparxIT.

Generate a SHORT in-app notification for escalation level ${level}.
Tone guide: ${toneGuide}

Context:
- Interviewer: ${interviewerName}
- Candidate: ${candidateName}
- Job: ${jobTitle}
- Stage: ${stageName}
- Hours overdue: ${Math.round(hoursOverdue)}h

Rules:
- Title: max 60 characters
- Message: max 120 characters, no markdown
- Do NOT include interviewer name in the title
- Output raw JSON only — no preamble, no markdown fences, no text before or after the object
- Return exactly: { "title": "...", "message": "..." }`;

  geminiBudget.remaining--;

  try {
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!res.ok) {
      console.error("Gemini HTTP error:", res.status, (await res.text()).slice(0, 200));
      return fallback();
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseGeminiJsonObject(text);
    if (parsed?.title && parsed?.message) {
      return {
        title: String(parsed.title).slice(0, 60),
        message: String(parsed.message).slice(0, 120),
      };
    }
    console.error("Gemini returned unparseable content:", text.slice(0, 120));
  } catch (e) {
    console.error("Gemini error:", e);
  }

  return fallback();
}

// ── Notification helpers ──────────────────────────────────────────────────────

function notifType(level: number): string {
  return level === 4 ? "chitra_warning" : "chitra_nudge";
}

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
    title,
    message,
    link,
    source: "chitra",
    action_buttons: [{ label: actionLabel, link }, ...extraButtons],
  });
  if (error) console.error(`Failed to insert notification for ${userId}:`, error.message);
}

// Narrate an action back to the super admin — conversational, first-person
async function tellSuperAdmin(
  supabase: ReturnType<typeof createClient>,
  superAdminId: string,
  type: string,
  title: string,
  message: string,
  link: string,
  extraButtons: { label: string; link: string }[] = [],
) {
  await insertNotification(supabase, superAdminId, type, title, message, link, "View Pipeline", extraButtons);
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const auth = await requireServiceRoleOrStaff(req, supabase, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    // ── 1. Load thresholds ────────────────────────────────────────────────────
    const { data: cfgRow } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "chitra_escalation_thresholds")
      .maybeSingle();

    const thresholds: EscalationThresholds = {
      grace_minutes: 30,
      level1_hours: 24,
      level2_hours: 48,
      level3_hours: 72,
      level4_hours: 96,
      ...(cfgRow?.config_value ?? {}),
    };

    // ── 2. Find overdue interviews ────────────────────────────────────────────
    const graceCutoff = new Date(Date.now() - thresholds.grace_minutes * 60 * 1000).toISOString();

    const { data: overdueRows, error: overdueErr } = await supabase
      .from("candidate_interviews")
      .select(`
        id,
        candidate_id,
        interviewer_user_id,
        scheduled_at,
        candidate:candidates!candidate_interviews_candidate_id_fkey(name),
        interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name),
        stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name, job_id,
          job:jobs!job_interview_stages_job_id_fkey(title)
        )
      `)
      .lt("scheduled_at", graceCutoff)
      .is("verdict", null)
      .not("interviewer_user_id", "is", null);

    if (overdueErr) throw overdueErr;

    // Flatten nested selects
    const overdue: OverdueInterview[] = ((overdueRows ?? []) as any[]).map((r) => ({
      id: r.id,
      candidate_id: r.candidate_id,
      candidate_name: r.candidate?.name ?? "Unknown Candidate",
      interviewer_user_id: r.interviewer_user_id,
      interviewer_name: friendlyName(r.interviewer?.full_name),
      stage_name: r.stage?.stage_name ?? "Interview",
      job_id: r.stage?.job_id ?? "",
      job_title: r.stage?.job?.title ?? "Unknown Job",
      scheduled_at: r.scheduled_at,
    }));

    // ── 3. Fetch supporting data ──────────────────────────────────────────────
    const { data: hrRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "hr");
    const hrUserIds: string[] = (hrRows ?? []).map((r: any) => r.user_id);

    // Fetch super admin — name + id (name used in first-person narration)
    const { data: superAdminRow } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("is_super_admin", true)
      .maybeSingle();
    const superAdminId: string | null = (superAdminRow as any)?.user_id ?? null;

    // ── 4. Resolution notifications (interviews resolved since last engine run) ─
    // Window: 70 min (60 min cron + 10 min buffer to avoid gaps between runs)
    const resolutionWindow = new Date(Date.now() - 70 * 60 * 1000).toISOString();

    if (superAdminId) {
      const { data: recentlyResolved } = await supabase
        .from("chitra_escalations")
        .select(`
          id,
          escalation_level,
          subject_user_id,
          reference_id,
          interviewer:profiles!chitra_escalations_subject_user_id_fkey(full_name),
          interview:candidate_interviews!chitra_escalations_reference_id_fkey(
            candidate:candidates!candidate_interviews_candidate_id_fkey(name),
            stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name)
          )
        `)
        .not("resolved_at", "is", null)
        .gte("resolved_at", resolutionWindow);

      for (const r of (recentlyResolved ?? []) as any[]) {
        const interviewerName = friendlyName(r.interviewer?.full_name, "The interviewer");
        const candidateName = r.interview?.candidate?.name ?? "the candidate";
        const stageName = r.interview?.stage?.stage_name ?? "the interview";

        await tellSuperAdmin(
          supabase,
          superAdminId,
          "chitra_nudge",
          `Resolved — ${candidateName}`,
          `${interviewerName} just submitted feedback for ${candidateName}'s ${stageName}. Escalation closed.`,
          "/pipeline",
        );
      }
    }

    // ── 5. Process each overdue interview ─────────────────────────────────────
    if (!overdue.length) {
      return new Response(
        JSON.stringify({ processed: 0, resolved_notified: 0, message: "No overdue interviews" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openEscByRef = new Map<string, ChitraEscalation>();
    const overdueIds = overdue.map((iv) => iv.id);
    const batchSize = 200;
    for (let i = 0; i < overdueIds.length; i += batchSize) {
      const chunk = overdueIds.slice(i, i + batchSize);
      const { data: openRows } = await supabase
        .from("chitra_escalations")
        .select("id, escalation_level, last_escalated_at, reference_id")
        .eq("violation_type", "overdue_feedback")
        .in("reference_id", chunk)
        .is("resolved_at", null);
      (openRows ?? []).forEach((row) => {
        openEscByRef.set(row.reference_id, row as ChitraEscalation);
      });
    }

    let processed = 0;
    let escalated = 0;
    const geminiBudget = { remaining: MAX_GEMINI_CALLS_PER_RUN };

    for (const iv of overdue) {
      const hoursOverdue =
        (Date.now() - new Date(iv.scheduled_at).getTime()) / 3_600_000;

      const esc = openEscByRef.get(iv.id) ?? null;
      const pipelineLink = iv.job_id ? `/pipeline?job=${iv.job_id}` : "/pipeline";

      if (!esc) {
        // Level 0 — first soft nudge to interviewer only. Silent to super admin.
        const msg = await generateMessage(
          GEMINI_API_KEY, 0,
          iv.interviewer_name, iv.candidate_name, iv.job_title, iv.stage_name, hoursOverdue,
          geminiBudget,
        );

        await supabase.from("chitra_escalations").insert({
          violation_type: "overdue_feedback",
          subject_user_id: iv.interviewer_user_id,
          reference_id: iv.id,
          escalation_level: 0,
          last_escalated_at: new Date().toISOString(),
        });

        await insertNotification(
          supabase, iv.interviewer_user_id, notifType(0),
          msg.title, msg.message, pipelineLink, "Submit Feedback",
        );
        processed++;
        continue;
      }

      // Check if it's time to advance
      const hoursSinceLast =
        (Date.now() - new Date(esc.last_escalated_at).getTime()) / 3_600_000;

      const advanceAfterHours = [
        thresholds.level1_hours,                                        // 0→1
        thresholds.level2_hours - thresholds.level1_hours,             // 1→2
        thresholds.level3_hours - thresholds.level2_hours,             // 2→3
        thresholds.level4_hours - thresholds.level3_hours,             // 3→4
      ];

      const currentLevel = esc.escalation_level;
      if (currentLevel >= 4) continue;

      const threshold = advanceAfterHours[currentLevel];
      if (hoursSinceLast < threshold) continue;

      const newLevel = currentLevel + 1;
      const msg = await generateMessage(
        GEMINI_API_KEY, newLevel,
        iv.interviewer_name, iv.candidate_name, iv.job_title, iv.stage_name, hoursOverdue,
        geminiBudget,
      );
      const nType = notifType(newLevel);
      const hrs = Math.round(hoursOverdue);

      // Advance the escalation record
      await supabase
        .from("chitra_escalations")
        .update({ escalation_level: newLevel, last_escalated_at: new Date().toISOString() })
        .eq("id", esc.id);

      // ── Level 1: Firm nudge + recruiter loop-in ───────────────────────────
      if (newLevel === 1) {
        await insertNotification(
          supabase, iv.interviewer_user_id, nType,
          msg.title, msg.message, pipelineLink, "Submit Feedback",
        );

        const { data: recruiters } = await supabase
          .from("job_recruiters")
          .select("recruiter_user_id, recruiter:profiles!job_recruiters_recruiter_user_id_fkey(full_name)")
          .eq("job_id", iv.job_id);

        const recruiterNames: string[] = [];
        for (const r of (recruiters ?? []) as any[]) {
          const rName = friendlyName(r.recruiter?.full_name, "the recruiter");
          recruiterNames.push(rName);
          await insertNotification(
            supabase, r.recruiter_user_id, "chitra_nudge",
            `Feedback Pending: ${iv.candidate_name}`,
            `${iv.interviewer_name} has not submitted feedback for ${iv.candidate_name}'s ${iv.stage_name} (${hrs}h overdue).`,
            pipelineLink, "View Pipeline",
          );
        }

        // Tell super admin what was just done
        if (superAdminId) {
          const hasRecruiters = recruiterNames.length > 0;
          const recruiterPhrase = hasRecruiters
            ? `and asked ${recruiterNames.join(" & ")} to follow up`
            : "but found no recruiter assigned to this job";
          const saTitle = hasRecruiters
            ? `Looped In Recruiter — ${iv.candidate_name}`
            : `No Recruiter Assigned — ${iv.candidate_name}`;
          await tellSuperAdmin(
            supabase, superAdminId, hasRecruiters ? "chitra_nudge" : "chitra_warning",
            saTitle,
            `Just sent a firm reminder to ${iv.interviewer_name} ${recruiterPhrase}. ${iv.candidate_name}'s ${iv.stage_name} feedback is ${hrs}h overdue.`,
            pipelineLink,
          );
        }

      // ── Level 2: HR escalation ────────────────────────────────────────────
      } else if (newLevel === 2) {
        for (const hrId of hrUserIds) {
          await insertNotification(
            supabase, hrId, nType,
            msg.title, msg.message, pipelineLink, "View Pipeline",
          );
        }

        // Tell super admin
        if (superAdminId) {
          await tellSuperAdmin(
            supabase, superAdminId, "chitra_nudge",
            `Escalated to HR — ${iv.candidate_name}`,
            `Just notified HR about ${iv.interviewer_name}'s pending ${iv.stage_name} feedback for ${iv.candidate_name} — now ${hrs}h overdue.`,
            pipelineLink,
          );
        }

      // ── Level 3: HR escalation (direct intervention requested) ──────────
      } else if (newLevel === 3) {
        // HR owns L3 — they need to intervene directly with the interviewer.
        // SA no longer receives this level to avoid alert fatigue (HR will handle it).
        for (const hrId of hrUserIds) {
          await insertNotification(
            supabase, hrId, "chitra_nudge",
            `Urgent: Feedback Still Pending — ${iv.candidate_name}`,
            `${iv.interviewer_name} is ${hrs}h overdue on ${iv.candidate_name}'s ${iv.stage_name} feedback. Recruiter was already notified. Please intervene directly.`,
            pipelineLink, "View Pipeline",
          );
        }

      // ── Level 4: Formal warning ───────────────────────────────────────────
      } else if (newLevel === 4) {
        // Formal warning to interviewer
        await insertNotification(
          supabase, iv.interviewer_user_id, "chitra_warning",
          msg.title, msg.message, pipelineLink, "Submit Feedback Now",
        );
        await fanOutChitraWarningEmail(
          supabase, iv.interviewer_user_id, msg.title, msg.message, pipelineLink,
          { candidateId: iv.candidate_id, candidateName: iv.candidate_name, jobId: iv.job_id },
        );

        // Warn recruiters
        const { data: recruiters } = await supabase
          .from("job_recruiters")
          .select("recruiter_user_id")
          .eq("job_id", iv.job_id);

        for (const r of (recruiters ?? []) as any[]) {
          await insertNotification(
            supabase, r.recruiter_user_id, "chitra_warning",
            `Formal Warning Issued: ${iv.candidate_name}`,
            `A formal warning has been issued to ${iv.interviewer_name} for not submitting feedback for ${iv.candidate_name}.`,
            pipelineLink, "View Pipeline",
          );
        }

        // Warn HR
        for (const hrId of hrUserIds) {
          await insertNotification(
            supabase, hrId, "chitra_warning",
            `Formal Warning Issued: ${iv.candidate_name}`,
            `${iv.interviewer_name} has been issued a formal warning for ${hrs}h overdue feedback on ${iv.candidate_name}.`,
            pipelineLink, "View Pipeline",
          );
        }

        // Tell super admin — prominent, conversational
        if (superAdminId) {
          await tellSuperAdmin(
            supabase, superAdminId, "chitra_warning",
            `Formal Warning Issued — ${iv.candidate_name}`,
            `Issued a formal warning to ${iv.interviewer_name} for ${iv.candidate_name}'s ${iv.stage_name} feedback (${hrs}h overdue). CC'd recruiter, HR, and flagged to you on record.`,
            pipelineLink,
          );
        }
      }

      processed++;
      escalated++;
    }

    return new Response(
      JSON.stringify({ processed, escalated, total_overdue: overdue.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("chitra-engine error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
