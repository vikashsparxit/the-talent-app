import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse, HttpError } from "../_shared/errors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAssessmentInvitationEmail } from "../_shared/transactionalEmailTemplates.ts";

interface InvitationEmailRequest {
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  magicLink: string;
  deadline: string | null;
  companyName?: string;
}

const REQUIRED_FIELDS = ["candidateName", "candidateEmail", "assessmentTitle", "magicLink"] as const;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = await requireStaff(req, supabase, corsHeaders, ["admin", "hr", "recruiter"]);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as Partial<InvitationEmailRequest> | null;
    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = body?.[field];
      return typeof value !== "string" || !value.trim();
    });
    if (missing.length > 0) {
      throw new HttpError(400, `Missing required fields: ${missing.join(", ")}`);
    }

    const { candidateName, candidateEmail, assessmentTitle, magicLink } = body as InvitationEmailRequest;
    if (!/^https?:\/\//i.test(magicLink)) {
      throw new HttpError(400, "magicLink must be an http(s) URL");
    }
    const deadline = typeof body?.deadline === "string" ? body.deadline : null;

    const branding = await getEmailBranding(supabase);
    const { subject, html, text } = buildAssessmentInvitationEmail(branding, {
      candidateName,
      assessmentTitle,
      magicLink,
      deadline,
    });

    const result = await sendTransactionalEmail({
      supabase,
      to: candidateEmail,
      subject,
      html,
      text,
      templateType: "assessment_invitation",
      applicantEmail: candidateEmail,
      metadata: { assessment_title: assessmentTitle },
    });

    if (result.status === "failed") {
      throw new Error(result.error ?? "Send failed");
    }

    return new Response(JSON.stringify({ success: true, status: result.status, data: result.data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    return errorResponse("send-invitation-email", error, corsHeaders);
  }
};

serveWithCors(handler);
