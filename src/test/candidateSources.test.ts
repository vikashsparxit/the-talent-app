import { describe, it, expect } from 'vitest';
import { candidateSourceLabel, normalizeCandidateSourceKey } from '@/lib/candidateSources';

describe('candidate source labels', () => {
  it('treats job_application as Portal (same as portal)', () => {
    expect(candidateSourceLabel('job_application')).toBe('Portal');
    expect(candidateSourceLabel('portal')).toBe('Portal');
  });

  it('includes talent_email and import sources', () => {
    expect(candidateSourceLabel('talent_email')).toBe('Talent Email');
    expect(candidateSourceLabel('csv_import')).toBe('CSV Import');
    expect(candidateSourceLabel('bulk_resume')).toBe('Resume Upload');
  });

  it('preserves unknown free-text after normalisation', () => {
    expect(normalizeCandidateSourceKey(' Campus Drive ')).toBe('campus_drive');
    expect(candidateSourceLabel('Campus Drive')).toBe('Campus Drive');
  });
});
