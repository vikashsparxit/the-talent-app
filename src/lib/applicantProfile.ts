export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'separated' | 'prefer_not_to_say';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'unknown';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const MARITAL_STATUS_OPTIONS: { value: MaritalStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const BLOOD_GROUP_OPTIONS: { value: BloodGroup; label: string }[] = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
  { value: 'unknown', label: 'Unknown' },
];

export interface EducationEntry {
  degree_name: string;
  year_of_completion: string;
  board_university: string;
  grade: string;
}

export interface WorkExperienceEntry {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  description: string;
  reason_for_leaving?: string;
}

export interface ApplicantProfileData {
  full_name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  work_experience: unknown[] | null;
  education?: unknown[] | null;
  skills?: unknown;
  dob_actual?: string | null;
  dob_documented?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  emergency_phone?: string | null;
}

export interface ApplicantProfileSaveInput {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  dob_documented: string;
  gender: string;
  marital_status: string;
  blood_group: string;
  linkedin_url: string;
}

export function buildFullName(
  firstName: string,
  middleName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, middleName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

export function splitFullName(fullName: string): {
  first_name: string;
  middle_name: string | null;
  last_name: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first_name: '', middle_name: null, last_name: '' };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], middle_name: null, last_name: '' };
  }
  return {
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : null,
    last_name: parts[parts.length - 1],
  };
}

export function getApplicantDisplayName(profile: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}): string {
  const fromParts = buildFullName(
    profile.first_name ?? '',
    profile.middle_name,
    profile.last_name,
  );
  if (fromParts && !fromParts.includes('@')) return fromParts;
  if (profile.full_name && !profile.full_name.includes('@')) {
    return buildFullName(profile.full_name, profile.middle_name);
  }
  return '';
}

export function getApplicantFirstName(profile: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}): string {
  if (profile.first_name?.trim()) return profile.first_name.trim();
  const display = getApplicantDisplayName(profile);
  return display.split(' ')[0] || '';
}

export function validateApplicantProfileSave(
  input: ApplicantProfileSaveInput,
): { valid: true } | { valid: false; title: string; description?: string } {
  if (!input.first_name.trim()) {
    return { valid: false, title: 'First name is required' };
  }
  if (!input.last_name.trim()) {
    return { valid: false, title: 'Last name is required' };
  }
  if (!input.dob_documented.trim()) {
    return {
      valid: false,
      title: 'Date of birth required',
      description: 'Please enter your date of birth as shown on official documents.',
    };
  }
  if (!input.gender) {
    return { valid: false, title: 'Gender is required' };
  }
  if (!input.marital_status) {
    return { valid: false, title: 'Marital status is required' };
  }
  if (!input.blood_group) {
    return { valid: false, title: 'Blood group is required' };
  }
  if (!input.linkedin_url.trim()) {
    return {
      valid: false,
      title: 'LinkedIn URL is required',
      description: 'Please provide your LinkedIn profile URL.',
    };
  }
  if (!validateLinkedInUrl(input.linkedin_url)) {
    return {
      valid: false,
      title: 'Invalid LinkedIn URL',
      description: 'Please provide a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)',
    };
  }
  return { valid: true };
}

export interface ProfileCompletenessItem {
  key: string;
  label: string;
  weight: number;
  complete: boolean;
}

export interface ProfileCompleteness {
  percent: number;
  items: ProfileCompletenessItem[];
  isComplete: boolean;
}

export interface ApplicantDocument {
  id: string;
  name: string;
  url: string;
  type: 'resume' | 'cover_letter' | 'certificate' | 'other';
  uploaded_at: string;
}

export interface NotificationPrefs {
  application_updates: boolean;
  assessment_reminders: boolean;
  marketing: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  application_updates: true,
  assessment_reminders: true,
  marketing: false,
};

export const EMPTY_EDUCATION_ENTRY: EducationEntry = {
  degree_name: '',
  year_of_completion: '',
  board_university: '',
  grade: '',
};

