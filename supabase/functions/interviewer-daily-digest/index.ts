// ─────────────────────────────────────────────────────────────────────────────
// interviewer-daily-digest — Morning email listing today's interviews
//
// Sent every morning at 9 AM IST to each interviewer/panelist who has
// interviews scheduled that day. No role filter — admins included if assigned.
//
// Schedule: daily at 9 AM IST (3:30 AM UTC) via pg_cron
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendTransactionalEmail,
  wasRecentlySent,
} from "../_shared/email.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import {
  buildAppLink,
  getEmailBranding,
} from "../_shared/emailLayout.ts";
import {
  buildInterviewerDailyDigestEmail,
  type DigestInterviewItem,
} from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RawInterview {
  id: string;
  scheduled_at: string;
  interview_mode: string | null;
  meeting_link: string | null;
  interviewer_user_id: string | null;
  candidate: { id?: string; name?: string } | null;
  stage: {
    stage_name?: string;
    job?: { id?: string; title?: string };
  } | null;
  panelists: Array<{ interviewer_user_id: string }> | null;
}

function getIstDayBounds(now = new Date()): {
  start: string;
  end: string;
  dateKey: string;
  dateDisplay: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const dateKey = `${year}-${month}-${day}`;

  const start = new Date(`${dateKey}T00:00:00+05:30`).toISOString();
  const end = new Date(`${dateKey}T23:59:59.999+05:30`).toISOString();
  const dateDisplay = new Date(start).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return { start, end, dateKey, dateDisplay };
}

function modeLabel(mode: string | null): string {
  if (mode === "video") return "Video call";
  if (mode === "phone") return "Phone";
  return "In person";
}

function formatScheduledDisplay(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " IST";
}

function toDigestItem(
  interview: RawInterview,
  branding: Awaited<ReturnType<typeof getEmailBranding>>,
): DigestInterviewItem {
  const candidateName = interview.candidate?.name ?? "A candidate";
  const candidateId = interview.candidate?.id;
  const jobTitle = interview.stage?.job?.title ?? "a role";
  const jobId = interview.stage?.job?.id;
  const stageName = interview.stage?.stage_name ?? "Interview";

  return {
    candidateName,
    jobTitle,
    stageName,
    scheduledDisplay: formatScheduledDisplay(interview.scheduled_at),
    modeLabel: modeLabel(interview.interview_mode),
    meetingLink: interview.meeting_link,
    candidateProfileUrl: candidateId
      ? buildAppLink(
        branding,
        jobId ? `/pipeline?job=${jobId}&candidate=${candidateId}` : `/pipeline?candidate=${candidateId}`,
      )
      : null,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (!(await shouldSendEmail(supabase, "interviewer_daily_digest"))) {
      return new Response(
        JSON.stringify({ success: true, skipped: "interviewer_daily_digest disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { start, end, dateKey, dateDisplay } = getIstDayBounds();
    const branding = await getEmailBranding(supabase);
    const calendarUrl = buildAppLink(branding, "/calendar");

    const { data: interviews, error: ivError } = await supabase
      .from("candidate_interviews")
      .select(`
        id,
        scheduled_at,
        interview_mode,
        meeting_link,
        interviewer_user_id,
        candidate:candidates(id, name),
        stage:job_interview_stages(id, stage_name, job:jobs(id, title)),
        panelists:candidate_interview_panelists(interviewer_user_id)
      `)
      .gte("scheduled_at", start)
      .lte("scheduled_at", end)
      .is("verdict", null)
      .is("removed_from_pipeline_at", null)
      .order("scheduled_at", { ascending: true });

    if (ivError) throw ivError;

    const interviewsByUser = new Map<string, DigestInterviewItem[]>();

    for (const row of (interviews ?? []) as RawInterview[]) {
      const item = toDigestItem(row, branding);
      const userIds = new Set<string>();

      if (row.interviewer_user_id) userIds.add(row.interviewer_user_id);
      for (const panelist of row.panelists ?? []) {
        if (panelist.interviewer_user_id) userIds.add(panelist.interviewer_user_id);
      }

      for (const userId of userIds) {
        const existing = interviewsByUser.get(userId) ?? [];
        existing.push(item);
        interviewsByUser.set(userId, existing);
      }
    }

    const results: Array<{ recipient: string; status: string; count: number }> = [];

    for (const [userId, items] of interviewsByUser.entries()) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", userId)
        .maybeSingle();

      const email = profile?.email?.trim();
      if (!email) continue;

      const dedupeKey = `interviewer_daily_digest:${dateKey}:${userId}`;
      if (await wasRecentlySent(supabase, email, "interviewer_daily_digest", dedupeKey, 1440)) {
        results.push({ recipient: email, status: "deduped", count: items.length });
        continue;
      }

      const emailContent = buildInterviewerDailyDigestEmail(branding, {
        recipientName: profile?.full_name ?? "there",
        dateDisplay,
        interviews: items,
        calendarUrl,
      });

      const result = await sendTransactionalEmail({
        supabase,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        templateType: "interviewer_daily_digest",
        metadata: { date: dateKey, user_id: userId, dedupe_key: dedupeKey, interview_count: items.length },
      });

      results.push({ recipient: email, status: result.status, count: items.length });
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: dateKey,
        interviewers_notified: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("interviewer-daily-digest error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
