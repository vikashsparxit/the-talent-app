import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

export interface EmailSettings {
  enabled: boolean;
  from_address: string;
  reply_to: string;
  daily_quota: number;
  monthly_quota: number;
}

export type EmailTemplateType =
  | "application_received"
  | "application_form_required"
  | "job_details"
  | "shortlist"
  | "reject"
  | "hold"
  | "backout"
  | "assessment_assigned"
  | "assessment_invitation"
  | "assessment_completion"
  | "assignment_completed"
  | "interview_scheduled"
  | "verdict_submitted"
  | "candidate_hired_staff"
  | "candidate_hired_applicant"
  | "chitra_warning"
  | "chitra_praise"
  | "chitra_daily_report"
  | "chitra_weekly_report"
  | "auth_signup"
  | "auth_recovery"
  | "auth_magiclink"
  | "auth_invite"
  | "auth_email_change"
  | "auth_reauthentication";

const DEFAULT_COMPANY_NAME = "The Talent App";
const DEFAULT_FROM_EMAIL = "system@thetalentapp.io";

const APPLICATION_UPDATE_TYPES = new Set<EmailTemplateType>([
  "application_received",
  "application_form_required",
  "job_details",
  "shortlist",
  "reject",
  "hold",
  "backout",
  "candidate_hired_applicant",
]);

const ASSESSMENT_REMINDER_TYPES = new Set<EmailTemplateType>([
  "assessment_assigned",
  "assessment_invitation",
  "assessment_completion",
]);

export type SendEmailResult = {
  success: boolean;
  status: "sent" | "failed" | "skipped" | "quota_blocked";
  error?: string;
  data?: unknown;
};

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = envFirst("SES_SMTP_HOST", "SMTP_HOST");
  const user = envFirst("SES_SMTP_USER", "SMTP_USER");
  const password = envFirst("SES_SMTP_PASSWORD", "SMTP_PASS", "SMTP_PASSWORD");
  if (!host || !user || !password) return null;
  const portRaw = envFirst("SES_SMTP_PORT", "SMTP_PORT") ?? "587";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port)) return null;
  return { host, port, user, password };
}

function defaultFromEmail(): string {
  return envFirst("SES_SMTP_FROM", "EMAIL_FROM", "SMTP_ADMIN_EMAIL") || DEFAULT_FROM_EMAIL;
}

export async function getCompanyName(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("system_config")
    .select("config_value")
    .eq("config_key", "business_branding")
    .maybeSingle();

  const name = (data?.config_value as { company_name?: string } | null)?.company_name?.trim();
  return name || DEFAULT_COMPANY_NAME;
}

export async function getEmailSettings(supabase: SupabaseClient): Promise<EmailSettings> {
  const { data } = await supabase
    .from("system_config")
    .select("config_value")
    .eq("config_key", "email_settings")
    .maybeSingle();

  const raw = (data?.config_value ?? {}) as Partial<EmailSettings>;
  return {
    enabled: raw.enabled !== false,
    from_address: (raw.from_address ?? "").trim(),
    reply_to: (raw.reply_to ?? "").trim(),
    daily_quota: typeof raw.daily_quota === "number" ? raw.daily_quota : 100,
    monthly_quota: typeof raw.monthly_quota === "number" ? raw.monthly_quota : 3000,
  };
}

export function resolveFromAddress(settings: EmailSettings, companyName: string): string {
  const raw = (envFirst("SES_SMTP_FROM", "EMAIL_FROM", "SMTP_ADMIN_EMAIL") || settings.from_address || defaultFromEmail()).trim();
  return raw.includes("<")
    ? raw
    : `${companyName} <${raw}>`;
}

async function getSendCounts(supabase: SupabaseClient): Promise<{ sentToday: number; sentThisMonth: number }> {
  const { data, error } = await supabase.rpc("get_email_send_counts");
  if (error || !data) {
    return { sentToday: 0, sentThisMonth: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    sentToday: Number((row as { sent_today?: number }).sent_today ?? 0),
    sentThisMonth: Number((row as { sent_this_month?: number }).sent_this_month ?? 0),
  };
}

async function logDelivery(
  supabase: SupabaseClient,
  entry: {
    recipient: string;
    subject: string;
    templateType: EmailTemplateType;
    status: SendEmailResult["status"];
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("email_delivery_log").insert({
    recipient: entry.recipient,
    subject: entry.subject,
    template_type: entry.templateType,
    status: entry.status,
    provider: "ses",
    error_message: entry.errorMessage ?? null,
    metadata: entry.metadata ?? {},
  });
}

async function sendViaSmtp(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<{ messageId?: string }> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    throw new Error("SES SMTP not configured (SES_SMTP_HOST, SES_SMTP_USER, SES_SMTP_PASSWORD)");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port === 587,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  });

  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  });

  return { messageId: info.messageId };
}

