// Assessment recording consent: the default wording, placeholder rendering,
// the content-derived version and the block parser used by the consent screen
// and the admin preview. Pure (Web Crypto only), so the assessment-media
// function, the app (src/lib/mediaConsent.ts) and vitest share this one copy.
//
// The text is admin-editable in system_config.assessment_media_consent. The
// server always recomputes the version from the stored fields, so a candidate
// is asked again whenever the company name, contact email or text changes.

export const MEDIA_CONSENT_CONFIG_KEY = "assessment_media_consent";

// Generic placeholders; admins set their own in Settings -> Assessments.
export const DEFAULT_CONSENT_COMPANY = "Your Company";
export const DEFAULT_CONSENT_PRIVACY_EMAIL = "privacy@example.com";

/** Default wording. {company} and {privacyEmail} are filled in when shown. */
export const DEFAULT_CONSENT_TEMPLATE = `## Before you start: this assessment is recorded

**What we record**
- Your camera and microphone for the whole online assessment, from the moment you press Start until you submit.
- Your spoken answers to any questions that ask you to answer out loud.
- Activity signals: leaving the tab or window, and attempts to paste into answer boxes. Pasting is turned off.

**Why**
- So the hiring team can review your answers fairly and check that the assessment was taken by you, without outside help.
- Spoken answers are transcribed and may be given a suggested score by AI (Google Gemini). This only helps reviewers. **People make every hiring decision.** No recording, transcript or AI score rejects you or moves you forward on its own.

**Who can watch**
- Only the recruiters for this job, the HR/admin team at {company}, and the interviewers assigned to you.
- It is never shared publicly, and it is not used for any other purpose.

**Where it is stored and for how long**
- Recordings are stored privately and encrypted on Cloudflare R2, which is our storage provider.
- They are deleted automatically **90 days** after the assessment.
- If you are hired, your recordings are kept while you are employed with {company}.

**Your choices**
- You need to allow camera and microphone access to take this assessment. If you can't or don't want to be recorded, close this page and contact the recruiter, who can discuss other options with you.
- You can ask to see or delete your recordings at any time by writing to **{privacyEmail}**.`;

export const CONSENT_LIMITS = {
  companyName: { min: 1, max: 100 },
  privacyEmail: { max: 254 },
  consentText: { min: 200, max: 8000 },
} as const;

export const COMPANY_PLACEHOLDER = "{company}";
export const PRIVACY_EMAIL_PLACEHOLDER = "{privacyEmail}";

export interface MediaConsentFields {
  company_name: string;
  privacy_email: string;
  consent_text: string;
}

/** What candidates see and agree to; version is derived from the three fields. */
export interface MediaConsentCurrent {
  version: string;
  company_name: string;
  privacy_email: string;
  rendered_text: string;
}

export const DEFAULT_CONSENT_FIELDS: MediaConsentFields = {
  company_name: DEFAULT_CONSENT_COMPANY,
  privacy_email: DEFAULT_CONSENT_PRIVACY_EMAIL,
  consent_text: DEFAULT_CONSENT_TEMPLATE,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidConsentEmail(value: string): boolean {
  return value.length <= CONSENT_LIMITS.privacyEmail.max && EMAIL.test(value);
}

/** Trimmed fields with Windows line endings folded, so the version only follows real edits. */
export function normalizeConsentFields(fields: MediaConsentFields): MediaConsentFields {
  return {
    company_name: fields.company_name.trim(),
    privacy_email: fields.privacy_email.trim(),
    consent_text: fields.consent_text.replace(/\r\n?/g, "\n").trim(),
  };
}

/** Problems that make the fields unusable as consent (admin form and server load share these rules). */
export function consentFieldErrors(fields: MediaConsentFields): Partial<Record<keyof MediaConsentFields, string>> {
  const f = normalizeConsentFields(fields);
  const errors: Partial<Record<keyof MediaConsentFields, string>> = {};
  if (f.company_name.length < CONSENT_LIMITS.companyName.min || f.company_name.length > CONSENT_LIMITS.companyName.max) {
    errors.company_name = `Company name must be ${CONSENT_LIMITS.companyName.min}-${CONSENT_LIMITS.companyName.max} characters`;
  }
  if (!isValidConsentEmail(f.privacy_email)) {
    errors.privacy_email = "Enter a valid email address";
  }
  if (f.consent_text.length < CONSENT_LIMITS.consentText.min || f.consent_text.length > CONSENT_LIMITS.consentText.max) {
    errors.consent_text = `Consent text must be ${CONSENT_LIMITS.consentText.min}-${CONSENT_LIMITS.consentText.max} characters`;
  } else if (!f.consent_text.includes(PRIVACY_EMAIL_PLACEHOLDER)) {
    errors.consent_text = `Consent text must include ${PRIVACY_EMAIL_PLACEHOLDER} so candidates know where to ask`;
  }
  return errors;
}

/**
 * The stored config as consent fields. A missing row, or a row that fails
 * validation, falls back to the default wording as a whole (never a mix).
 */
export function parseMediaConsentConfig(raw: unknown): MediaConsentFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CONSENT_FIELDS };
  const o = raw as Record<string, unknown>;
  if (typeof o.company_name !== "string" || typeof o.privacy_email !== "string" || typeof o.consent_text !== "string") {
    return { ...DEFAULT_CONSENT_FIELDS };
  }
  const fields = normalizeConsentFields({
    company_name: o.company_name,
    privacy_email: o.privacy_email,
    consent_text: o.consent_text,
  });
  return Object.keys(consentFieldErrors(fields)).length ? { ...DEFAULT_CONSENT_FIELDS } : fields;
}

