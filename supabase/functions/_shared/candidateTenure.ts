/**
 * Deterministic career-timeline math for hiring.
 * Single source for gaps, training vs professional years, relevant tenure,
 * education-alignment remarks, and career-coherence bands.
 * Do not invent a parallel gap/tenure algorithm in UI or prompts — inject these facts.
 */

export type RoleKind = 'training' | 'professional';
export type RoleFamily = 'technology' | 'academic' | 'management_hr' | 'sales' | 'operations' | 'other';
export type CoherenceBand = 'Focused' | 'Mixed' | 'Scattered';

export interface WorkRoleInput {
  title?: string | null;
  company?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  website?: string | null;
}

export interface EducationInput {
  degree?: string | null;
  field?: string | null;
  institution?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface CareerTarget {
  jobTitle?: string | null;
  jobDescription?: string | null;
  roleApplied?: string | null;
  requiredSkills?: string[] | null;
}

export interface EmploymentGap {
  startLabel: string;
  endLabel: string;
  months: number;
  message: string;
}

export interface ClassifiedRole {
  source: WorkRoleInput;
  kind: RoleKind;
  family: RoleFamily;
  relevant: boolean;
  start: Date;
  end: Date;
  months: number;
  startLabel: string;
  endLabel: string;
  trainingReason?: string;
}

export interface EducationRemark {
  message: string;
  degreeLabel: string;
}

export interface CareerCoherence {
  band: CoherenceBand;
  bullets: string[];
  evidence: string[];
}

export type WorkTimelineItem =
  | { kind: 'role'; role: ClassifiedRole }
  | { kind: 'gap'; gap: EmploymentGap };

export interface CareerAnalysis {
  roles: ClassifiedRole[];
  timeline: WorkTimelineItem[];
  totalProfessionalYears: number;
  relevantYears: number;
  relevantRoleLabels: string[];
  excludedRoleLabels: string[];
  gaps: EmploymentGap[];
  educationRemarks: EducationRemark[];
  coherence: CareerCoherence;
  summaryFacts: string;
}

export interface AnalyzeCareerOptions {
  workExperience: unknown;
  education?: unknown;
  target?: CareerTarget | null;
  gapThresholdMonths?: number;
  now?: Date;
}

const TRAINING_TITLE =
  /\b(trainee|intern|internship|apprentice|apprenticeship|student|industrial\s+training|summer\s+training|campus\s+training|in[-\s]?plant\s+training)\b/i;

const TECH_TITLE =
  /\b(architect|engineer|developer|programmer|devops|sre|sysadmin|system\s*admin|software|backend|front[-\s]?end|full[-\s]?stack|cloud|data\s*scien|machine\s*learning|ml\s*eng|qa|sdet|tester|security|network|dba|platform|infrastructure|site\s*reliability)\b/i;

const ACADEMIC_TITLE =
  /\b(professor|lecturer|faculty|teacher|research\s*assistant|teaching\s*assistant|coordinator|dean)\b/i;

const ACADEMIC_COMPANY =
  /\b(university|universitat|universiteit|college|institute of technology|faculty of)\b/i;

const HR_TITLE = /\b(hr\b|human\s+resources|recruiter|talent\s+acquisition|people\s+ops|l&d)\b/i;
const SALES_TITLE = /\b(sales|business\s+development|\bbd\b|account\s+executive|bdr|sdr)\b/i;
const OPS_TITLE = /\b(operations|ops\s+manager|supply\s+chain|logistics|procurement)\b/i;

const TECH_DEGREE =
  /\b(b\.?\s*tech|btech|b\.?\s*e\.?|be\b|m\.?\s*tech|mtech|b\.?\s*s\.?|bs\b|m\.?\s*s\.?|msc|bca|mca|computer|software|electronics|electrical|information\s+tech|\bit\b|informatics|cyber|data\s+science)\b/i;

const HR_DEGREE = /\b(mba|pgdm|human\s+resource|\bhr\b|people\s+management|industrial\s+relations)\b/i;

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'from', 'senior', 'junior', 'lead', 'principal',
  'of', 'at', 'in', 'a', 'an', 'to', 'or',
]);

function isCurrentEndDate(end?: string | null): boolean {
  if (end == null || !String(end).trim()) return true;
  return /^(present|current|now|till\s*date|to\s*date|ongoing)$/i.test(String(end).trim());
}

function parseYearOnly(value: string): { year: number } | null {
  const m = value.trim().match(/^(\d{4})$/);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1950 || year > 2100) return null;
  return { year };
}

