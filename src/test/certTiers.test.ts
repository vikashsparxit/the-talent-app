import { describe, it, expect } from 'vitest';
import {
  findCertTier,
  normalizeCertifications,
  type CertTier,
} from '../../supabase/functions/_shared/certTiers.ts';

const tier = (n: number, skill: string): CertTier => ({ tier: n, category: 'test', skill_upgrade: skill });

const TIERS: Record<string, CertTier> = {
  pmp: tier(1, 'Project Management'),
  cissp: tier(1, 'Security'),
  cism: tier(1, 'Security Management'),
  'aws certified solutions architect': tier(2, 'Cloud'),
  'c++ certified professional': tier(3, 'Programming'),
};

describe('findCertTier', () => {
  it('matches an exact key regardless of case and spacing', () => {
    expect(findCertTier('PMP', TIERS)?.skill_upgrade).toBe('Project Management');
    expect(findCertTier('  AWS  Certified Solutions   Architect ', TIERS)?.tier).toBe(2);
  });

  it('matches a key that appears in the name as whole words', () => {
    expect(findCertTier('PMP - Project Management Professional', TIERS)?.tier).toBe(1);
    expect(findCertTier('Certified (CISSP), 2023', TIERS)?.skill_upgrade).toBe('Security');
    expect(findCertTier('AWS Certified Solutions Architect – Associate', TIERS)?.tier).toBe(2);
    expect(findCertTier('C++ Certified Professional Programmer', TIERS)?.tier).toBe(3);
  });

  it('matches a name that appears in a key as whole words', () => {
    expect(findCertTier('Solutions Architect', TIERS)?.tier).toBe(2);
  });

  it('does not match incidental substrings', () => {
    expect(findCertTier('NotAPMPCourse', TIERS)).toBeNull();
    expect(findCertTier('opencismx', TIERS)).toBeNull();
    expect(findCertTier('MyCISSPStudyGroup', TIERS)).toBeNull();
    expect(findCertTier('pmp2', TIERS)).toBeNull();
    expect(findCertTier('Solution', TIERS)).toBeNull();
  });

  it('returns null for empty names and empty config', () => {
    expect(findCertTier('', TIERS)).toBeNull();
    expect(findCertTier('   ', TIERS)).toBeNull();
    expect(findCertTier('PMP', {})).toBeNull();
  });
});

describe('normalizeCertifications', () => {
  it('turns plain strings into named objects', () => {
    expect(normalizeCertifications(['PMP', ' CISSP '])).toEqual([{ name: 'PMP' }, { name: 'CISSP' }]);
  });

  it('keeps objects and drops unusable entries', () => {
    expect(normalizeCertifications([{ name: 'PMP', year: '2024' }, '', null, 7, ['x']])).toEqual([
      { name: 'PMP', year: '2024' },
    ]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(normalizeCertifications(null)).toEqual([]);
    expect(normalizeCertifications('PMP')).toEqual([]);
  });
});
