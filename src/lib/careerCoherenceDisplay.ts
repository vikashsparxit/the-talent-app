/**
 * Presentation layer for the career-coherence analysis in the candidate drawer.
 * Bands, years, gaps and evidence still come from `analyzeCareer` — this only
 * turns them into scannable labels, chips and signal rows.
 */

import {
  formatMonthsLong,
  formatYears,
  type CareerAnalysis,
  type ClassifiedRole,
  type CoherenceBand,
  type EmploymentGap,
  type RoleFamily,
} from './candidateTenure';

export interface CoherenceSignal {
  id: string;
  tone: 'neutral' | 'caution';
  label: string;
  detail?: string;
}

export interface CoherenceRoleRow {
  id: string;
  title: string;
  company: string | null;
  period: string;
  trackLabel: string;
  isTraining: boolean;
}

export interface CoherenceView {
  band: CoherenceBand;
  meaning: string;
  /** False in the Talent Database, where there is no job to measure the track against. */
  hasTarget: boolean;
  trackYears: string;
  professionalYears: string;
  trackSharePct: number;
  trackLabels: string[];
  signals: CoherenceSignal[];
  roles: CoherenceRoleRow[];
}

const BAND_MEANING: Record<CoherenceBand, string> = {
  Focused: 'Almost all of the career sits in one track.',
  Mixed: 'Mostly one track, with some variety worth asking about.',
  Scattered: 'Time is spread across several different tracks.',
};

const FAMILY_LABELS: Record<Exclude<RoleFamily, 'other'>, string> = {
  technology: 'Technology',
  academic: 'Academia',
  management_hr: 'HR / People',
  sales: 'Sales / BD',
  operations: 'Operations',
};

/**
 * The stored taxonomy collapses anything non-technical into `other`, which reads
 * as a classifier failure in the UI. Recover a human track from the job title.
 * Order matters — the most specific track wins.
 */
const TITLE_TRACKS: Array<{ label: string; test: RegExp }> = [
  { label: 'SEO', test: /\bseo\b|search\s+engine\s+optimi|\bsem\b|organic\s+(search|growth)/i },
  { label: 'Performance Marketing', test: /\b(ppc|paid\s+(ads|media|search)|google\s+ads|performance\s+marketing|media\s+buying)\b/i },
  { label: 'Content', test: /\b(content|copywrit\w*|editor|technical\s+writ\w*)\b/i },
  { label: 'Marketing', test: /\b(marketing|brand|growth|social\s+media|advertis\w*|campaign|digital)\b/i },
  { label: 'Product', test: /\bproduct\s+(manager|owner|lead|analyst|specialist)\b/i },
  { label: 'Design', test: /\b(design\w*|ux|ui|creative|graphic|illustrat\w*)\b/i },
  { label: 'Project Delivery', test: /\b(project|program|programme|delivery|scrum|agile|pmo)\b/i },
  { label: 'Data & Analytics', test: /\b(data|analytics|analyst|insights|reporting|\bbi\b)\b/i },
  { label: 'Finance', test: /\b(finance|financial|account(s|ing|ant)|audit\w*|taxation|payroll|billing)\b/i },
  { label: 'Customer Success', test: /\b(customer\s+(success|support|service)|client\s+servic\w*|help\s*desk|service\s+desk)\b/i },
  { label: 'Consulting', test: /\b(consultant|consulting|advisory|strategy|strategist|presales)\b/i },
  { label: 'Healthcare', test: /\b(nurse|nursing|doctor|physician|clinical|pharma\w*|medical)\b/i },
  { label: 'Legal', test: /\b(legal|advocate|paralegal|litigation|compliance)\b/i },
];

const GENERIC_TITLE_WORDS =
  /\b(senior|sr|junior|jr|lead|principal|chief|head|assistant|associate|deputy|executive|manager|management|intern|trainee|consultant|specialist|officer|engineer|of|the|and|at|in|for)\b/gi;

