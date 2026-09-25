import { describe, it, expect } from 'vitest';
import { isApplicantUser, isStaffUser, isInternalStaffRole } from '@/lib/publicRoutes';

describe('staff vs applicant identity', () => {
  it('treats interviewer with applicant_profiles as staff, not applicant', () => {
    expect(isApplicantUser('interviewer', true)).toBe(false);
    expect(isStaffUser('interviewer', true)).toBe(true);
  });

  it('treats applicant-only accounts as applicants', () => {
    expect(isApplicantUser(null, true)).toBe(true);
    expect(isStaffUser(null, true)).toBe(false);
  });

  it('keeps elevated staff as staff even with applicant profile', () => {
    expect(isApplicantUser('admin', true)).toBe(false);
    expect(isApplicantUser('hr', true)).toBe(false);
    expect(isApplicantUser('recruiter', true)).toBe(false);
    expect(isStaffUser('recruiter', true)).toBe(true);
  });

  it('recognizes all internal staff roles', () => {
    expect(isInternalStaffRole('interviewer')).toBe(true);
    expect(isInternalStaffRole('applicant')).toBe(false);
  });
});
