import { describe, it, expect } from 'vitest';
import {
  buildSalaryCacheKey,
  compareExpectedToBand,
  parseCtcLakhs,
} from '@/lib/salaryMarketCheck';

describe('salary market helpers', () => {
  it('parses CTC lakhs from recruiter notes', () => {
    expect(parseCtcLakhs('35')).toBe(35);
    expect(parseCtcLakhs('₹25 Lakh(s)')).toBe(25);
    expect(parseCtcLakhs('')).toBeNull();
  });

  it('compares expected to a band without inventing numbers', () => {
    expect(compareExpectedToBand(35, 16, 28)).toBe('above');
    expect(compareExpectedToBand(25, 16, 28)).toBe('in_band');
    expect(compareExpectedToBand(12, 16, 28)).toBe('below');
    expect(compareExpectedToBand(null, 16, 28)).toBeNull();
  });

  it('uses a stable candidate and job cache key', () => {
    const a = buildSalaryCacheKey({
      candidateId: 'c1',
      jobId: 'j1',
    });
    const b = buildSalaryCacheKey({
      candidateId: 'c1',
      jobId: 'j1',
    });
    const otherJob = buildSalaryCacheKey({
      candidateId: 'c1',
      jobId: 'j2',
    });
    expect(a).toBe('c1|j1|v2');
    expect(a).toBe(b);
    expect(a).not.toBe(otherJob);
  });
});
