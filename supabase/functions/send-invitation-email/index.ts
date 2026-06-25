import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAssessmentInvitationEmail } from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  magicLink: string;
  deadline: string | null;
  companyName?: string;
}

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

    const {
      candidateName,
      candidateEmail,
      assessmentTitle,
      magicLink,
      deadline,
    }: InvitationEmailRequest = await req.json();

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending invitation email:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