/** Replaces {company} and {privacyEmail}; any other {placeholder} is left as written. */
export function renderConsent(template: string, values: { company: string; privacyEmail: string }): string {
  return template.replace(/\{(company|privacyEmail)\}/g, (_, name: string) =>
    name === "company" ? values.company : values.privacyEmail
  );
}

/** 'v-' + the first 16 hex chars of SHA-256 over the normalised fields. */
export async function consentVersion(fields: MediaConsentFields): Promise<string> {
  const f = normalizeConsentFields(fields);
  const canonical = JSON.stringify([f.company_name, f.privacy_email, f.consent_text]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `v-${hex.slice(0, 16)}`;
}

/** The consent candidates must agree to now, from system_config.assessment_media_consent. */
export async function resolveMediaConsent(raw: unknown): Promise<MediaConsentCurrent> {
  const fields = parseMediaConsentConfig(raw);
  return {
    version: await consentVersion(fields),
    company_name: fields.company_name,
    privacy_email: fields.privacy_email,
    rendered_text: renderConsent(fields.consent_text, {
      company: fields.company_name,
      privacyEmail: fields.privacy_email,
    }),
  };
}

/**
 * record-consent: the version stored is always the server's current one. A
 * client that read an older text (it sends that version) gets 409 so the
 * candidate re-reads the new wording; no version sent is accepted.
 */
export function decideConsentRecord(
  clientVersion: string | null,
  currentVersion: string,
): { ok: true; consentVersion: string } | { ok: false; status: 409; code: "consent_text_changed"; error: string } {
  if (clientVersion !== null && clientVersion !== currentVersion) {
    return {
      ok: false,
      status: 409,
      code: "consent_text_changed",
      error: "The consent text has changed. Please read it again before agreeing.",
    };
  }
  return { ok: true, consentVersion: currentVersion };
}

// ── Display blocks (rendered as React elements, never as HTML) ───────────────

/** Text with **bold** runs split out. */
export type ConsentInline = { text: string; bold: boolean };

export type ConsentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: ConsentInline[][] }
  | { type: "paragraph"; lines: ConsentInline[][] };

export function parseConsentInline(line: string): ConsentInline[] {
  const parts: ConsentInline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), bold: false });
  return parts;
}

/**
 * Splits consent text into headings ('## Title', or a line that is all
 * **bold**), '- ' bullet lists and paragraphs separated by blank lines.
 */
export function parseConsentBlocks(text: string): ConsentBlock[] {
  const blocks: ConsentBlock[] = [];
  let list: ConsentInline[][] | null = null;
  let para: ConsentInline[][] | null = null;
  const flush = () => {
    if (list) blocks.push({ type: "list", items: list });
    if (para) blocks.push({ type: "paragraph", lines: para });
    list = null;
    para = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const wholeBold = /^\*\*([^*]+)\*\*$/.exec(line);
    if (!line) {
      flush();
    } else if (/^#{1,3}\s+/.test(line)) {
      flush();
      blocks.push({ type: "heading", level: 2, text: line.replace(/^#{1,3}\s+/, "") });
    } else if (wholeBold) {
      flush();
      blocks.push({ type: "heading", level: 3, text: wholeBold[1] });
    } else if (/^[-*]\s+/.test(line)) {
      if (para) flush();
      (list ??= []).push(parseConsentInline(line.replace(/^[-*]\s+/, "")));
    } else {
      if (list) flush();
      (para ??= []).push(parseConsentInline(line));
    }
  }
  flush();
  return blocks;
}
