import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceRoleToken } from "../_shared/auth.ts";
import { buildAppLink, buildCandidateDrawerPath, getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail, wasRecentlySent } from "../_shared/email.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import {
  buildCandidateHiredApplicantEmail,
  buildCandidateHiredStaffEmail,
} from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HireEmailRequest {
  candidate_id: string;
}

function requireInternalAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "");
  if (isServiceRoleToken(token)) return true;
  const hookSecret = Deno.env.get("HIRE_EMAIL_HOOK_SECRET");
  const headerSecret = req.headers.get("x-hire-email-hook-secret");
  return !!hookSecret && headerSecret === hookSecret;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!requireInternalAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { candidate_id }: HireEmailRequest = await req.json();
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: "candidate_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: candidate, error: candError } = await supabase
      .from("candidates")
      .select("id, name, email, hired_at, job_id, job:jobs(id, title)")
      .eq("id", candidate_id)
      .maybeSingle();

    if (candError || !candidate?.hired_at) {
      return new Response(JSON.stringify({ error: "Candidate not found or not hired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const branding = await getEmailBranding(supabase);
    const candidateName = candidate.name ?? "Candidate";
    const jobTitle = (candidate.job as { title?: string } | null)?.title ?? "a role";
    const candidateProfileUrl = buildAppLink(branding, buildCandidateDrawerPath(candidate.id));
    const results: Array<{ recipient: string; status: string; type: string }> = [];

    if (await shouldSendEmail(supabase, "candidate_hired_staff")) {
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "hr"]);

      const staffIds = [...new Set((staffRoles ?? []).map((r) => r.user_id).filter(Boolean))];

      for (const userId of staffIds) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle();

        const email = profile?.email?.trim();
        if (!email) continue;

        const dedupeKey = `candidate_hired_staff:${candidate_id}:${userId}`;
        if (await wasRecentlySent(supabase, email, "candidate_hired_staff", dedupeKey)) {
          results.push({ recipient: email, status: "deduped", type: "candidate_hired_staff" });
          continue;
        }

        const content = buildCandidateHiredStaffEmail(branding, {
          recipientName: profile?.full_name ?? "there",
          candidateName,
          jobTitle,
          hiredAt: candidate.hired_at,
          candidateProfileUrl,
        });

        const result = await sendTransactionalEmail({
          supabase,
          to: email,
          subject: content.subject,
          html: content.html,
          text: content.text,
          templateType: "candidate_hired_staff",
          metadata: { candidate_id, user_id: userId, dedupe_key: dedupeKey },
        });
        results.push({ recipient: email, status: result.status, type: "candidate_hired_staff" });
      }
    }

    if (await shouldSendEmail(supabase, "candidate_hired_applicant")) {
      const applicantEmail = candidate.email?.trim();
      if (applicantEmail) {
        const dedupeKey = `candidate_hired_applicant:${candidate_id}`;
        if (!(await wasRecentlySent(supabase, applicantEmail, "candidate_hired_applicant", dedupeKey))) {
          const content = buildCandidateHiredApplicantEmail(branding, {
            applicantName: candidateName,
            jobTitle,
          });

          const result = await sendTransactionalEmail({
            supabase,
            to: applicantEmail,
            subject: content.subject,
            html: content.html,
            text: content.text,
            templateType: "candidate_hired_applicant",
            applicantEmail,
            metadata: { candidate_id, dedupe_key: dedupeKey },
          });
          results.push({ recipient: applicantEmail, status: result.status, type: "candidate_hired_applicant" });
        } else {
          results.push({ recipient: applicantEmail, status: "deduped", type: "candidate_hired_applicant" });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-hire-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
