import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { buildAppLink, getEmailBranding } from "../_shared/emailLayout.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import { buildApplicantEmail } from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplicantEmailRequest {
  type: "application_received" | "application_form_required" | "job_details" | "shortlist" | "reject" | "hold" | "backout" | "assessment_assigned";
  applicant_name: string;
  applicant_email: string;
  job_title: string;
  application_id?: string;
  rejection_reason?: string;
  assessment_title?: string;
  deadline?: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  entry: "Entry Level",
  mid: "Mid Level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
};

const EXPERIENCE_YEARS_LABELS: Record<string, string> = {
  fresh: "0 (Fresh)",
  "0_6_months": "0-6 Months",
  "6_months_plus": "6 Months+",
  "1_year_plus": "1 Year+",
  "2_years_plus": "2 Years+",
  "3_years_plus": "3 Years+",
  "5_years_plus": "5 Years+",
  "8_years_plus": "8 Years+",
  "10_years_plus": "10 Years+",
  "12_years_plus": "12 Years+",
  "15_years_plus": "15 Years+",
};

function formatExperienceLabel(
  experienceLevel?: string | null,
  experienceYearsRange?: string | null,
): string | undefined {
  const parts = [
    experienceLevel ? EXPERIENCE_LEVEL_LABELS[experienceLevel] : undefined,
    experienceYearsRange ? EXPERIENCE_YEARS_LABELS[experienceYearsRange] : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ApplicantEmailRequest = await req.json();
    const { type, applicant_name, applicant_email, job_title, rejection_reason, application_id } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (type === "application_received") {
      const { data: jobRow } = await supabaseAdmin
        .from("jobs")
        .select("id")
        .ilike("title", job_title)
        .limit(1)
        .maybeSingle();

      if (!jobRow?.id) {
        return new Response(JSON.stringify({ error: "Invalid job" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentApp } = await supabaseAdmin
        .from("job_applications")
        .select("id")
        .eq("applicant_email", applicant_email)
        .eq("job_id", jobRow.id)
        .gte("created_at", since)
        .limit(1);

      if (!recentApp?.length) {
        return new Response(JSON.stringify({ error: "No recent application found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (type === "shortlist" || type === "reject" || type === "hold" || type === "backout" || type === "assessment_assigned" || type === "application_form_required" || type === "job_details") {
      const auth = await requireStaff(req, supabaseAdmin, corsHeaders, ["admin", "hr", "recruiter"]);
      if (!auth.ok) return auth.response;

      if (type === "application_form_required") {
        if (!application_id) {
          return new Response(JSON.stringify({ error: "application_id is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: appRow } = await supabaseAdmin
          .from("job_applications")
          .select(`
            id,
            job_id,
            applicant_email,
            job:jobs(id, title, require_digital_application_form)
          `)
          .eq("id", application_id)
          .maybeSingle();

        if (!appRow?.id) {
          return new Response(JSON.stringify({ error: "Application not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const jobRequiresForm = (appRow.job as { require_digital_application_form?: boolean } | null)
          ?.require_digital_application_form !== false;
        if (!jobRequiresForm) {
          return new Response(JSON.stringify({ error: "Digital application form is not required for this job" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: formRow } = await supabaseAdmin
          .from("job_application_forms")
          .select("status")
          .eq("job_application_id", application_id)
          .maybeSingle();

        if (formRow?.status === "submitted") {
          return new Response(JSON.stringify({ error: "Application form is already submitted" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (appRow.applicant_email.toLowerCase() !== applicant_email.toLowerCase()) {
          return new Response(JSON.stringify({ error: "Applicant email does not match application" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (type === "job_details") {
        if (!application_id) {
          return new Response(JSON.stringify({ error: "application_id is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: appRow } = await supabaseAdmin
          .from("job_applications")
          .select(`
            id,
            applicant_email,
            job:jobs(id, title)
          `)
          .eq("id", application_id)
          .maybeSingle();

        if (!appRow?.id) {
          return new Response(JSON.stringify({ error: "Application not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (appRow.applicant_email.toLowerCase() !== applicant_email.toLowerCase()) {
          return new Response(JSON.stringify({ error: "Applicant email does not match application" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!type || !applicant_name || !applicant_email || !job_title) {
      throw new Error("Missing required fields: type, applicant_name, applicant_email, job_title");
    }

    if ((type === "reject" || type === "backout") && !rejection_reason) {
      throw new Error("Rejection reason is required for rejection/backout emails");
    }

    if (type === "reject" && !(await shouldSendEmail(supabaseAdmin, "candidate_rejected"))) {
      return new Response(JSON.stringify({ success: true, status: "skipped", reason: "candidate_rejected disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const branding = await getEmailBranding(supabaseAdmin);
    let formLink: string | undefined;
    let portalUrl: string | undefined;
    let jobLocation: string | undefined;
    let jobTypeLabel: string | undefined;
    let experienceLabel: string | undefined;
    let jobDescription: string | undefined;
    let careersLink: string | undefined;

    if (type === "application_form_required" && application_id) {
      const formPath = `/applicant/applications/${application_id}/form`;
      portalUrl = buildAppLink(branding, "/applicant/login");
      formLink = `${portalUrl}?redirect=${encodeURIComponent(formPath)}`;
    }

    if (type === "job_details" && application_id) {
      const { data: appWithJob } = await supabaseAdmin
        .from("job_applications")
        .select(`
          id,
          job:jobs(
            id,
            title,
            location,
            job_type,
            experience_level,
            experience_years_range,
            description
          )
        `)
        .eq("id", application_id)
        .maybeSingle();

      const job = appWithJob?.job as {
        id?: string;
        title?: string;
        location?: string | null;
        job_type?: string;
        experience_level?: string | null;
        experience_years_range?: string | null;
        description?: string | null;
      } | null;

      if (!job?.id) {
        return new Response(JSON.stringify({ error: "Job not found for application" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      jobLocation = job.location?.trim() || undefined;
      jobTypeLabel = job.job_type ? JOB_TYPE_LABELS[job.job_type] ?? job.job_type.replace(/_/g, " ") : undefined;
      experienceLabel = formatExperienceLabel(job.experience_level, job.experience_years_range);
      jobDescription = job.description?.trim() || undefined;
      careersLink = buildAppLink(branding, `/careers/${job.id}`);
    }

    const { subject, html, text } = buildApplicantEmail(branding, {
      type,
      applicant_name,
      job_title,
      rejection_reason,
      assessment_title: body.assessment_title,
      deadline: body.deadline,
      formLink,
      portalUrl,
      job_location: jobLocation,
      job_type_label: jobTypeLabel,
      experience_label: experienceLabel,
      job_description: jobDescription,
      careersLink,
    });

    const result = await sendTransactionalEmail({
      supabase: supabaseAdmin,
      to: applicant_email,
      subject,
      html,
      text,
      templateType: type,
      applicantEmail: applicant_email,
      metadata: { job_title, type },
    });

    if (result.status === "failed") {
      throw new Error(result.error ?? "Send failed");
    }

    if (type === "application_form_required" && application_id) {
      const { error: updateError } = await supabaseAdmin
        .from("job_applications")
        .update({ form_sent_at: new Date().toISOString() })
        .eq("id", application_id);

      if (updateError) {
        console.error("Failed to update form_sent_at:", updateError.message);
      }
    }

    if (type === "job_details" && application_id) {
      const { error: updateError } = await supabaseAdmin
        .from("job_applications")
        .update({ jd_sent_at: new Date().toISOString() })
        .eq("id", application_id);

      if (updateError) {
        console.error("Failed to update jd_sent_at:", updateError.message);
      }
    }

    return new Response(JSON.stringify({ success: true, status: result.status, data: result.data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-applicant-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