function fallbackTrackLabel(title: string): string {
  const stripped = title
    .replace(/\(.*?\)/g, ' ')
    .replace(GENERIC_TITLE_WORDS, ' ')
    .replace(/[^A-Za-z0-9\s&/+-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(' ')
    .trim();
  if (!stripped) return 'Other';
  const label = stripped.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  return label.length > 24 ? `${label.slice(0, 23).trimEnd()}…` : label;
}

/** Human track label for one role — never "other". */
export function roleTrackLabel(role: ClassifiedRole): string {
  if (role.family !== 'other') return FAMILY_LABELS[role.family];
  const blob = `${role.source.title ?? ''} ${role.source.company ?? ''}`;
  const match = TITLE_TRACKS.find((t) => t.test.test(blob));
  if (match) return match.label;
  return fallbackTrackLabel(role.source.title ?? '');
}

function gapDetail(gaps: EmploymentGap[]): string {
  return gaps
    .slice(0, 2)
    .map((g) => `${g.startLabel}–${g.endLabel} (${formatMonthsLong(g.months)})`)
    .join(' · ');
}

function educationDetail(message: string): string {
  return message
    .replace(/^Education track differs from recent roles:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
}

function buildSignals(analysis: CareerAnalysis, hasTarget: boolean): CoherenceSignal[] {
  const signals: CoherenceSignal[] = [];
  const longGaps = analysis.gaps.filter((g) => g.months >= 12);
  const shortGaps = analysis.gaps.filter((g) => g.months < 12);
  const trainings = analysis.roles.filter((r) => r.kind === 'training');

  if (longGaps.length > 0) {
    signals.push({
      id: 'long-gaps',
      tone: 'caution',
      label: `${longGaps.length} break${longGaps.length === 1 ? '' : 's'} of a year or more`,
      detail: gapDetail(longGaps),
    });
  }
  if (shortGaps.length > 0) {
    signals.push({
      id: 'short-gaps',
      tone: 'neutral',
      label: `${shortGaps.length} short break${shortGaps.length === 1 ? '' : 's'} between roles`,
      detail: gapDetail(shortGaps),
    });
  }
  if (hasTarget && analysis.relevantYears === 0 && analysis.totalProfessionalYears > 0) {
    signals.push({
      id: 'no-track-time',
      tone: 'caution',
      label: 'No time recorded in the target track',
      detail: 'Worth confirming transferable work on the call',
    });
  }
  const remark = analysis.educationRemarks[0];
  if (remark) {
    signals.push({
      id: 'education',
      tone: 'neutral',
      label: 'Education is in a different track',
      detail: educationDetail(remark.message),
    });
  }
  if (trainings.length > 0) {
    signals.push({
      id: 'trainings',
      tone: 'neutral',
      label: `${trainings.length} training / internship not counted as tenure`,
      detail: trainings.map((r) => r.source.title?.trim()).filter(Boolean).slice(0, 2).join(' · ') || undefined,
    });
  }
  return signals;
}

/** Track chips ordered by time spent, so the dominant track reads first. */
function buildTrackLabels(roles: ClassifiedRole[]): string[] {
  const months = new Map<string, number>();
  for (const role of roles) {
    if (role.kind !== 'professional') continue;
    const label = roleTrackLabel(role);
    months.set(label, (months.get(label) ?? 0) + role.months);
  }
  return [...months.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
}

function buildRoleRows(roles: ClassifiedRole[]): CoherenceRoleRow[] {
  return [...roles]
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .map((role, index) => ({
      id: `${role.source.title ?? 'role'}-${role.startLabel}-${index}`,
      title: role.source.title?.trim() || 'Role',
      company: role.source.company?.trim() || null,
      period: `${role.startLabel} – ${role.endLabel}`,
      trackLabel: role.kind === 'training' ? 'Training' : roleTrackLabel(role),
      isTraining: role.kind === 'training',
    }));
}

export function buildCoherenceView(
  analysis: CareerAnalysis,
  options: { hasTarget: boolean },
): CoherenceView {
  const share = analysis.totalProfessionalYears > 0
    ? Math.min(100, Math.round((analysis.relevantYears / analysis.totalProfessionalYears) * 100))
    : 0;

  return {
    band: analysis.coherence.band,
    meaning: BAND_MEANING[analysis.coherence.band],
    hasTarget: options.hasTarget,
    trackYears: formatYears(analysis.relevantYears),
    professionalYears: formatYears(analysis.totalProfessionalYears),
    trackSharePct: share,
    trackLabels: buildTrackLabels(analysis.roles),
    signals: buildSignals(analysis, options.hasTarget),
    roles: buildRoleRows(analysis.roles),
  };
}
