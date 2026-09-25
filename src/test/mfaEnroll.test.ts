import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildOtpAuthUri,
  generateMfaFriendlyName,
  getUnverifiedTotpFactorIds,
  getVerifiedTotpFactor,
  isMfaFactorAlreadyExistsError,
  mapMfaEnrollError,
  toQrDataUrl,
} from '@/lib/mfaEnroll';

describe('mfaEnroll helpers', () => {
  it('generateMfaFriendlyName returns a non-empty unique label', () => {
    const name = generateMfaFriendlyName(1_700_000_000_000);
    expect(name).toBe('Authenticator 1700000000000');
    expect(name.length).toBeGreaterThan(0);
  });

  it('getUnverifiedTotpFactorIds returns only unverified factor ids', () => {
    const ids = getUnverifiedTotpFactorIds([
      { id: 'a', status: 'verified' },
      { id: 'b', status: 'unverified' },
      { id: 'c', status: 'unverified' },
    ]);
    expect(ids).toEqual(['b', 'c']);
  });

  it('getVerifiedTotpFactor returns the verified factor', () => {
    const verified = getVerifiedTotpFactor([
      { id: 'a', status: 'unverified' },
      { id: 'b', status: 'verified' },
    ]);
    expect(verified?.id).toBe('b');
  });

  it('detects GoTrue duplicate friendly name errors', () => {
    const error = new Error('A factor with the friendly name "" for this user already exists');
    expect(isMfaFactorAlreadyExistsError(error)).toBe(true);
    expect(mapMfaEnrollError(error)).toBe('A previous setup was incomplete. Resetting…');
  });

  it('toQrDataUrl preserves data URIs and encodes raw SVG', () => {
    const dataUri = 'data:image/svg+xml;base64,abc';
    expect(toQrDataUrl(dataUri)).toBe(dataUri);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(toQrDataUrl(svg)).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
  });

  it('buildOtpAuthUri encodes issuer, account, and secret', () => {
    const uri = buildOtpAuthUri({
      secret: 'ABC DEF',
      issuer: 'SparxTalent',
      accountName: 'user@example.com',
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=ABCDEF');
    expect(uri).toContain('issuer=SparxTalent');
  });

  it('MfaEnrollPanel copy buttons are non-submit buttons with guarded handlers', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/auth/MfaEnrollPanel.tsx'),
      'utf8',
    );
    expect(src).toContain('type="button"');
    expect(src).toContain('event.preventDefault()');
    expect(src).toContain('event.stopPropagation()');
    expect(src).toContain('[enrollAttempt]');
  });
});