async function dispatchEmail(
  supabase: SupabaseClient,
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    templateType: EmailTemplateType;
    metadata?: Record<string, unknown>;
    from: string;
    replyTo?: string;
  },
): Promise<SendEmailResult> {
  try {
    const result = await sendViaSmtp({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });
    await logDelivery(supabase, {
      recipient: params.to,
      subject: params.subject,
      templateType: params.templateType,
      status: "sent",
      metadata: { ...params.metadata, message_id: result.messageId },
    });
    return { success: true, status: "sent", data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error";
    await logDelivery(supabase, {
      recipient: params.to,
      subject: params.subject,
      templateType: params.templateType,
      status: "failed",
      errorMessage: message,
      metadata: params.metadata,
    });
    return { success: false, status: "failed", error: message };
  }
}

async function applicantAllowsEmail(
  supabase: SupabaseClient,
  applicantEmail: string,
  templateType: EmailTemplateType,
): Promise<boolean> {
  if (!APPLICATION_UPDATE_TYPES.has(templateType) && !ASSESSMENT_REMINDER_TYPES.has(templateType)) {
    return true;
  }

  const { data: profile } = await supabase
    .from("applicant_profiles")
    .select("notification_prefs")
    .eq("email", applicantEmail)
    .maybeSingle();

  if (!profile?.notification_prefs) return true;

  const prefs = profile.notification_prefs as Record<string, boolean>;
  if (APPLICATION_UPDATE_TYPES.has(templateType)) {
    return prefs.application_updates !== false;
  }
  if (ASSESSMENT_REMINDER_TYPES.has(templateType)) {
    return prefs.assessment_reminders !== false;
  }
  return true;
}

export async function sendTransactionalEmail({
  supabase,
  to,
  subject,
  html,
  text,
  templateType,
  metadata = {},
  applicantEmail,
}: {
  supabase: SupabaseClient;
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateType: EmailTemplateType;
  metadata?: Record<string, unknown>;
  applicantEmail?: string;
}): Promise<SendEmailResult> {
  const settings = await getEmailSettings(supabase);
  const companyName = await getCompanyName(supabase);
  const from = resolveFromAddress(settings, companyName);

  if (!settings.enabled) {
    await logDelivery(supabase, {
      recipient: to,
      subject,
      templateType,
      status: "skipped",
      errorMessage: "Email disabled in settings",
      metadata,
    });
    return { success: true, status: "skipped", error: "Email disabled in settings" };
  }

  if (!getSmtpConfig()) {
    await logDelivery(supabase, {
      recipient: to,
      subject,
      templateType,
      status: "skipped",
      errorMessage: "SES SMTP not configured",
      metadata,
    });
    return { success: true, status: "skipped", error: "SES SMTP not configured" };
  }

  const prefsEmail = applicantEmail ?? to;
  if (APPLICATION_UPDATE_TYPES.has(templateType) || ASSESSMENT_REMINDER_TYPES.has(templateType)) {
    const allowed = await applicantAllowsEmail(supabase, prefsEmail, templateType);
    if (!allowed) {
      await logDelivery(supabase, {
        recipient: to,
        subject,
        templateType,
        status: "skipped",
        errorMessage: "Applicant notification preference disabled",
        metadata,
      });
      return { success: true, status: "skipped", error: "Applicant opted out" };
    }
  }

  const { sentToday, sentThisMonth } = await getSendCounts(supabase);
  if (sentToday >= settings.daily_quota || sentThisMonth >= settings.monthly_quota) {
    const reason = sentToday >= settings.daily_quota
      ? `Daily quota reached (${settings.daily_quota})`
      : `Monthly quota reached (${settings.monthly_quota})`;
    await logDelivery(supabase, {
      recipient: to,
      subject,
      templateType,
      status: "quota_blocked",
      errorMessage: reason,
      metadata,
    });
    return { success: false, status: "quota_blocked", error: reason };
  }

  return dispatchEmail(supabase, {
    to,
    subject,
    html,
    text,
    templateType,
    metadata,
    from,
    replyTo: settings.reply_to || undefined,
  });
}

export async function sendAuthEmail({
  supabase,
  to,
  subject,
  html,
  text,
  templateType,
  metadata = {},
}: {
  supabase: SupabaseClient;
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateType: EmailTemplateType;
  metadata?: Record<string, unknown>;
}): Promise<SendEmailResult> {
  const settings = await getEmailSettings(supabase);
  const companyName = await getCompanyName(supabase);
  const from = resolveFromAddress(settings, companyName);

  if (!getSmtpConfig()) {
    await logDelivery(supabase, {
      recipient: to,
      subject,
      templateType,
      status: "failed",
      errorMessage: "SES SMTP not configured",
      metadata,
    });
    return { success: false, status: "failed", error: "SES SMTP not configured" };
  }

  return dispatchEmail(supabase, {
    to,
    subject,
    html,
    text,
    templateType,
    metadata,
    from,
    replyTo: settings.reply_to || undefined,
  });
}

export async function wasRecentlySent(
  supabase: SupabaseClient,
  recipient: string,
  templateType: EmailTemplateType,
  dedupeKey: string,
  windowMinutes = 5,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("email_delivery_log")
    .select("id")
    .eq("recipient", recipient)
    .eq("template_type", templateType)
    .eq("status", "sent")
    .gte("created_at", since)
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1);

  return (data?.length ?? 0) > 0;
}
