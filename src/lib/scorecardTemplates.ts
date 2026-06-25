export interface ScorecardCriterion {
  key: string;
  label: string;
  scale_hint?: string;
}

export interface ScorecardTemplate {
  id: string;
  stage_key: string;
  display_name: string;
  criteria: ScorecardCriterion[];
  prompt_questions: string[];
  is_active: boolean;
}

export interface InterviewKit {
  id: string;
  candidate_interview_id: string;
  questions: string[];
  source: 'template' | 'gemini';
  scorecard_template_id?: string | null;
  generated_at: string;
}

const STAGE_KEY_PATTERNS: { key: string; patterns: RegExp[] }[] = [
  { key: 'screening', patterns: [/screen/i, /phone/i, /initial/i, /recruiter/i, /prescreen/i] },
  { key: 'technical', patterns: [/tech/i, /coding/i, /system/i, /engineering/i, /dev/i, /architect/i] },
  { key: 'managerial', patterns: [/manager/i, /lead/i, /director/i, /panel/i, /leadership/i] },
  { key: 'hr_final', patterns: [/\bhr\b/i, /culture/i, /final/i, /offer/i] },
];

export function resolveStageKey(stageName?: string | null): string {
  if (!stageName) return 'general';
  for (const { key, patterns } of STAGE_KEY_PATTERNS) {
    if (patterns.some(p => p.test(stageName))) return key;
  }
  return 'general';
}

export function defaultRatingsForCriteria(criteria: ScorecardCriterion[]): Record<string, number> {
  return Object.fromEntries(criteria.map(c => [c.key, 3]));
}

export function slugifyCriterionKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return key || 'criterion';
}

export const LEGACY_RATING_LABELS: { key: string; label: string }[] = [
  { key: 'technical', label: 'Technical Skills' },
  { key: 'communication', label: 'Communication' },
  { key: 'problem_solving', label: 'Problem Solving' },
  { key: 'culture_fit', label: 'Culture Fit' },
];