function parseMonthYear(value: string): { year: number; month: number } | null {
  const trimmed = value.trim();
  const my = trimmed.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (my) {
    const month = Number(my[1]);
    const year = Number(my[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const ym = trimmed.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  return null;
}

/** Start of period: first of month, or Jan 1 for year-only. */
export function parsePeriodStart(value: string | null | undefined): Date | null {
  if (!value?.trim() || isCurrentEndDate(value)) return null;
  const ym = parseMonthYear(value);
  if (ym) return new Date(ym.year, ym.month - 1, 1);
  const y = parseYearOnly(value);
  if (y) return new Date(y.year, 0, 1);
  return null;
}

/** End of period: last of month, Dec 31 for year-only, or `now` for Present. */
export function parsePeriodEnd(
  value: string | null | undefined,
  now = new Date(),
  asCurrentIfEmpty = false,
): Date | null {
  if (value == null || !String(value).trim()) {
    return asCurrentIfEmpty ? new Date(now.getFullYear(), now.getMonth() + 1, 0) : null;
  }
  if (isCurrentEndDate(value)) return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const ym = parseMonthYear(value);
  if (ym) return new Date(ym.year, ym.month, 0);
  const y = parseYearOnly(value);
  if (y) return new Date(y.year, 11, 31);
  return null;
}

export function formatMonthYear(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${mm}/${date.getFullYear()}`;
}

export function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/** Months from start month to end month (same month → 1). */
export function monthsSpanned(start: Date, end: Date): number {
  const m = monthIndex(end) - monthIndex(start);
  if (m < 0) return 0;
  return m === 0 ? 1 : m;
}

/** Exclusive hole between an ended role and the next start (Sep 2020 → Apr 2022 = 19). */
export function gapMonthsBetween(ended: Date, nextStart: Date): number {
  return monthIndex(nextStart) - monthIndex(ended);
}

export function formatMonthsLong(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return m === 1 ? '1 month' : `${m} months`;
  if (m === 0) return y === 1 ? '1 year' : `${y} years`;
  return `${y} year${y > 1 ? 's' : ''} and ${m} month${m !== 1 ? 's' : ''}`;
}

export function formatTenureLabel(start?: string | null, end?: string | null, now = new Date()): string | null {
  const from = parsePeriodStart(start ?? null);
  if (!from) return null;
  const to = parsePeriodEnd(end ?? null, now, true);
  if (!to) return null;
  const total = monthsSpanned(from, to);
  if (total <= 0) return null;
  const yrs = Math.floor(total / 12);
  const mos = total % 12;
  if (yrs === 0) return mos === 1 ? '1 mo' : `${mos} mos`;
  if (mos === 0) return yrs === 1 ? '1 yr' : `${yrs} yrs`;
  return `${yrs} yr${yrs > 1 ? 's' : ''} ${mos} mo${mos > 1 ? 's' : ''}`;
}

export function formatYears(years: number): string {
  const rounded = Math.round(years * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(1);
}

function yearsFromMonths(months: number): number {
  return Math.round((months / 12) * 10) / 10;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Array<{ start: Date; end: Date }> = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (monthIndex(cur.start) <= monthIndex(last.end)) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function coveredMonths(intervals: Array<{ start: Date; end: Date }>): number {
  return mergeIntervals(intervals).reduce((sum, iv) => sum + monthsSpanned(iv.start, iv.end), 0);
}

export function parseWorkRoles(raw: unknown): WorkRoleInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    return [{
      title: typeof item.title === 'string' ? item.title : null,
      company: typeof item.company === 'string' ? item.company : null,
      start_date: typeof item.start_date === 'string' ? item.start_date : null,
      end_date: typeof item.end_date === 'string' ? item.end_date : null,
      description: typeof item.description === 'string' ? item.description : null,
      website: typeof item.website === 'string' ? item.website : null,
    }];
  });
}

export function parseEducationRows(raw: unknown): EducationInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const degree = [item.degree, item.degree_name, item.qualification]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' ') || null;
    const field = typeof item.field === 'string' ? item.field : null;
    return [{
      degree,
      field,
      institution: typeof item.institution === 'string'
        ? item.institution
        : typeof item.board_university === 'string' ? item.board_university : null,
      start_date: typeof item.start_date === 'string' ? item.start_date : null,
      end_date: typeof item.end_date === 'string'
        ? item.end_date
        : typeof item.year_of_completion === 'string' ? item.year_of_completion : null,
    }];
  });
}

function classifyFamily(title: string, company: string): RoleFamily {
  const blob = `${title} ${company}`;
  if (HR_TITLE.test(blob)) return 'management_hr';
  if (SALES_TITLE.test(blob)) return 'sales';
  if (OPS_TITLE.test(blob) && !TECH_TITLE.test(title)) return 'operations';
  if (ACADEMIC_COMPANY.test(company) && (ACADEMIC_TITLE.test(title) || /coordinator|project/i.test(title))) {
    return 'academic';
  }
  if (ACADEMIC_TITLE.test(title) && !TECH_TITLE.test(title)) return 'academic';
  if (TECH_TITLE.test(title) || TECH_TITLE.test(company)) return 'technology';
  return 'other';
}

function educationFamily(row: EducationInput): RoleFamily | 'general' {
  const blob = `${row.degree ?? ''} ${row.field ?? ''}`;
  const hr = HR_DEGREE.test(blob);
  const tech = TECH_DEGREE.test(blob);
  if (hr && /\bhr\b|human\s+resource/i.test(blob)) return 'management_hr';
  if (hr && !tech) return 'management_hr';
  if (tech) return 'technology';
  if (/\bmba\b|pgdm/i.test(blob)) return 'management_hr';
  return 'general';
}

function targetFamily(target?: CareerTarget | null): RoleFamily {
  const blob = [
    target?.jobTitle,
    target?.roleApplied,
    target?.jobDescription,
    ...(target?.requiredSkills ?? []),
  ].filter(Boolean).join(' ');
  if (!blob.trim()) return 'technology';
  if (HR_TITLE.test(blob) || (/\bmba\b/i.test(blob) && /\bhr\b/i.test(blob))) return 'management_hr';
  if (SALES_TITLE.test(blob) && !TECH_TITLE.test(blob)) return 'sales';
  if (TECH_TITLE.test(blob) || TECH_DEGREE.test(blob)) return 'technology';
  return classifyFamily(blob, '');
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

function isRelevantToTarget(role: { title: string; company: string; family: RoleFamily }, target: CareerTarget | null | undefined, family: RoleFamily): boolean {
  if (role.family === 'academic' || role.family === 'management_hr') {
    return family === role.family;
  }
  if (role.family === family && family !== 'other') return true;
  const targetText = [target?.jobTitle, target?.roleApplied, target?.jobDescription].filter(Boolean).join(' ');
  if (!targetText.trim()) return role.family === 'technology';
  const roleTokens = new Set(significantTokens(`${role.title} ${role.company}`));
  const jobTokens = significantTokens(targetText);
  const overlap = jobTokens.filter((t) => roleTokens.has(t));
  return overlap.length >= 2;
}

function degreeLabel(row: EducationInput): string {
  const degree = [row.degree, row.field].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return degree || row.institution || 'Degree';
}

function roleLabel(role: ClassifiedRole): string {
  const title = role.source.title?.trim() || 'Role';
  const company = role.source.company?.trim();
  return company ? `${title} at ${company}` : title;
}

function classifyRole(
  source: WorkRoleInput,
  education: Array<{ start: Date; end: Date; label: string }>,
  target: CareerTarget | null | undefined,
  familyTarget: RoleFamily,
  now: Date,
): ClassifiedRole | null {
  const start = parsePeriodStart(source.start_date);
  if (!start) return null;
  const end = parsePeriodEnd(source.end_date, now, true);
  if (!end) return null;
  const months = monthsSpanned(start, end);
  const title = source.title ?? '';
  const company = source.company ?? '';
  const family = classifyFamily(title, company);

  const titleIsTraining = TRAINING_TITLE.test(title);
  const duringDegree = education.some((ed) => intervalsOverlap(start, end, ed.start, ed.end));
  let kind: RoleKind = 'professional';
  let trainingReason: string | undefined;
  if (titleIsTraining && months < 6) {
    kind = 'training';
    trainingReason = duringDegree ? 'During degree · short training' : 'Short training / internship';
  } else if (titleIsTraining && duringDegree) {
    kind = 'training';
    trainingReason = 'During degree';
  }

  const relevant = kind === 'professional' && isRelevantToTarget({ title, company, family }, target, familyTarget);

  return {
    source,
    kind,
    family,
    relevant,
    start,
    end,
    months,
    startLabel: formatMonthYear(start),
    endLabel: isCurrentEndDate(source.end_date) ? 'Present' : formatMonthYear(end),
    trainingReason,
  };
}

function detectGaps(roles: ClassifiedRole[], thresholdMonths: number): EmploymentGap[] {
  if (roles.length < 2) return [];
  const chronological = [...roles].sort((a, b) => a.start.getTime() - b.start.getTime());
  const gaps: EmploymentGap[] = [];
  let coverageEnd = chronological[0].end;
  for (let i = 1; i < chronological.length; i++) {
    const next = chronological[i];
    if (monthIndex(next.start) > monthIndex(coverageEnd)) {
      const months = gapMonthsBetween(coverageEnd, next.start);
      if (months >= thresholdMonths) {
        const startLabel = formatMonthYear(coverageEnd);
        const endLabel = formatMonthYear(next.start);
        gaps.push({
          startLabel,
          endLabel,
          months,
          message: `Candidate has an employment gap of ${formatMonthsLong(months)} between ${startLabel} and ${endLabel}`,
        });
      }
    }
    if (next.end > coverageEnd) coverageEnd = next.end;
  }
  return gaps;
}

function buildTimeline(roles: ClassifiedRole[], gaps: EmploymentGap[]): WorkTimelineItem[] {
  const newestFirst = [...roles].sort((a, b) => {
    const byStart = b.start.getTime() - a.start.getTime();
    if (byStart !== 0) return byStart;
    return b.end.getTime() - a.end.getTime();
  });
  const items: WorkTimelineItem[] = [];
  for (const role of newestFirst) {
    items.push({ kind: 'role', role });
    const gap = gaps.find((g) => g.endLabel === role.startLabel);
    if (gap && !items.some((it) => it.kind === 'gap' && it.gap.message === gap.message)) {
      items.push({ kind: 'gap', gap });
    }
  }
  return items;
}

function buildEducationRemarks(
  education: EducationInput[],
  familyTarget: RoleFamily,
  targetLabel: string,
): EducationRemark[] {
  const remarks: EducationRemark[] = [];
  for (const row of education) {
    const fam = educationFamily(row);
    if (fam === 'general') continue;
    if (fam === familyTarget) continue;
    const label = degreeLabel(row);
    remarks.push({
      degreeLabel: label,
      message: `Education track differs from recent roles: ${label} vs ${targetLabel}.`,
    });
  }
  return remarks;
}

function buildCoherence(
  roles: ClassifiedRole[],
  gaps: EmploymentGap[],
  educationRemarks: EducationRemark[],
  relevantMonths: number,
  professionalMonths: number,
): CareerCoherence {
  const professional = roles.filter((r) => r.kind === 'professional');
  const families = new Set(professional.map((r) => r.family));
  const hasTraining = roles.some((r) => r.kind === 'training');

  const evidence = roles.map((r) => {
    const tag = r.kind === 'training' ? 'training' : r.family;
    return `${roleLabel(r)} (${r.startLabel}–${r.endLabel}, ${tag})`;
  });

  const longestFamilyMonths = (() => {
    const byFamily = new Map<RoleFamily, number>();
    for (const r of professional) {
      byFamily.set(r.family, (byFamily.get(r.family) ?? 0) + r.months);
    }
    let max = 0;
    for (const v of byFamily.values()) max = Math.max(max, v);
    return max;
  })();

  const primaryShare = professionalMonths > 0 ? longestFamilyMonths / professionalMonths : 0;
  const materialGaps = gaps.filter((g) => g.months >= 12).length;
  const shortUnrelated = professional.filter((r) => !r.relevant && r.months < 24).length;

  let band: CoherenceBand;
  if (
    professional.length >= 1
    && families.size <= 2
    && primaryShare >= 0.7
    && educationRemarks.length === 0
    && relevantMonths >= 36
  ) {
    band = 'Focused';
  } else if (
    families.size >= 4
    || (relevantMonths < 24 && professionalMonths >= 36)
    || (shortUnrelated >= 2 && families.size >= 3)
  ) {
    band = 'Scattered';
  } else {
    band = 'Mixed';
  }

  const bullets: string[] = [];
  const familyList = [...families].join(', ') || 'none';
  bullets.push(`Role families on the résumé: ${familyList}${hasTraining ? ' plus short trainings' : ''}.`);
  if (relevantMonths > 0) {
    bullets.push(
      `Time in the target track is about ${formatYears(yearsFromMonths(relevantMonths))} years of ${formatYears(yearsFromMonths(professionalMonths))} professional years.`,
    );
  } else if (professionalMonths > 0) {
    bullets.push('Little or no time in roles that match the target job family.');
  }
  if (materialGaps > 0) {
    bullets.push(`${materialGaps} gap${materialGaps === 1 ? '' : 's'} of a year or more between employed periods.`);
  }
  if (educationRemarks.length > 0) {
    bullets.push(educationRemarks[0].message.replace(/\.$/, ''));
  }

  return { band, bullets, evidence };
}

function targetLabel(target?: CareerTarget | null): string {
  return (target?.jobTitle || target?.roleApplied || 'the target role').trim();
}

export function analyzeCareer(options: AnalyzeCareerOptions): CareerAnalysis {
  const now = options.now ?? new Date();
  const threshold = options.gapThresholdMonths ?? 3;
  const target = options.target ?? null;
  const familyTarget = targetFamily(target);
  const label = targetLabel(target);

  const educationRows = parseEducationRows(options.education);
  const educationIntervals = educationRows.flatMap((row) => {
    const start = parsePeriodStart(row.start_date) ?? (row.end_date ? parsePeriodStart(row.end_date) : null);
    const end = parsePeriodEnd(row.end_date, now, false) ?? (start ? parsePeriodEnd(row.end_date ?? row.start_date, now, false) : null);
    if (!start || !end) {
      // Year of completion only — treat as a 4-year window ending that year
      const endOnly = parsePeriodEnd(row.end_date ?? row.start_date, now, false);
      if (!endOnly) return [];
      const inferredStart = new Date(endOnly.getFullYear() - 3, 0, 1);
      return [{ start: inferredStart, end: endOnly, label: degreeLabel(row) }];
    }
    return [{ start, end, label: degreeLabel(row) }];
  });

  const roles = parseWorkRoles(options.workExperience)
    .map((source) => classifyRole(source, educationIntervals, target, familyTarget, now))
    .filter((r): r is ClassifiedRole => r !== null);

  const professional = roles.filter((r) => r.kind === 'professional');
  const relevant = professional.filter((r) => r.relevant);
  const totalProfessionalMonths = coveredMonths(professional.map((r) => ({ start: r.start, end: r.end })));
  const relevantMonths = coveredMonths(relevant.map((r) => ({ start: r.start, end: r.end })));
  const gaps = detectGaps(roles, threshold);
  const educationRemarks = buildEducationRemarks(educationRows, familyTarget, label);
  const coherence = buildCoherence(roles, gaps, educationRemarks, relevantMonths, totalProfessionalMonths);

  const relevantRoleLabels = relevant.map(roleLabel);
  const excludedRoleLabels = roles
    .filter((r) => r.kind === 'training' || !r.relevant)
    .map((r) => {
      if (r.kind === 'training') return `${roleLabel(r)} (${r.trainingReason ?? 'training'})`;
      return `${roleLabel(r)} (${r.family}, not equivalent seniority for ${label})`;
    });

  const totalProfessionalYears = yearsFromMonths(totalProfessionalMonths);
  const relevantYears = yearsFromMonths(relevantMonths);
  const timeline = buildTimeline(roles, gaps);

  const gapLines = gaps.length
    ? gaps.map((g) => `${g.startLabel}–${g.endLabel} (${formatMonthsLong(g.months)})`).join('; ')
    : 'none at the configured threshold';

  const summaryFacts = [
    `COMPUTED TENURE (ground truth — do not contradict these numbers):`,
    `- Total professional employed time: ${formatYears(totalProfessionalYears)} years (overlaps merged; trainings/internships excluded)`,
    `- Relevant to "${label}": ${formatYears(relevantYears)} years${relevantRoleLabels.length ? ` (${relevantRoleLabels.join('; ')})` : ''}`,
    excludedRoleLabels.length ? `- Not counted as professional seniority: ${excludedRoleLabels.join('; ')}` : null,
    `- Employment gaps: ${gapLines}`,
    educationRemarks.length ? `- Education: ${educationRemarks.map((r) => r.message).join(' ')}` : null,
    `- Career coherence: ${coherence.band}`,
    ...coherence.evidence.map((e) => `  · ${e}`),
  ].filter((line): line is string => line != null).join('\n');

  return {
    roles,
    timeline,
    totalProfessionalYears,
    relevantYears,
    relevantRoleLabels,
    excludedRoleLabels,
    gaps,
    educationRemarks,
    coherence,
    summaryFacts,
  };
}

/** Flags derived from the same gap walk used in the work-experience tree. */
export function employmentGapFlags(gaps: EmploymentGap[]): Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }> {
  return gaps.map((g) => ({
    type: 'employment_gap',
    message: g.message,
    severity: g.months >= 12 ? 'medium' as const : 'low' as const,
  }));
}

export function mergeEmploymentGapFlags(
  existing: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }>,
  computed: EmploymentGap[],
): Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }> {
  const others = existing.filter((f) => f.type !== 'employment_gap');
  const fromExisting = existing.filter((f) => f.type === 'employment_gap');
  // Prefer computed dates (work-experience walk) so chips and in-tree rows agree.
  if (computed.length > 0) return [...others, ...employmentGapFlags(computed)];
  return [...others, ...fromExisting];
}
