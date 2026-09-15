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

const DRAFT_META_KEYS = new Set(['verdict_suggestion', 'feedback']);

function normalizeRatingKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Map AI draft rating fields onto scorecard criteria keys.
 * Exact key/label first, then fuzzy/synonym matches (e.g. technical → technical_depth).
 */
export function mapDraftRatingsToCriteria(
  draft: Record<string, unknown>,
  criteria: ScorecardCriterion[],
): Record<string, number> {
  if (!criteria.length) return {};

  const draftScores: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(draft)) {
    if (DRAFT_META_KEYS.has(rawKey)) continue;
    const n = typeof rawVal === 'number' ? rawVal : Number(rawVal);
    if (!Number.isFinite(n) || n < 1 || n > 5) continue;
    draftScores[normalizeRatingKey(rawKey)] = Math.round(n);
  }

  const usedDraftKeys = new Set<string>();
  const mapped: Record<string, number> = {};

  for (const c of criteria) {
    const cKey = normalizeRatingKey(c.key);
    const cLabel = normalizeRatingKey(c.label);
    const candidates = [cKey, cLabel];
    for (const token of [...cKey.split('_'), ...cLabel.split('_')]) {
      if (token.length >= 4) candidates.push(token);
    }

    let matchedDraftKey: string | undefined;
    for (const cand of candidates) {
      if (draftScores[cand] != null && !usedDraftKeys.has(cand)) {
        matchedDraftKey = cand;
        break;
      }
    }

    if (!matchedDraftKey) {
      for (const dKey of Object.keys(draftScores)) {
        if (usedDraftKeys.has(dKey) || dKey.length < 4) continue;
        if (cKey.startsWith(`${dKey}_`) || cLabel.startsWith(`${dKey}_`)) {
          matchedDraftKey = dKey;
          break;
        }
      }
    }

    if (matchedDraftKey) {
      mapped[c.key] = draftScores[matchedDraftKey];
      usedDraftKeys.add(matchedDraftKey);
    }
  }

  return mapped;
}