export const EMPTY_WORK_EXPERIENCE_ENTRY: WorkExperienceEntry = {
  company: '',
  title: '',
  start_date: '',
  end_date: '',
  description: '',
  reason_for_leaving: '',
};

export function normalizeLinkedInUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, '');
  if (!v) return '';

  if (/^https?:\/\//i.test(v)) return v;

  if (v.includes('linkedin.com')) {
    return `https://${v.replace(/^\/+/, '')}`;
  }

  if (/^\/?in\//i.test(v)) {
    return `https://www.linkedin.com/${v.replace(/^\//, '')}`;
  }

  if (/^[\w-]{3,}$/.test(v)) {
    return `https://www.linkedin.com/in/${v}`;
  }

  return v;
}

export function validateLinkedInUrl(url: string): boolean {
  const linkedinPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
  return linkedinPattern.test(normalizeLinkedInUrl(url));
}

export function resolveLinkedInProfileUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeLinkedInUrl(raw);
  return validateLinkedInUrl(normalized) ? normalized : null;
}

export function hasValidLinkedInProfile(raw: string | null | undefined): boolean {
  return resolveLinkedInProfileUrl(raw) !== null;
}

export interface CandidateRedFlag {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/** Drop AI incomplete_profile flags about LinkedIn when the candidate already has a valid URL/slug. */
export function filterStaleLinkedInRedFlags(
  flags: CandidateRedFlag[],
  linkedinUrl: string | null | undefined,
): CandidateRedFlag[] {
  if (!hasValidLinkedInProfile(linkedinUrl)) return flags;
  return flags.filter(
    (f) => !(f.type === 'incomplete_profile' && /linkedin/i.test(f.message)),
  );
}

export function isValidDateString(value: string): boolean {
  if (!value.trim()) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function hasValidName(profile: ApplicantProfileData): boolean {
  const first = profile.first_name?.trim();
  const last = profile.last_name?.trim();
  if (first && last && !first.includes('@') && !last.includes('@')) return true;
  return !!profile.full_name?.trim() && !profile.full_name.includes('@');
}

function hasRequiredSelect(value: string | null | undefined): boolean {
  return !!value?.trim();
}

function hasWorkExperience(workExperience: unknown[] | null): boolean {
  if (!workExperience || !Array.isArray(workExperience)) return false;
  return workExperience.some((exp) => {
    if (!exp || typeof exp !== 'object') return false;
    const item = exp as Record<string, string>;
    return !!(item.company?.trim() || item.title?.trim());
  });
}

function hasDocumentedDob(dobDocumented: string | null | undefined): boolean {
  return !!dobDocumented && isValidDateString(dobDocumented);
}

export function parseEducation(raw: unknown): EducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') return { ...EMPTY_EDUCATION_ENTRY };
    const item = entry as Record<string, string>;
    if (item.degree_name !== undefined || item.board_university !== undefined) {
      return {
        degree_name: item.degree_name ?? '',
        year_of_completion: item.year_of_completion ?? '',
        board_university: item.board_university ?? '',
        grade: item.grade ?? '',
      };
    }
    const degreeName = [item.degree, item.field].filter(Boolean).join(item.degree && item.field ? ' in ' : '');
    return {
      degree_name: degreeName,
      year_of_completion: item.year_of_completion ?? item.end_date ?? '',
      board_university: item.board_university ?? item.institution ?? '',
      grade: item.grade ?? '',
    };
  });
}

export function parseWorkExperience(raw: unknown): WorkExperienceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') return { ...EMPTY_WORK_EXPERIENCE_ENTRY };
    const item = entry as Record<string, string>;
    return {
      company: item.company ?? '',
      title: item.title ?? '',
      start_date: item.start_date ?? '',
      end_date: item.end_date ?? '',
      description: item.description ?? '',
      reason_for_leaving: item.reason_for_leaving ?? '',
    };
  });
}

