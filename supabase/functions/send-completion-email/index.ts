import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { buildAppLink, buildCandidateDrawerPath, getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAssessmentCompletionHrEmail } from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompletionEmailRequest {
  candidateName?: string;
  candidateEmail?: string;
  assessmentTitle?: string;
  completedAt?: string;
  percentage?: number | null;
  passed?: boolean | null;
  hrEmails?: string[];
  candidateId?: string;
  candidate_assessment_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body: CompletionEmailRequest = await req.json();

    let candidateId = body.candidateId;
    let assessmentTitle = body.assessmentTitle ?? "Assessment";
    let completedAt = body.completedAt ?? new Date().toISOString();
    let percentage = body.percentage ?? null;
    let passed = body.passed ?? null;

    if (body.candidate_assessment_id) {
      const { data: ca } = await supabase
        .from("candidate_assessments")
        .select("id, candidate_id, completed_at, percentage, passed, assessment:assessments(title)")
        .eq("id", body.candidate_assessment_id)
        .maybeSingle();
      if (!ca?.candidate_id) {
        return new Response(JSON.stringify({ error: "Assessment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      candidateId = ca.candidate_id;
      const assessment = Array.isArray(ca.assessment) ? ca.assessment[0] : ca.assessment;
      assessmentTitle = (assessment as { title?: string } | null)?.title ?? assessmentTitle;
      completedAt = ca.completed_at ?? completedAt;
      percentage = ca.percentage;
      passed = ca.passed;
    }

    if (!candidateId) {
      return new Response(JSON.stringify({ error: "candidateId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, name, email, job_id")
      .eq("id", candidateId)
      .maybeSingle();

    if (!candidate) {
      return new Response(JSON.stringify({ error: "Candidate not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const candidateName = candidate.name || "Candidate";
    const candidateEmail = candidate.email || "";

    const recipientIds = new Set<string>();
    if (candidate.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, created_by")
        .eq("id", candidate.job_id)
        .maybeSingle();
      if (job?.created_by) recipientIds.add(job.created_by);

      const { data: recruiters } = await supabase
        .from("job_recruiters")
        .select("recruiter_user_id")
        .eq("job_id", candidate.job_id);
      for (const row of recruiters ?? []) {
        if (row.recruiter_user_id) recipientIds.add(row.recruiter_user_id);
      }
    }

    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "hr"]);
    for (const row of staffRoles ?? []) {
      if (row.user_id) recipientIds.add(row.user_id);
    }

    const { data: profiles } = recipientIds.size
      ? await supabase.from("profiles").select("email").in("user_id", [...recipientIds])
      : { data: [] as { email: string }[] };

    const hrEmails = [...new Set(
      (profiles ?? []).map((p) => p.email?.trim()).filter((e): e is string => !!e),
    )];

    const branding = await getEmailBranding(supabase);
    const candidateProfileUrl = buildAppLink(branding, buildCandidateDrawerPath(candidate.id));
    let sentCount = 0;

    for (const hrEmail of hrEmails) {
      const hrEmailContent = buildAssessmentCompletionHrEmail(branding, {
        candidateName,
        candidateEmail,
        assessmentTitle,
        completedAt,
        percentage,
        passed,
        candidateProfileUrl,
      });

      const hrResult = await sendTransactionalEmail({
        supabase,
        to: hrEmail,
        subject: hrEmailContent.subject,
        html: hrEmailContent.html,
        text: hrEmailContent.text,
        templateType: "assessment_completion",
        metadata: { assessment_title: assessmentTitle, recipient_role: "hr" },
      });

      if (hrResult.status === "sent") sentCount += 1;
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending completion email:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
