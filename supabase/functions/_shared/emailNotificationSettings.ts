import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EmailNotificationKey =
  | "candidate_hired_staff"
  | "candidate_hired_applicant"
  | "candidate_rejected"
  | "chitra_warning"
  | "chitra_praise"
  | "chitra_daily_report"
  | "chitra_weekly_report"
  | "interview_scheduled"
  | "interviewer_daily_digest"
  | "assignment_completed";

export const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: Record<EmailNotificationKey, boolean> = {
  candidate_hired_staff: true,
  candidate_hired_applicant: true,
  candidate_rejected: true,
  chitra_warning: true,
  chitra_praise: true,
  chitra_daily_report: true,
  chitra_weekly_report: true,
  interview_scheduled: true,
  interviewer_daily_digest: true,
  assignment_completed: true,
};

export async function shouldSendEmail(
  supabase: SupabaseClient,
  notificationKey: EmailNotificationKey,
): Promise<boolean> {
  const { data } = await supabase
    .from("system_config")
    .select("config_value")
    .eq("config_key", "email_notification_settings")
    .maybeSingle();

  const raw = (data?.config_value ?? {}) as Partial<Record<EmailNotificationKey, boolean>>;
  if (raw[notificationKey] === false) return false;
  return DEFAULT_EMAIL_NOTIFICATION_SETTINGS[notificationKey];
}
