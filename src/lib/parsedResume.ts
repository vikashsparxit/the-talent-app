/** Canonical fields from parse-resume (Gemini) plus common aliases. */

export type MappedResumeParse = {
  full_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  current_role: string;
  current_company: string;
  skills: string[];
  experience_years: number | undefined;
  work_experience: unknown[] | undefined;
  education: unknown[] | undefined;
  certifications: unknown[] | undefined;
  awards: unknown[] | undefined;
  parse_score: number;
  credential_score: number | undefined;
  summary: string;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function firstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function firstArray(...vals: unknown[]): unknown[] | undefined {
  for (const v of vals) {
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

export function mapParsedResume(raw: unknown): MappedResumeParse {
  const o = asRecord(raw);
  const skillsRaw = firstArray(o.skills) ?? [];
  return {
    full_name: firstString(o.full_name, o.name),
    email: firstString(o.email),
    phone: firstString(o.phone),
    linkedin_url: firstString(o.linkedin_url, o.linkedin),
    current_role: firstString(o.current_role, o.role, o.job_title, o.title),
    current_company: firstString(o.current_company, o.company, o.employer),
    skills: skillsRaw.filter((s): s is string => typeof s === 'string'),
    experience_years: firstNumber(o.experience_years, o.years_of_experience, o.years),
    work_experience: firstArray(o.work_experience, o.experience),
    education: firstArray(o.education),
    certifications: firstArray(o.certifications),
    awards: firstArray(o.awards),
    parse_score: firstNumber(o.parse_score) ?? 0,
    credential_score: firstNumber(o.credential_score),
    summary: firstString(o.summary),
  };
}
