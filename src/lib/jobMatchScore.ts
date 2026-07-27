import type { Job } from '@/types/jobs';

export const RELEVANT_JOB_MATCH_THRESHOLD = 60;

const MIN_SUBSTRING_SKILL_LENGTH = 4;

export interface ApplicantMatchProfile {
  skills?: string[] | null;
  work_experience?: Array<{ title?: string; description?: string; company?: string }> | null;
  education?: Array<{ field?: string; degree?: string }> | null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordBoundaryMatch(text: string, term: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
  return pattern.test(text);
}

export function buildApplicantSkillCorpus(profile: ApplicantMatchProfile | null): string[] {
  if (!profile) return [];

  const tokens: string[] = [];

  if (profile.skills && Array.isArray(profile.skills)) {
    profile.skills.forEach((skill) => {
      const normalized = normalizeToken(skill);
      if (normalized) tokens.push(normalized);
    });
  }

  if (profile.work_experience && Array.isArray(profile.work_experience)) {
    profile.work_experience.forEach((exp) => {
      if (exp.title) tokens.push(normalizeToken(exp.title));
      if (exp.company) tokens.push(normalizeToken(exp.company));
    });
  }

  if (profile.education && Array.isArray(profile.education)) {
    profile.education.forEach((edu) => {
      if (edu.field) tokens.push(normalizeToken(edu.field));
      if (edu.degree) tokens.push(normalizeToken(edu.degree));
    });
  }

  return tokens;
}

function skillMatchesCorpus(skill: string, corpusText: string, corpusTokens: string[]): boolean {
  const skillLower = normalizeToken(skill);
  if (!skillLower) return false;

  const phrasePattern = new RegExp(
    `\\b${escapeRegExp(skillLower).replace(/\s+/g, '\\s+')}\\b`,
    'i',
  );
  if (phrasePattern.test(corpusText)) return true;

  if (!skillLower.includes(' ')) {
    if (corpusTokens.some((token) => token === skillLower)) return true;
    if (skillLower.length >= MIN_SUBSTRING_SKILL_LENGTH) {
      return hasWordBoundaryMatch(corpusText, skillLower);
    }
    return false;
  }

  const parts = skillLower.split(/\s+/).filter(Boolean);
  return parts.every((part) => hasWordBoundaryMatch(corpusText, part));
}

function scoreFromRequiredSkills(
  requiredSkills: string[],
  corpusText: string,
  corpusTokens: string[],
): number {
  let matchedCount = 0;
  for (const skill of requiredSkills) {
    if (skillMatchesCorpus(skill, corpusText, corpusTokens)) {
      matchedCount++;
    }
  }
  return Math.round((matchedCount / requiredSkills.length) * 100);
}

function scoreFromDescription(
  description: string,
  profile: ApplicantMatchProfile | null,
): number {
  const skillTokens = (profile?.skills ?? [])
    .map((skill) => normalizeToken(skill))
    .filter((token) => token.length >= MIN_SUBSTRING_SKILL_LENGTH);

  const uniqueKeywords = [...new Set(skillTokens)];
  if (uniqueKeywords.length === 0) return 0;

  const descriptionLower = description.toLowerCase();
  let matchedCount = 0;
  for (const keyword of uniqueKeywords) {
    if (hasWordBoundaryMatch(descriptionLower, keyword)) {
      matchedCount++;
    }
  }

  return Math.round((matchedCount / uniqueKeywords.length) * 100);
}

export function calculateJobMatchScore(
  profile: ApplicantMatchProfile | null,
  job: Pick<Job, 'required_skills' | 'description'>,
): number {
  const corpusTokens = buildApplicantSkillCorpus(profile);
  if (corpusTokens.length === 0) return 0;

  const corpusText = corpusTokens.join(' ');
  const requiredSkills = job.required_skills?.filter(Boolean) ?? [];

  if (requiredSkills.length > 0) {
    return scoreFromRequiredSkills(requiredSkills, corpusText, corpusTokens);
  }

  if (job.description?.trim()) {
    return scoreFromDescription(job.description, profile);
  }

  return 0;
}

export function isRelevantJobMatch(score: number): boolean {
  return score >= RELEVANT_JOB_MATCH_THRESHOLD;
}

export function getMatchScoreColorClass(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-muted-foreground';
}
