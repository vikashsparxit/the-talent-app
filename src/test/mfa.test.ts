import { describe, it, expect } from 'vitest';
import { mfaSatisfied, tokenAssuranceLevel } from '../../supabase/functions/_shared/mfa.ts';

function tokenWithClaims(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

describe('tokenAssuranceLevel', () => {
  it('reads the aal claim', () => {
    expect(tokenAssuranceLevel(tokenWithClaims({ aal: 'aal1' }))).toBe('aal1');
    expect(tokenAssuranceLevel(tokenWithClaims({ aal: 'aal2', sub: 'user?~' }))).toBe('aal2');
  });

  it('returns null when the claim is missing or the token is malformed', () => {
    expect(tokenAssuranceLevel(tokenWithClaims({ sub: 'abc' }))).toBeNull();
    expect(tokenAssuranceLevel(tokenWithClaims({ aal: 2 }))).toBeNull();
    expect(tokenAssuranceLevel('not-a-jwt')).toBeNull();
    expect(tokenAssuranceLevel('a.%%%.c')).toBeNull();
    expect(tokenAssuranceLevel('')).toBeNull();
  });
});

describe('mfaSatisfied', () => {
  it('accepts aal2 sessions', () => {
    expect(mfaSatisfied('aal2', [{ status: 'verified' }])).toBe(true);
  });

  it('accepts aal1 when the user has no verified factor', () => {
    expect(mfaSatisfied('aal1', [])).toBe(true);
    expect(mfaSatisfied('aal1', undefined)).toBe(true);
    expect(mfaSatisfied('aal1', [{ status: 'unverified' }])).toBe(true);
    expect(mfaSatisfied(null, null)).toBe(true);
  });

  it('rejects aal1 when the user has a verified factor', () => {
    expect(mfaSatisfied('aal1', [{ status: 'unverified' }, { status: 'verified' }])).toBe(false);
    expect(mfaSatisfied(null, [{ status: 'verified' }])).toBe(false);
  });
});
