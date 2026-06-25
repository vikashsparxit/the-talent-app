import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAppLink, buildPipelineCandidatePath, getEmailBranding } from "./emailLayout.ts";
import { sendTransactionalEmail, wasRecentlySent } from "./email.ts";
import { shouldSendEmail } from "./emailNotificationSettings.ts";
import {
  buildChitraDailyReportEmail,
  buildChitraPraiseEmail,
  buildChitraWarningEmail,
  buildChitraWeeklyReportEmail,
} from "./transactionalEmailTemplates.ts";

async function profileEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", userId)
    .maybeSingle();
  const email = data?.email?.trim();
  if (!email) return null;
  return { email, name: data?.full_name ?? "there" };
}

interface ChitraCandidateLinkOptions {
  candidateId?: string;
  candidateName?: string;
  jobId?: string;
}

function resolveCandidateProfileUrl(
  branding: Awaited<ReturnType<typeof getEmailBranding>>,
  options?: ChitraCandidateLinkOptions,
): string | undefined {
  if (!options?.candidateId) return undefined;
  return buildAppLink(branding, buildPipelineCandidatePath(options.candidateId, options.jobId));
}

export async function fanOutChitraWarningEmail(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  link: string,
  candidateLink?: ChitraCandidateLinkOptions,
): Promise<void> {
  if (!(await shouldSendEmail(supabase, "chitra_warning"))) return;

  const profile = await profileEmail(supabase, userId);
  if (!profile) return;

  const dedupeKey = `chitra_warning:${userId}:${title}`;
  if (await wasRecentlySent(supabase, profile.email, "chitra_warning", dedupeKey)) return;

  const branding = await getEmailBranding(supabase);
  const viewUrl = buildAppLink(branding, link);
  const candidateProfileUrl = resolveCandidateProfileUrl(branding, candidateLink);
  const content = buildChitraWarningEmail(branding, {
    recipientName: profile.name,
    title,
    message,
    viewUrl,
    candidateName: candidateLink?.candidateName,
    candidateProfileUrl,
  });

  await sendTransactionalEmail({
    supabase,
    to: profile.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateType: "chitra_warning",
    metadata: { user_id: userId, dedupe_key: dedupeKey, source: "chitra" },
  });
}

export async function fanOutChitraPraiseEmail(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  link: string,
  candidateLink?: ChitraCandidateLinkOptions,
): Promise<void> {
  if (!(await shouldSendEmail(supabase, "chitra_praise"))) return;

  const profile = await profileEmail(supabase, userId);
  if (!profile) return;

  const dedupeKey = `chitra_praise:${userId}:${title}`;
  if (await wasRecentlySent(supabase, profile.email, "chitra_praise", dedupeKey)) return;

  const branding = await getEmailBranding(supabase);
  const viewUrl = buildAppLink(branding, link);
  const candidateProfileUrl = resolveCandidateProfileUrl(branding, candidateLink);
  const content = buildChitraPraiseEmail(branding, {
    recipientName: profile.name,
    title,
    message,
    viewUrl,
    candidateName: candidateLink?.candidateName,
    candidateProfileUrl,
  });

  await sendTransactionalEmail({
    supabase,
    to: profile.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateType: "chitra_praise",
    metadata: { user_id: userId, dedupe_key: dedupeKey, source: "chitra" },
  });
}

export async function fanOutChitraDailyReportEmail(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  link: string,
): Promise<void> {
  if (!(await shouldSendEmail(supabase, "chitra_daily_report"))) return;

  const profile = await profileEmail(supabase, userId);
  if (!profile) return;

  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = `chitra_daily_report:${userId}:${today}`;
  if (await wasRecentlySent(supabase, profile.email, "chitra_daily_report", dedupeKey)) return;

  const branding = await getEmailBranding(supabase);
  const viewUrl = buildAppLink(branding, link);
  const content = buildChitraDailyReportEmail(branding, {
    recipientName: profile.name,
    title,
    message,
    viewUrl,
  });

  await sendTransactionalEmail({
    supabase,
    to: profile.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateType: "chitra_daily_report",
    metadata: { user_id: userId, dedupe_key: dedupeKey, source: "chitra" },
  });
}

export async function fanOutChitraWeeklyReportEmail(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  message: string,
  link: string,
): Promise<void> {
  if (!(await shouldSendEmail(supabase, "chitra_weekly_report"))) return;

  const profile = await profileEmail(supabase, userId);
  if (!profile) return;

  const weekKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `chitra_weekly_report:${userId}:${weekKey}`;
  if (await wasRecentlySent(supabase, profile.email, "chitra_weekly_report", dedupeKey)) return;

  const branding = await getEmailBranding(supabase);
  const viewUrl = buildAppLink(branding, link);
  const content = buildChitraWeeklyReportEmail(branding, {
    recipientName: profile.name,
    title,
    message,
    viewUrl,
  });

  await sendTransactionalEmail({
    supabase,
    to: profile.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    templateType: "chitra_weekly_report",
    metadata: { user_id: userId, dedupe_key: dedupeKey, source: "chitra" },
  });
}
