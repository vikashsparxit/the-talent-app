// Consent shown before webcam recording and spoken answers. The wording is
// admin-editable (Settings → Assessments, system_config.assessment_media_consent);
// the defaults, renderer and version live in the shared module so the
// assessment-media function computes exactly the same version.
import { z } from 'zod';
import {
  COMPANY_PLACEHOLDER,
  CONSENT_LIMITS,
  PRIVACY_EMAIL_PLACEHOLDER,
  consentVersion,
  normalizeConsentFields,
  parseMediaConsentConfig,
  type MediaConsentFields,
} from '../../supabase/functions/_shared/mediaConsent.ts';

export {
  COMPANY_PLACEHOLDER,
  CONSENT_LIMITS,
  DEFAULT_CONSENT_COMPANY,
  DEFAULT_CONSENT_FIELDS,
  DEFAULT_CONSENT_PRIVACY_EMAIL,
  DEFAULT_CONSENT_TEMPLATE,
  MEDIA_CONSENT_CONFIG_KEY,
  PRIVACY_EMAIL_PLACEHOLDER,
  consentVersion,
  parseConsentBlocks,
  parseMediaConsentConfig,
  renderConsent,
  type ConsentBlock,
  type ConsentInline,
  type MediaConsentCurrent,
  type MediaConsentFields,
} from '../../supabase/functions/_shared/mediaConsent.ts';

/** Stored in system_config.assessment_media_consent. */
export interface MediaConsentConfigValue extends MediaConsentFields {
  version: string;
  updated_at: string;
}

export const mediaConsentFormSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(CONSENT_LIMITS.companyName.min, 'Company name is required')
    .max(CONSENT_LIMITS.companyName.max, `Company name must be at most ${CONSENT_LIMITS.companyName.max} characters`),
  privacy_email: z
    .string()
    .trim()
    .max(CONSENT_LIMITS.privacyEmail.max, 'Email is too long')
    .email('Enter a valid email address'),
  consent_text: z
    .string()
    .trim()
    .min(CONSENT_LIMITS.consentText.min, `Consent text must be at least ${CONSENT_LIMITS.consentText.min} characters`)
    .max(CONSENT_LIMITS.consentText.max, `Consent text must be at most ${CONSENT_LIMITS.consentText.max} characters`)
    .refine((t) => t.includes(PRIVACY_EMAIL_PLACEHOLDER), {
      message: `Consent text must include ${PRIVACY_EMAIL_PLACEHOLDER} so candidates know where to ask`,
    }),
});

export type MediaConsentFormErrors = Partial<Record<keyof MediaConsentFields, string>>;

/** First error per field, or an empty object when the form is valid. */
export function validateMediaConsentForm(fields: MediaConsentFields): MediaConsentFormErrors {
  const result = mediaConsentFormSchema.safeParse(fields);
  if (result.success) return {};
  const errors: MediaConsentFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof MediaConsentFields;
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Non-blocking: the text never names the company. */
export function consentTextWarnings(consentText: string): string[] {
  return consentText.includes(COMPANY_PLACEHOLDER)
    ? []
    : [`The text does not mention ${COMPANY_PLACEHOLDER}; candidates will not see the company name.`];
}

/**
 * The text still promises that recordings "are deleted automatically 90 days
 * after the assessment" (the default wording). Only true while the
 * assessment_recording_retention setting is on.
 */
export function consentClaimsAutomaticDeletion(consentText: string): boolean {
  return /deleted\s+automatically\s+\**\s*90\s+days/i.test(consentText);
}

/** The row to save: normalised fields plus the version the server will compute for them. */
export async function buildMediaConsentConfigValue(fields: MediaConsentFields, now: Date): Promise<MediaConsentConfigValue> {
  const f = normalizeConsentFields(fields);
  return { ...f, version: await consentVersion(f), updated_at: now.toISOString() };
}

/** The saved config for the admin form (defaults when missing or invalid), with its stored updated_at. */
export function readMediaConsentConfig(raw: unknown): { fields: MediaConsentFields; updatedAt: string | null } {
  const updated = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { updated_at?: unknown }).updated_at : null;
  return { fields: parseMediaConsentConfig(raw), updatedAt: typeof updated === 'string' ? updated : null };
}
