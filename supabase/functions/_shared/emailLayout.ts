import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyName } from "./email.ts";

const DEFAULT_PRIMARY_COLOR = "#D64541";
const DEFAULT_APP_URL = "https://sparxtalent.thesparxitsolutions.com";
const GITHUB_REPO_URL = "https://github.com/vikashsparxit/the-talent-app";
const SPARXIT_URL = "https://www.sparxitsolutions.com";
const TALENT_APP_NAME = "The Talent App";
const TALENT_APP_ICON_PATH = "/the-talent-app-icon.png";

export interface EmailBranding {
  companyName: string;
  primaryColor: string;
  appUrl: string;
  companyLogoUrl: string | null;
  talentAppSiteUrl: string;
  talentAppIconUrl: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function getEmailBranding(
  supabase: SupabaseClient,
  siteUrl = "",
  redirectTo = "",
): Promise<EmailBranding> {
  const companyName = await getCompanyName(supabase);

  const { data } = await supabase
    .from("system_config")
    .select("config_value")
    .eq("config_key", "business_branding")
    .maybeSingle();

  const branding = (data?.config_value ?? {}) as {
    primary_color?: string;
    public_url?: string;
    logo_desktop_url?: string;
  };

  const envUrl = Deno.env.get("PUBLIC_APP_URL")?.trim();
  const brandingUrl = branding.public_url?.trim();
  let appUrl = envUrl || brandingUrl || siteUrl;
  if (!appUrl && redirectTo) {
    try {
      appUrl = new URL(redirectTo).origin;
    } catch {
      appUrl = siteUrl;
    }
  }
  appUrl = (appUrl || DEFAULT_APP_URL).replace(/\/$/, "");

  const marketingUrl = Deno.env.get("PUBLIC_MARKETING_URL")?.trim();
  const talentAppSiteUrl = (marketingUrl || appUrl || GITHUB_REPO_URL).replace(/\/$/, "");
  const assetBaseUrl = (appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  const talentAppIconUrl = `${assetBaseUrl}${TALENT_APP_ICON_PATH}`;

  const primaryColor = branding.primary_color?.trim() || DEFAULT_PRIMARY_COLOR;
  const companyLogoUrl = branding.logo_desktop_url?.trim() || null;

  return {
    companyName,
    primaryColor,
    appUrl,
    companyLogoUrl,
    talentAppSiteUrl,
    talentAppIconUrl,
  };
}

function emailHeader(branding: EmailBranding): string {
  const { companyName, primaryColor, companyLogoUrl, talentAppIconUrl } = branding;
  const safeCompany = escapeHtml(companyName);

  if (companyLogoUrl) {
    return `<tr>
      <td style="background-color:${primaryColor};padding:28px 40px;text-align:center;">
        <img src="${escapeHtml(companyLogoUrl)}" alt="${safeCompany}" height="48" style="display:block;margin:0 auto;max-width:240px;max-height:48px;object-fit:contain;" />
      </td>
    </tr>`;
  }

  return `<tr>
    <td style="background-color:${primaryColor};padding:32px 40px;text-align:center;">
      <img src="${escapeHtml(talentAppIconUrl)}" alt="${safeCompany}" width="48" height="48" style="display:block;margin:0 auto 12px;border-radius:10px;" />
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.02em;">${safeCompany}</h1>
    </td>
  </tr>`;
}

function emailFooter(branding: EmailBranding): string {
  const { primaryColor, talentAppSiteUrl, talentAppIconUrl } = branding;
  const safeSiteUrl = escapeHtml(talentAppSiteUrl);
  const safeIconUrl = escapeHtml(talentAppIconUrl);
  const safeTalentAppName = escapeHtml(TALENT_APP_NAME);

  return `<tr>
    <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="left" style="vertical-align:middle;">
            <a href="${safeSiteUrl}" target="_blank" style="text-decoration:none;display:inline-block;line-height:1;">
              <img src="${safeIconUrl}" alt="${safeTalentAppName}" width="28" height="28" style="display:inline-block;vertical-align:middle;border-radius:6px;margin-right:8px;" />
              <span style="color:#52525b;font-size:14px;font-weight:600;vertical-align:middle;">${safeTalentAppName}</span>
            </a>
          </td>
          <td align="right" style="vertical-align:middle;white-space:nowrap;">
            <span style="color:#a1a1aa;font-size:12px;line-height:1.6;">
              Built with &#10084;&#65039; by <a href="${SPARXIT_URL}" target="_blank" style="color:${primaryColor};text-decoration:none;font-weight:500;">SparxIT</a>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Opens the Candidates page detail drawer (see Candidates.tsx ?profile= handler). */
export function buildCandidateDrawerPath(candidateId: string): string {
  return `/candidates?profile=${candidateId}`;
}

/** Opens the Pipeline detail drawer for a candidate (optional job context). */
export function buildPipelineCandidatePath(candidateId: string, jobId?: string | null): string {
  if (jobId) return `/pipeline?job=${jobId}&candidate=${candidateId}`;
  return `/pipeline?candidate=${candidateId}`;
}

export function emailCandidateNameLink(
  name: string,
  href: string,
  primaryColor: string,
): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="color:${primaryColor};text-decoration:underline;font-weight:600;">${escapeHtml(name)}</a>`;
}

/** Resolve a relative app path (e.g. /pipeline) to an absolute URL for email CTAs. */
export function buildAppLink(branding: EmailBranding, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const base = (branding.appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

export function wrapEmailLayout(branding: EmailBranding, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          ${emailHeader(branding)}
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>
          ${emailFooter(branding)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600;">${text}</h2>`;
}

export function emailHeadingWithIcon(text: string, icon: string): string {
  return `<h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600;">
    <span style="margin-right:8px;" aria-hidden="true">${icon}</span>${text}
  </h2>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 16px;color:#52525b;font-size:16px;line-height:1.6;">${html}</p>`;
}

export function emailMutedParagraph(html: string): string {
  return `<p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;text-align:center;">${html}</p>`;
}

export function emailCtaButton(label: string, href: string, primaryColor: string): string {
  const safeLabel = escapeHtml(label);
  const safeHref = escapeHtml(href);
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px;">
    <tr>
      <td style="border-radius:8px;background-color:${primaryColor};">
        <a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

export function emailTokenBlock(token: string): string {
  return `<p style="margin:0 0 8px;color:#71717a;font-size:14px;text-align:center;">Or enter this verification code:</p>
  <div style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
    <span style="font-size:28px;font-weight:700;letter-spacing:0.25em;color:#18181b;font-family:monospace;">${escapeHtml(token)}</span>
  </div>`;
}

export function emailLinkFallback(url: string): string {
  return `<p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;line-height:1.5;text-align:center;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="margin:0 0 24px;color:#71717a;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">${escapeHtml(url)}</p>`;
}

export function emailInfoBox(contentHtml: string, borderColor: string): string {
  return `<div style="background:#fafafa;padding:16px;border-radius:8px;border-left:4px solid ${borderColor};margin:16px 0;">
    ${contentHtml}
  </div>`;
}

export function emailSignOff(companyName: string): string {
  return emailParagraph(`Best regards,<br>The ${escapeHtml(companyName)} Hiring Team`);
}

export function emailScoreBox(percentage: number, passed: boolean): string {
  const bg = passed ? "#dcfce7" : "#fee2e2";
  const label = passed ? "Passed" : "Did not pass";
  return `<div style="background:${bg};padding:16px;border-radius:8px;text-align:center;margin:16px 0;">
    <p style="margin:0;font-size:28px;font-weight:bold;color:#18181b;">${Math.round(percentage)}%</p>
    <p style="margin:8px 0 0 0;color:#52525b;">${label}</p>
  </div>`;
}