export function getProfileCompleteness(profile: ApplicantProfileData | null): ProfileCompleteness {
  const items: ProfileCompletenessItem[] = [
    {
      key: 'name',
      label: 'First & last name',
      weight: 10,
      complete: !!profile && hasValidName(profile),
    },
    {
      key: 'phone',
      label: 'Phone number',
      weight: 10,
      complete: !!profile?.phone?.trim(),
    },
    {
      key: 'dob_documented',
      label: 'Date of birth (on documents)',
      weight: 15,
      complete: !!profile && hasDocumentedDob(profile.dob_documented),
    },
    {
      key: 'gender',
      label: 'Gender',
      weight: 8,
      complete: hasRequiredSelect(profile?.gender),
    },
    {
      key: 'marital_status',
      label: 'Marital status',
      weight: 8,
      complete: hasRequiredSelect(profile?.marital_status),
    },
    {
      key: 'blood_group',
      label: 'Blood group',
      weight: 8,
      complete: hasRequiredSelect(profile?.blood_group),
    },
    {
      key: 'linkedin',
      label: 'LinkedIn URL',
      weight: 11,
      complete: !!profile?.linkedin_url?.trim() && validateLinkedInUrl(profile.linkedin_url),
    },
    {
      key: 'resume',
      label: 'Resume',
      weight: 15,
      complete: !!profile?.resume_url,
    },
    {
      key: 'experience',
      label: 'Work experience',
      weight: 15,
      complete: !!profile && hasWorkExperience(profile.work_experience),
    },
  ];

  const percent = items.reduce((sum, item) => sum + (item.complete ? item.weight : 0), 0);
  return {
    percent,
    items,
    isComplete: percent === 100,
  };
}

export function isProfileIncomplete(profile: ApplicantProfileData | null): boolean {
  return !getProfileCompleteness(profile).isComplete;
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_PREFS };
  const prefs = raw as Partial<NotificationPrefs>;
  return {
    application_updates: prefs.application_updates ?? DEFAULT_NOTIFICATION_PREFS.application_updates,
    assessment_reminders: prefs.assessment_reminders ?? DEFAULT_NOTIFICATION_PREFS.assessment_reminders,
    marketing: prefs.marketing ?? DEFAULT_NOTIFICATION_PREFS.marketing,
  };
}

export function parseDocuments(raw: unknown): ApplicantDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (doc): doc is ApplicantDocument =>
      !!doc &&
      typeof doc === 'object' &&
      typeof (doc as ApplicantDocument).id === 'string' &&
      typeof (doc as ApplicantDocument).name === 'string' &&
      typeof (doc as ApplicantDocument).url === 'string',
  );
}

export function parseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

export function isResumeParsed(profile: {
  resume_url: string | null;
  skills?: unknown;
  work_experience?: unknown;
  education?: unknown;
  phone?: string | null;
  first_name?: string | null;
  linkedin_url?: string | null;
}): boolean {
  if (!profile.resume_url) return false;
  return (
    parseSkills(profile.skills).length > 0 ||
    parseWorkExperience(profile.work_experience).length > 0 ||
    parseEducation(profile.education).length > 0 ||
    !!profile.phone?.trim() ||
    !!profile.first_name?.trim() ||
    !!profile.linkedin_url?.trim()
  );
}

export function getResumeLastUpdated(profile: {
  resume_url: string | null;
  updated_at: string;
}): Date | null {
  if (!profile.resume_url) return null;
  const match = profile.resume_url.match(/-resume-(\d+)\./);
  if (match) {
    return new Date(Number(match[1]));
  }
  return new Date(profile.updated_at);
}

const RESUME_STALE_DAYS = 90;

export function isResumeStale(profile: {
  resume_url: string | null;
  updated_at: string;
}): boolean {
  const lastUpdated = getResumeLastUpdated(profile);
  if (!lastUpdated) return false;
  const daysSince = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
  return daysSince > RESUME_STALE_DAYS;
}

