import { describe, expect, it } from 'vitest';
import {
  emptyActivityCounts,
  isFeedbackOnTime,
  rankRecruiters,
  scoreRecruiter,
} from '@/lib/recruiterOfMonth';

describe('recruiter of the month scoring', () => {
  it('weights hires highest', () => {
    const s = scoreRecruiter('a', { hires: 2, advances: 3, onTimeFeedback: 1, sourced: 5 });
    expect(s.points).toEqual({ hires: 20, advances: 9, onTimeFeedback: 2, sourced: 5 });
    expect(s.total).toBe(36);
  });

  it('ranks one hire above nine sourced candidates', () => {
    const activity = new Map([
      ['sourcer', { ...emptyActivityCounts(), sourced: 9 }],
      ['closer', { ...emptyActivityCounts(), hires: 1 }],
    ]);
    expect(rankRecruiters(activity).map(r => r.userId)).toEqual(['closer', 'sourcer']);
  });

  it('breaks ties on hires and drops users with no activity', () => {
    const activity = new Map([
      ['movers', { ...emptyActivityCounts(), advances: 4, sourced: 8 }],
      ['hirer', { ...emptyActivityCounts(), hires: 2 }],
      ['idle', emptyActivityCounts()],
    ]);
    const ranked = rankRecruiters(activity);
    expect(ranked.map(r => r.userId)).toEqual(['hirer', 'movers']);
    expect(ranked[0].total).toBe(ranked[1].total);
  });

  it('treats feedback within 24 hours of the interview as on time', () => {
    expect(isFeedbackOnTime('2026-09-01T10:00:00Z', '2026-09-02T09:59:00Z')).toBe(true);
    expect(isFeedbackOnTime('2026-09-01T10:00:00Z', '2026-09-02T10:01:00Z')).toBe(false);
  });
});
