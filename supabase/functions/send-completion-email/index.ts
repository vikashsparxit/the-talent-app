import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { buildAppLink, buildCandidateDrawerPath, getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAssessmentCompletionHrEmail } from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompletionEmailRequest {
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  completedAt: string;
  percentage?: number | null;
  passed?: boolean | null;
  hrEmails?: string[];
  candidateId?: string;
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
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const {
      candidateName,
      candidateEmail,
      assessmentTitle,
      completedAt,
      percentage,
      passed,
      hrEmails = [],
      candidateId,
    }: CompletionEmailRequest = await req.json();

    const branding = await getEmailBranding(supabase);
    const candidateProfileUrl = candidateId
      ? buildAppLink(branding, buildCandidateDrawerPath(candidateId))
      : null;
    let sentCount = 0;

    for (const hrEmail of hrEmails) {
      if (!hrEmail?.trim()) continue;
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
        to: hrEmail.trim(),
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
