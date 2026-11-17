import type { CandidateAssessmentStatus } from '@/types/database';

/** A candidate's earlier attempt of the same assessment. */
export interface PriorAttempt {
  id: string;
  status: CandidateAssessmentStatus;
  deadline?: string | null;
  token_expires_at?: string | null;
}

export type AssignmentDecision =
  | {
      outcome: 'create';
      /** Invites that can no longer be started; marked 'expired' before the new attempt is created. */
      expireIds: string[];
    }
  | { outcome: 'blocked'; reason: 'in_progress' | 'invited' };

/** Still 'invited' but past its deadline or link expiry, so the candidate can never start it. */
export function isDeadInvite(attempt: PriorAttempt, now: number): boolean {
  if (attempt.status !== 'invited') return false;
  if (attempt.deadline && new Date(attempt.deadline).getTime() < now) return true;
  return !!attempt.token_expires_at && new Date(attempt.token_expires_at).getTime() <= now;
}

/**
 * Whether (re-)assigning an assessment may create a new attempt. Finished
 * attempts (completed, evaluated, expired, dead invites) stay as history; an
 * open invite or a running attempt blocks a second one.
 */
export function decideAssessmentAssignment(prior: PriorAttempt[], now: number = Date.now()): AssignmentDecision {
  if (prior.some((a) => a.status === 'in_progress')) return { outcome: 'blocked', reason: 'in_progress' };
  if (prior.some((a) => a.status === 'invited' && !isDeadInvite(a, now))) return { outcome: 'blocked', reason: 'invited' };
  return { outcome: 'create', expireIds: prior.filter((a) => isDeadInvite(a, now)).map((a) => a.id) };
}

export function assignmentBlockedMessage(reason: 'in_progress' | 'invited'): string {
  return reason === 'in_progress'
    ? 'The candidate is taking this assessment now. A new attempt can be assigned once it is submitted.'
    : 'This candidate already has an open invitation for this assessment. A new attempt can be assigned once it is completed or has expired.';
}
