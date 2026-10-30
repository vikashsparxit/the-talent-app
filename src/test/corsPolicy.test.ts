import { describe, it, expect } from 'vitest';
import {
  parseAllowedOrigins,
  resolveAllowedOrigin,
} from '../../supabase/functions/_shared/corsPolicy.ts';

describe('parseAllowedOrigins', () => {
  it('splits the comma list and reduces entries to origins', () => {
    expect(
      parseAllowedOrigins(' https://app.example.com/ , https://admin.example.com/login ', undefined),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('drops invalid, non-http and duplicate entries', () => {
    expect(
      parseAllowedOrigins('*, not a url, ftp://files.example.com, https://app.example.com, https://APP.example.com', undefined),
    ).toEqual(['https://app.example.com']);
  });

  it('falls back to PUBLIC_APP_URL only when ALLOWED_ORIGINS is unset or blank', () => {
    expect(parseAllowedOrigins(undefined, 'https://talent.example.com/')).toEqual(['https://talent.example.com']);
    expect(parseAllowedOrigins('  ', 'https://talent.example.com')).toEqual(['https://talent.example.com']);
    expect(parseAllowedOrigins('https://app.example.com', 'https://talent.example.com')).toEqual([
      'https://app.example.com',
    ]);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(parseAllowedOrigins(undefined, undefined)).toEqual([]);
    expect(parseAllowedOrigins('', '')).toEqual([]);
  });
});

describe('resolveAllowedOrigin', () => {
  const allowed = ['https://app.example.com', 'http://localhost:5173'];

  it('reflects an allowlisted origin', () => {
    expect(resolveAllowedOrigin('https://app.example.com', allowed)).toBe('https://app.example.com');
    expect(resolveAllowedOrigin('http://localhost:5173', allowed)).toBe('http://localhost:5173');
  });

  it('rejects origins that are not an exact match', () => {
    expect(resolveAllowedOrigin('https://evil.example.com', allowed)).toBeNull();
    expect(resolveAllowedOrigin('https://app.example.com.evil.test', allowed)).toBeNull();
    expect(resolveAllowedOrigin('http://app.example.com', allowed)).toBeNull();
    expect(resolveAllowedOrigin('https://app.example.com:8443', allowed)).toBeNull();
    expect(resolveAllowedOrigin('null', allowed)).toBeNull();
  });

  it('returns null when the request has no Origin header', () => {
    expect(resolveAllowedOrigin(null, allowed)).toBeNull();
    expect(resolveAllowedOrigin('', allowed)).toBeNull();
  });

  it('allows only loopback origins when no allowlist is configured', () => {
    expect(resolveAllowedOrigin('http://localhost:5173', [])).toBe('http://localhost:5173');
    expect(resolveAllowedOrigin('http://127.0.0.1:8080', [])).toBe('http://127.0.0.1:8080');
    expect(resolveAllowedOrigin('https://evil.example.com', [])).toBeNull();
    expect(resolveAllowedOrigin('http://localhost.evil.test', [])).toBeNull();
  });
});
