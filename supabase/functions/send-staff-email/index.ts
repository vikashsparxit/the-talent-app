import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAppLink, buildCandidateDrawerPath, buildPipelineCandidatePath, getEmailBranding } from "../_shared/emailLayout.ts";
import {
  sendTransactionalEmail,
  wasRecentlySent,
} from "../_shared/email.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import {
  buildInterviewScheduledEmail,
  buildVerdictSubmittedEmail,
} from "../_shared/transactionalEmailTemplates.ts";
import { isServiceRoleToken, requireStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type StaffEmailEvent = "interview_scheduled" | "verdict_submitted";

interface StaffEmailRequest {
  event: StaffEmailEvent;
  interview_id: string;
}

function requireInternalAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (isServiceRoleToken(token)) return true;
  const hookSecret = Deno.env.get("STAFF_EMAIL_HOOK_SECRET");
  const headerSecret = req.headers.get("x-staff-email-hook-secret");
  return !!hookSecret && headerSecret === hookSecret;
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "proceeded":
      return "Proceed ✓";
    case "rejected":
      return "Reject ✗";
    case "hold":
      return "On Hold";
    case "no_show":
      return "No Show";
    default:
      return verdict;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const isInternal = requireInternalAuth(req);
  if (!isInternal) {
    const auth = await requireStaff(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;
  }

  try {
    const { event, interview_id }: StaffEmailRequest = await req.json();
    if (!event || !interview_id) {
      return new Response(JSON.stringify({ error: "event and interview_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const branding = await getEmailBranding(supabase);

    const { data: interview, error: ivError } = await supabase
      .from("candidate_interviews")
      .select(`
        id,
        scheduled_at,
        interview_mode,
        meeting_link,
        verdict,
        interviewer_user_id,
        candidate:candidates(id, name),
        stage:job_interview_stages(id, name, job:jobs(id, title))
      `)
      .eq("id", interview_id)
      .maybeSingle();

    if (ivError || !interview) {
      return new Response(JSON.stringify({ error: "Interview not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidateName = (interview.candidate as { name?: string; id?: string } | null)?.name ?? "A candidate";
    const candidateId = (interview.candidate as { id?: string } | null)?.id;
    const jobTitle = (interview.stage as { job?: { title?: string; id?: string } } | null)?.job?.title ?? "a role";
    const jobId = (interview.stage as { job?: { id?: string } } | null)?.job?.id;
    const stageName = (interview.stage as { name?: string } | null)?.name ?? "Interview";
    const results: Array<{ recipient: string; status: string }> = [];

    if (event === "interview_scheduled") {
      if (!interview.scheduled_at) {
        return new Response(JSON.stringify({ success: true, skipped: "No scheduled_at" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await shouldSendEmail(supabase, "interview_scheduled"))) {
        return new Response(JSON.stringify({ success: true, skipped: "interview_scheduled disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: panelists } = await supabase
        .from("candidate_interview_panelists")
        .select("interviewer_user_id")
        .eq("candidate_interview_id", interview_id);

      const userIds = new Set<string>();
      if (interview.interviewer_user_id) userIds.add(interview.interviewer_user_id);
      for (const p of panelists ?? []) {
        if (p.interviewer_user_id) userIds.add(p.interviewer_user_id);
      }

      if (jobId) {
        const { data: recruiters } = await supabase
          .from("job_recruiters")
          .select("recruiter_user_id")
          .eq("job_id", jobId);
        for (const r of recruiters ?? []) {
          if (r.recruiter_user_id) userIds.add(r.recruiter_user_id);
        }
      }

      const scheduledDisplay = new Date(interview.scheduled_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }) + " IST";

      const modeLabel = interview.interview_mode === "video"
        ? "Video call"
        : interview.interview_mode === "phone"
        ? "Phone"
        : "In person";

      const candidateProfileUrl = candidateId
        ? buildAppLink(branding, buildPipelineCandidatePath(candidateId, jobId))
        : null;

      for (const userId of userIds) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle();

        const email = profile?.email?.trim();
        if (!email) continue;

        const dedupeKey = `${event}:${interview_id}:${userId}`;
        if (await wasRecentlySent(supabase, email, "interview_scheduled", dedupeKey)) {
          results.push({ recipient: email, status: "deduped" });
          continue;
        }

        const emailContent = buildInterviewScheduledEmail(branding, {
          recipientName: profile?.full_name ?? "there",
          candidateName,
          jobTitle,
          stageName,
          scheduledDisplay,
          modeLabel,
          meetingLink: interview.meeting_link,
          candidateProfileUrl,
        });

        const result = await sendTransactionalEmail({
          supabase,
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          templateType: "interview_scheduled",
          metadata: { interview_id, user_id: userId, dedupe_key: dedupeKey, event },
        });
        results.push({ recipient: email, status: result.status });
      }
    } else if (event === "verdict_submitted") {
      if (!interview.verdict) {
        return new Response(JSON.stringify({ success: true, skipped: "No verdict" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stageId = (interview.stage as { id?: string } | null)?.id;
      const jobId = (interview.stage as { job?: { id?: string } } | null)?.job?.id;
      if (!stageId || !jobId) {
        return new Response(JSON.stringify({ error: "Job/stage not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: recruiters } = await supabase
        .from("job_recruiters")
        .select("recruiter_user_id")
        .eq("job_id", jobId);

      const label = verdictLabel(String(interview.verdict));

      const candidateProfileUrl = candidateId
        ? buildAppLink(branding, buildPipelineCandidatePath(candidateId, jobId))
        : null;

      for (const r of recruiters ?? []) {
        if (!r.recruiter_user_id || r.recruiter_user_id === interview.interviewer_user_id) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", r.recruiter_user_id)
          .maybeSingle();

        const email = profile?.email?.trim();
        if (!email) continue;

        const dedupeKey = `${event}:${interview_id}:${r.recruiter_user_id}`;
        if (await wasRecentlySent(supabase, email, "verdict_submitted", dedupeKey)) {
          results.push({ recipient: email, status: "deduped" });
          continue;
        }

        const emailContent = buildVerdictSubmittedEmail(branding, {
          recipientName: profile?.full_name ?? "there",
          candidateName,
          jobTitle,
          stageName,
          verdictLabel: label,
          candidateProfileUrl,
        });

        const result = await sendTransactionalEmail({
          supabase,
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          templateType: "verdict_submitted",
          metadata: { interview_id, user_id: r.recruiter_user_id, dedupe_key: dedupeKey, event },
        });
        results.push({ recipient: email, status: result.status });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-staff-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
