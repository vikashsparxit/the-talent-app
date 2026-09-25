import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  emailCtaButton,
  emailHeading,
  emailLinkFallback,
  emailMutedParagraph,
  emailParagraph,
  emailTokenBlock,
  escapeHtml,
  getEmailBranding,
  type EmailBranding,
  wrapEmailLayout,
} from "./emailLayout.ts";

export type AuthEmailActionType =
  | "signup"
  | "recovery"
  | "magiclink"
  | "invite"
  | "email_change"
  | "reauthentication";

export type AuthBranding = EmailBranding;

export interface AuthEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface AuthEmailTemplateParams {
  actionType: AuthEmailActionType;
  confirmationUrl: string;
  token: string;
  recipientEmail: string;
  newEmail?: string;
}

export async function getAuthBranding(
  supabase: SupabaseClient,
  siteUrl: string,
  redirectTo: string,
): Promise<AuthBranding> {
  return getEmailBranding(supabase, siteUrl, redirectTo);
}

export function buildAuthConfirmationUrl(
  supabaseUrl: string,
  tokenHash: string,
  emailActionType: string,
  redirectTo: string,
): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    token: tokenHash,
    type: emailActionType,
    redirect_to: redirectTo,
  });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

export function resolveApplicantSignupRedirect(
  redirectTo: string,
  siteUrl: string,
  userMetadata?: Record<string, unknown>,
): string {
  if (userMetadata?.portal !== "applicant") return redirectTo;

  try {
    const origin = new URL(redirectTo || siteUrl).origin;
    return `${origin}/applicant/login?verified=1`;
  } catch {
    try {
      const origin = new URL(siteUrl).origin;
      return `${origin}/applicant/login?verified=1`;
    } catch {
      return redirectTo;
    }
  }
}

export function buildAuthEmailContent(
  branding: AuthBranding,
  params: AuthEmailTemplateParams,
): AuthEmailContent {
  const { companyName, primaryColor } = branding;
  const safeEmail = escapeHtml(params.recipientEmail);
  const safeNewEmail = params.newEmail ? escapeHtml(params.newEmail) : "";
  const safeCompany = escapeHtml(companyName);
  const { confirmationUrl, token, actionType } = params;

  switch (actionType) {
    case "signup":
      return {
        subject: `Confirm your email — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("Confirm your email address")}
          ${emailParagraph(`Thanks for signing up! Please confirm your email address to get started with ${safeCompany}.`)}
          ${emailCtaButton("Confirm Email Address", confirmationUrl, primaryColor)}
          ${emailLinkFallback(confirmationUrl)}
          ${emailMutedParagraph(`If you didn't create an account with ${safeCompany}, you can safely ignore this email.`)}
        `),
        text: [
          `Confirm your email address`,
          "",
          `Thanks for signing up! Please confirm your email address to get started with ${companyName}.`,
          "",
          confirmationUrl,
          "",
          `If you didn't create an account with ${companyName}, you can safely ignore this email.`,
        ].join("\n"),
      };

    case "recovery":
      return {
        subject: `Reset your password — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("Reset your password")}
          ${emailParagraph(`We received a request to reset the password for <strong>${safeEmail}</strong>. Click the button below to choose a new password.`)}
          ${emailCtaButton("Reset Password", confirmationUrl, primaryColor)}
          ${emailTokenBlock(token)}
          ${emailMutedParagraph("If you didn't request a password reset, you can safely ignore this email.")}
        `),
        text: [
          "Reset your password",
          "",
          `We received a request to reset the password for ${params.recipientEmail}.`,
          "",
          confirmationUrl,
          "",
          `Verification code: ${token}`,
          "",
          "If you didn't request a password reset, you can safely ignore this email.",
        ].join("\n"),
      };

    case "magiclink":
      return {
        subject: `Your sign-in link — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("Your sign-in link")}
          ${emailParagraph(`Click the button below to sign in to ${safeCompany}. This link expires shortly and can only be used once.`)}
          ${emailCtaButton("Sign In", confirmationUrl, primaryColor)}
          ${emailTokenBlock(token)}
          ${emailMutedParagraph("If you didn't request this link, you can safely ignore this email.")}
        `),
        text: [
          "Your sign-in link",
          "",
          `Sign in to ${companyName}:`,
          "",
          confirmationUrl,
          "",
          `Verification code: ${token}`,
          "",
          "If you didn't request this link, you can safely ignore this email.",
        ].join("\n"),
      };

    case "invite":
      return {
        subject: `You're invited to ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("You're invited")}
          ${emailParagraph(`You've been invited to join ${safeCompany}. Click the button below to accept your invitation and create your account.`)}
          ${emailCtaButton("Accept Invitation", confirmationUrl, primaryColor)}
          ${emailMutedParagraph("If you weren't expecting this invitation, you can safely ignore this email.")}
        `),
        text: [
          `You're invited to ${companyName}`,
          "",
          "Accept your invitation:",
          "",
          confirmationUrl,
          "",
          "If you weren't expecting this invitation, you can safely ignore this email.",
        ].join("\n"),
      };

    case "email_change":
      return {
        subject: `Confirm your new email — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("Confirm your new email")}
          ${emailParagraph(`You requested to change your email address${safeNewEmail ? ` to <strong>${safeNewEmail}</strong>` : ""}. Please confirm this change to continue using ${safeCompany}.`)}
          ${emailCtaButton("Confirm New Email", confirmationUrl, primaryColor)}
          ${emailTokenBlock(token)}
          ${emailMutedParagraph("If you didn't request this change, please contact your administrator immediately.")}
        `),
        text: [
          "Confirm your new email",
          "",
          `You requested to change your email address${params.newEmail ? ` to ${params.newEmail}` : ""}.`,
          "",
          confirmationUrl,
          "",
          `Verification code: ${token}`,
          "",
          "If you didn't request this change, please contact your administrator immediately.",
        ].join("\n"),
      };

    case "reauthentication":
      return {
        subject: `${token} is your verification code — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailHeading("Your verification code")}
          ${emailParagraph(`Enter this code to verify your identity and continue in ${safeCompany}.`)}
          <div style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#18181b;font-family:monospace;">${escapeHtml(token)}</span>
          </div>
          ${emailMutedParagraph("This code expires shortly. If you didn't request it, you can safely ignore this email.")}
        `),
        text: [
          "Your verification code",
          "",
          `Enter this code to verify your identity and continue in ${companyName}:`,
          "",
          token,
          "",
          "This code expires shortly. If you didn't request it, you can safely ignore this email.",
        ].join("\n"),
      };

    default:
      return {
        subject: `Notification — ${companyName}`,
        html: wrapEmailLayout(branding, `
          ${emailParagraph("Please use the link below to continue.")}
          ${emailCtaButton("Continue", confirmationUrl, primaryColor)}
        `),
        text: [
          "Please use the link below to continue:",
          "",
          confirmationUrl,
        ].join("\n"),
      };
  }
}

export function authTemplateTypeForAction(actionType: string): string {
  const map: Record<string, string> = {
    signup: "auth_signup",
    recovery: "auth_recovery",
    magiclink: "auth_magiclink",
    invite: "auth_invite",
    email_change: "auth_email_change",
    reauthentication: "auth_reauthentication",
  };
  return map[actionType] ?? `auth_${actionType}`;
}
