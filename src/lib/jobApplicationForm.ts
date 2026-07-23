export interface EmploymentReference {
  name: string;
  company: string;
  designation: string;
  phone: string;
  email: string;
  relationship: string;
}

export interface PrescreenQuestion {
  id: string;
  question_key: string;
  question_text: string;
  sort_hint: number;
  category: string;
}

export interface JobApplicationFormRecord {
  id: string;
  job_application_id: string;
  status: 'pending' | 'submitted';
  assigned_question_keys: string[];
  employment_references: EmploymentReference[];
  filled_by_recruiter: boolean;
  filled_by_user_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobApplicationResponseRecord {
  id: string;
  form_id: string;
  question_key: string;
  answer_text: string;
}

export const MIN_EMPLOYMENT_REFERENCES = 2;
export const ASSIGNED_QUESTION_COUNT = 10;
export const MAX_QUESTIONS_PER_CATEGORY = 2;

export const PRESCREEN_CATEGORIES = [
  'about_you',
  'current_role',
  'achievements',
  'motivation',
  'career_goals',
  'workplace',
  'judgment',
  'challenges',
] as const;

export type PrescreenCategory = (typeof PRESCREEN_CATEGORIES)[number];

export type CategorizedQuestionKeys = Record<string, string[]>;

export const COMBINED_NEXT_CAREER_MOVE_LEGACY_TEXT =
  "What are you looking for in your next career move? / Describe the workplace where you'll be the most happy and productive?";

const COMPANY_PLACEHOLDER = '{{company_name}}';

export function isLegacyCombinedCareerMoveAssignment(assignedKeys: string[]): boolean {
  return assignedKeys.includes('next_career_move') && !assignedKeys.includes('ideal_workplace');
}

export function resolvePrescreenQuestionText(
  question: Pick<PrescreenQuestion, 'question_key' | 'question_text'>,
  assignedKeys: string[],
): string {
  if (
    question.question_key === 'next_career_move'
    && isLegacyCombinedCareerMoveAssignment(assignedKeys)
  ) {
    return COMBINED_NEXT_CAREER_MOVE_LEGACY_TEXT;
  }
  return question.question_text;
}

export function substituteCompanyName(text: string, companyName: string | null): string {
  const name = companyName?.trim() || 'the company';
  return text.replaceAll(COMPANY_PLACEHOLDER, name);
}

export function groupQuestionsByCategory(
  questions: Pick<PrescreenQuestion, 'question_key' | 'category'>[],
): CategorizedQuestionKeys {
  const grouped: CategorizedQuestionKeys = {};
  for (const question of questions) {
    if (!question.category) continue;
    if (!grouped[question.category]) grouped[question.category] = [];
    grouped[question.category].push(question.question_key);
  }
  return grouped;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function selectAssignedQuestionKeys(
  applicationId: string,
  questionsByCategory: CategorizedQuestionKeys,
): string[] {
  const categories = Object.keys(questionsByCategory).filter(
    (category) => questionsByCategory[category].length > 0,
  );
  if (categories.length === 0) return [];

  const rng = seededRandom(hashSeed(applicationId));
  const picksPerCategory = new Map<string, number>(
    categories.map((category) => [category, 1]),
  );

  let extraPicks = ASSIGNED_QUESTION_COUNT - categories.length;
  if (extraPicks > 0) {
    const shuffledCategories = [...categories];
    shuffleInPlace(shuffledCategories, rng);
    for (let i = 0; i < extraPicks && i < shuffledCategories.length; i++) {
      const category = shuffledCategories[i];
      picksPerCategory.set(category, (picksPerCategory.get(category) ?? 1) + 1);
    }
  }

  const selected: string[] = [];
  const unusedKeys: string[] = [];

  for (const category of categories) {
    const pool = [...questionsByCategory[category]];
    shuffleInPlace(pool, rng);
    const pickCount = Math.min(picksPerCategory.get(category) ?? 1, pool.length);
    selected.push(...pool.slice(0, pickCount));
    unusedKeys.push(...pool.slice(pickCount));
  }

  if (selected.length < ASSIGNED_QUESTION_COUNT && unusedKeys.length > 0) {
    shuffleInPlace(unusedKeys, rng);
    const needed = ASSIGNED_QUESTION_COUNT - selected.length;
    selected.push(...unusedKeys.slice(0, needed));
  }

  shuffleInPlace(selected, rng);
  return selected.slice(0, ASSIGNED_QUESTION_COUNT);
}

export function emptyReference(): EmploymentReference {
  return {
    name: '',
    company: '',
    designation: '',
    phone: '',
    email: '',
    relationship: '',
  };
}

/** Same pattern as BulkImportDialog candidate email check */
export const REFERENCE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const REFERENCE_PHONE_MIN_DIGITS = 7;
export const REFERENCE_PHONE_MAX_DIGITS = 15;

export function countPhoneDigits(phone: string): number {
  return phone.replace(/\D/g, '').length;
}

export function isValidReferenceEmail(email: string): boolean {
  return REFERENCE_EMAIL_REGEX.test(email.trim());
}

export function isValidReferencePhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (!/^[\d\s+\-().]+$/.test(trimmed)) return false;
  const digits = countPhoneDigits(trimmed);
  return digits >= REFERENCE_PHONE_MIN_DIGITS && digits <= REFERENCE_PHONE_MAX_DIGITS;
}

export function referenceContactFieldKey(index: number, field: 'phone' | 'email'): string {
  return `${index}-${field}`;
}

export function getReferenceContactFieldErrors(refs: EmploymentReference[]): Record<string, string> {
  const errors: Record<string, string> = {};
  refs.forEach((ref, index) => {
    if (!isReferenceComplete(ref)) return;
    if (!isValidReferencePhone(ref.phone)) {
      errors[referenceContactFieldKey(index, 'phone')] =
        'Enter a valid phone number (7–15 digits).';
    }
    if (!isValidReferenceEmail(ref.email)) {
      errors[referenceContactFieldKey(index, 'email')] = 'Enter a valid email address.';
    }
  });
  return errors;
}

export function isReferenceComplete(ref: EmploymentReference): boolean {
  return Boolean(
    ref.name.trim()
    && ref.company.trim()
    && ref.designation.trim()
    && ref.phone.trim()
    && ref.email.trim()
    && ref.relationship.trim(),
  );
}

export function validateReferences(refs: EmploymentReference[]): string | null {
  const complete = refs.filter(isReferenceComplete);
  if (complete.length < MIN_EMPLOYMENT_REFERENCES) {
    return `Please provide at least ${MIN_EMPLOYMENT_REFERENCES} complete employment references.`;
  }

  const contactErrors = getReferenceContactFieldErrors(refs);
  const firstKey = Object.keys(contactErrors)[0];
  if (firstKey) {
    const index = Number(firstKey.split('-')[0]);
    return `Reference ${index + 1}: ${contactErrors[firstKey]}`;
  }

  return null;
}

export function validateQuestionAnswers(
  assignedKeys: string[],
  answers: Record<string, string>,
): string | null {
  for (const key of assignedKeys) {
    if (!answers[key]?.trim()) {
      return 'Please answer all assigned questions before submitting.';
    }
  }
  return null;
}

export type ApplicationFormStatus = 'not_required' | 'pending' | 'submitted' | 'none';

export function resolveFormStatus(
  required: boolean,
  form: Pick<JobApplicationFormRecord, 'status'> | null | undefined,
): ApplicationFormStatus {
  if (!required) return 'not_required';
  if (!form) return 'none';
  return form.status;
}
