/**
 * Canonical candidate.source keys and display labels.
 * `candidates.source` stays free-text — unknown values are shown as-is.
 * `job_application` is an alias of `portal` (same careers apply path).
 */

export const CANDIDATE_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  portal: 'Portal',
  job_application: 'Portal',
  naukri: 'Naukri',
  linkedin: 'LinkedIn',
  referral: 'Referral',
  indeed: 'Indeed',
  talent_email: 'Talent Email',
  bulk_resume: 'Resume Upload',
  csv_import: 'CSV Import',
};

/** Keys shown on the add-candidate form (human-entered, not system imports). */
export const CANDIDATE_SOURCE_SELECT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'portal', label: 'Portal' },
  { value: 'naukri', label: 'Naukri' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'talent_email', label: 'Talent Email' },
];

export const CANDIDATE_SOURCE_COLORS: Record<string, { color: string; bg: string }> = {
  bulk_resume: { color: 'bg-violet-500', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  csv_import: { color: 'bg-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  manual: { color: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40' },
  job_application: { color: 'bg-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  portal: { color: 'bg-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  linkedin: { color: 'bg-sky-500', bg: 'bg-sky-100 dark:bg-sky-900/30' },
  referral: { color: 'bg-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  naukri: { color: 'bg-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  indeed: { color: 'bg-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  talent_email: { color: 'bg-rose-500', bg: 'bg-rose-100 dark:bg-rose-900/30' },
};

export const DEFAULT_SOURCE_COLOR = { color: 'bg-gray-400', bg: 'bg-gray-100 dark:bg-gray-800/40' };

export function normalizeCandidateSourceKey(raw?: string | null): string {
  return (raw || 'manual').toLowerCase().trim().replace(/\s+/g, '_');
}

export function candidateSourceLabel(raw?: string | null): string {
  const key = normalizeCandidateSourceKey(raw);
  return CANDIDATE_SOURCE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function candidateSourceStyle(raw?: string | null): { color: string; bg: string } {
  const key = normalizeCandidateSourceKey(raw);
  return CANDIDATE_SOURCE_COLORS[key] ?? DEFAULT_SOURCE_COLOR;
}
