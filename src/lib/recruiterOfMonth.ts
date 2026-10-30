export const RECRUITER_SCORE_WEIGHTS = {
  hires: 10,
  advances: 3,
  onTimeFeedback: 2,
  sourced: 1,
} as const;

export type RecruiterScoreKey = keyof typeof RECRUITER_SCORE_WEIGHTS;

export const RECRUITER_SCORE_LABELS: Record<RecruiterScoreKey, string> = {
  hires: 'Hires',
  advances: 'Stage moves',
  onTimeFeedback: 'On-time feedback',
  sourced: 'Candidates sourced',
};

export const ON_TIME_FEEDBACK_HOURS = 24;

export type RecruiterActivityCounts = Record<RecruiterScoreKey, number>;

export interface RecruiterScore {
  userId: string;
  counts: RecruiterActivityCounts;
  points: Record<RecruiterScoreKey, number>;
  total: number;
}

export function emptyActivityCounts(): RecruiterActivityCounts {
  return { hires: 0, advances: 0, onTimeFeedback: 0, sourced: 0 };
}

export function isFeedbackOnTime(scheduledAt: string, completedAt: string): boolean {
  const lagMs = new Date(completedAt).getTime() - new Date(scheduledAt).getTime();
  return lagMs <= ON_TIME_FEEDBACK_HOURS * 60 * 60 * 1000;
}

export function scoreRecruiter(userId: string, counts: RecruiterActivityCounts): RecruiterScore {
  const keys = Object.keys(RECRUITER_SCORE_WEIGHTS) as RecruiterScoreKey[];
  const points = Object.fromEntries(
    keys.map(k => [k, counts[k] * RECRUITER_SCORE_WEIGHTS[k]]),
  ) as Record<RecruiterScoreKey, number>;
  const total = keys.reduce((sum, k) => sum + points[k], 0);
  return { userId, counts, points, total };
}

/** Highest score wins; ties go to more hires, then more stage moves. */
export function rankRecruiters(
  activity: Map<string, RecruiterActivityCounts>,
): RecruiterScore[] {
  return [...activity.entries()]
    .map(([userId, counts]) => scoreRecruiter(userId, counts))
    .filter(s => s.total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.counts.hires - a.counts.hires ||
        b.counts.advances - a.counts.advances,
    );
}