export function formatProfileDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export function getGenderLabel(value: string | null | undefined): string {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

export function getMaritalStatusLabel(value: string | null | undefined): string {
  return MARITAL_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

export function getBloodGroupLabel(value: string | null | undefined): string {
  return BLOOD_GROUP_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

export interface CandidateEnrichmentSource {
  name?: string | null;
  phone?: string | null;
  resume_url?: string | null;
  linkedin_url?: string | null;
  work_experience?: unknown;
  education?: unknown;
  skills?: unknown;
  skills_tags?: unknown;
}

function hasEducation(education: unknown[] | null | undefined): boolean {
  return parseEducation(education).some(
    (entry) =>
      !!entry.degree_name?.trim() ||
      !!entry.board_university?.trim() ||
      !!entry.year_of_completion?.trim(),
  );
}

function extractCandidateSkills(candidate: CandidateEnrichmentSource): string[] {
  const fromSkills = parseSkills(candidate.skills);
  if (fromSkills.length > 0) return fromSkills;
  return parseSkills(candidate.skills_tags);
}

export function buildApplicantEnrichmentFromCandidate(
  existing: ApplicantProfileData | null,
  candidate: CandidateEnrichmentSource,
  defaults?: { fullName?: string; firstName?: string; lastName?: string | null; middleName?: string | null },
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const candidateName = candidate.name?.trim();
  const candidateNameParts = candidateName ? splitFullName(candidateName) : null;

  const existingFullName = existing?.full_name?.trim();
  const existingNameInvalid = !existingFullName || existingFullName.includes('@');
  if (candidateName && existingNameInvalid) {
    updates.full_name = candidateName;
  } else if (defaults?.fullName && existingNameInvalid) {
    updates.full_name = defaults.fullName;
  }

  const existingFirst = existing?.first_name?.trim();
  const existingLast = existing?.last_name?.trim();
  const existingFirstInvalid = !existingFirst || existingFirst.includes('@');
  const existingLastInvalid = !existingLast || existingLast.includes('@');

  if (candidateNameParts) {
    if (existingFirstInvalid && candidateNameParts.first_name) {
      updates.first_name = candidateNameParts.first_name;
    }
    if (existingLastInvalid && candidateNameParts.last_name) {
      updates.last_name = candidateNameParts.last_name;
    }
    if (!existing?.middle_name?.trim() && candidateNameParts.middle_name) {
      updates.middle_name = candidateNameParts.middle_name;
    }
  } else if (defaults) {
    if (existingFirstInvalid && defaults.firstName?.trim()) {
      updates.first_name = defaults.firstName.trim();
    }
    if (existingLastInvalid && defaults.lastName?.trim()) {
      updates.last_name = defaults.lastName.trim();
    }
    if (!existing?.middle_name?.trim() && defaults.middleName?.trim()) {
      updates.middle_name = defaults.middleName.trim();
    }
  }

  if (!existing?.phone?.trim() && candidate.phone?.trim()) {
    updates.phone = candidate.phone.trim();
  }
  if (!existing?.resume_url && candidate.resume_url) {
    updates.resume_url = candidate.resume_url;
  }
  if (!existing?.linkedin_url?.trim() && candidate.linkedin_url?.trim()) {
    updates.linkedin_url = candidate.linkedin_url.trim();
  }
  if (!hasWorkExperience(existing?.work_experience ?? null) && hasWorkExperience(
    Array.isArray(candidate.work_experience) ? candidate.work_experience : null,
  )) {
    updates.work_experience = candidate.work_experience;
  }
  if (!hasEducation(existing?.education as unknown[] | null) && hasEducation(
    Array.isArray(candidate.education) ? candidate.education : null,
  )) {
    updates.education = candidate.education;
  }

  const candidateSkills = extractCandidateSkills(candidate);
  if (parseSkills(existing?.skills).length === 0 && candidateSkills.length > 0) {
    updates.skills = candidateSkills;
  }

  return updates;
}

export function profileNeedsCandidateEnrichment(
  profile: ApplicantProfileData | null,
  candidate: CandidateEnrichmentSource,
): boolean {
  return Object.keys(buildApplicantEnrichmentFromCandidate(profile, candidate)).length > 0;
}
