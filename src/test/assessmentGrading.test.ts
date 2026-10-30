import { describe, it, expect } from 'vitest';
import {
  examEndsAt,
  formatAssessmentScore,
  isAttemptOverError,
  isGradingPending,
  PortalError,
  portalErrorFromBody,
  portalErrorFromDb,
} from '@/lib/assessmentGrading';

describe('grading pending display (bug 1)', () => {
  it('is pending only while queued or grading', () => {
    expect(isGradingPending({ grading_status: 'queued' })).toBe(true);
    expect(isGradingPending({ grading_status: 'grading' })).toBe(true);
    expect(isGradingPending({ grading_status: 'graded' })).toBe(false);
    expect(isGradingPending({ grading_status: 'failed' })).toBe(false);
    expect(isGradingPending({ grading_status: null })).toBe(false);
    expect(isGradingPending(null)).toBe(false);
  });

  it('shows "Grading…" instead of 0% while pending', () => {
    expect(formatAssessmentScore({ grading_status: 'queued', percentage: 0 })).toBe('Grading…');
    expect(formatAssessmentScore({ grading_status: 'graded', percentage: 72.46 })).toBe('72.5%');
    expect(formatAssessmentScore({ grading_status: null, percentage: null })).toBe('-');
  });
});

describe('portal errors (bugs 3 and 5)', () => {
  it('maps database trigger errors from the dashboard path to codes', () => {
    expect(portalErrorFromDb({ message: 'assessment_already_submitted' })?.code).toBe('already_submitted');
    expect(portalErrorFromDb({ message: 'assessment_time_limit_exceeded' })?.code).toBe('time_limit_exceeded');
    expect(portalErrorFromDb({ message: 'invalid_question_for_assessment' })?.code).toBe('invalid_question');
    expect(portalErrorFromDb({ message: 'duplicate key value' })).toBeNull();
  });

  it('keeps the server message and code from a function error body', () => {
    const e = portalErrorFromBody({ error: 'This assessment link has expired', code: 'link_expired' }, 'x');
    expect(e.message).toBe('This assessment link has expired');
    expect(e.code).toBe('link_expired');
    expect(portalErrorFromBody(null, 'fallback').message).toBe('fallback');
    expect(portalErrorFromBody({ error: 'odd', code: 'unknown' }, 'f').code).toBeNull();
  });

  it('lets submit continue when a save failed only because the attempt is over', () => {
    expect(isAttemptOverError(new PortalError('x', 'already_submitted'))).toBe(true);
    expect(isAttemptOverError(new PortalError('x', 'time_limit_exceeded'))).toBe(true);
    expect(isAttemptOverError(new PortalError('x', 'invalid_question'))).toBe(false);
    expect(isAttemptOverError(new Error('network'))).toBe(false);
  });
});

describe('exam timer end (bug 3)', () => {
  it('uses the earlier of start + duration and the deadline', () => {
    const start = '2026-10-11T10:00:00Z';
    expect(examEndsAt(start, 30, null)).toBe(Date.parse('2026-10-11T10:30:00Z'));
    expect(examEndsAt(start, 30, '2026-10-11T10:10:00Z')).toBe(Date.parse('2026-10-11T10:10:00Z'));
    expect(examEndsAt(null, 30, null)).toBeNull();
  });
});
