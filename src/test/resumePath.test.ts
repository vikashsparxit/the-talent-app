import { describe, it, expect } from 'vitest';
import {
  isSafeResumeStoragePath,
  resolveResumeStoragePath,
  resumePathMatches,
  withPublicOrigin,
} from '../../supabase/functions/_shared/resumePath.ts';

const ORIGINS = new Set(['https://api.example.com']);
const resolve = (input: unknown) => resolveResumeStoragePath(input, ORIGINS);

describe('resolveResumeStoragePath', () => {
  it('accepts bare object paths and strips the bucket prefix', () => {
    expect(resolve('abc-resume-1700000000000.pdf')).toBe('abc-resume-1700000000000.pdf');
    expect(resolve('resumes/hr-abc-1700000000000.docx')).toBe('hr-abc-1700000000000.docx');
    expect(resolve('/folder/My Resume (final).pdf')).toBe('folder/My Resume (final).pdf');
    expect(resolve('  bulk-abc-1-0.pdf  ')).toBe('bulk-abc-1-0.pdf');
  });

  it('accepts storage URLs for the resumes bucket on an allowed origin', () => {
    expect(resolve('https://api.example.com/storage/v1/object/public/resumes/a/b.pdf')).toBe('a/b.pdf');
    expect(resolve('https://api.example.com/storage/v1/object/resumes/b.pdf')).toBe('b.pdf');
    expect(
      resolve('https://api.example.com/storage/v1/object/sign/resumes/My%20Resume.pdf?token=abc'),
    ).toBe('My Resume.pdf');
  });

  it.each([
    '../company-assets/logos/x.jpg',
    'resumes/../company-assets/logos/x.jpg',
    'a/../../company-assets/x.jpg',
    'a/..',
    '..',
    './a.pdf',
    'a/./b.pdf',
    '/../company-assets/x.jpg',
  ])('rejects dot segments: %s', (input) => {
    expect(resolve(input)).toBeNull();
  });

  it.each([
    '..\\company-assets\\x.jpg',
    'a\\b.pdf',
    'resumes\\..\\company-assets\\x.jpg',
  ])('rejects backslashes: %s', (input) => {
    expect(resolve(input)).toBeNull();
  });

  it.each([
    '%2e%2e/company-assets/x.jpg',
    '%2E%2E%2Fcompany-assets%2Fx.jpg',
    '..%2fcompany-assets/x.jpg',
    '.%2e/company-assets/x.jpg',
    'a%2f..%2fb.pdf',
    '%252e%252e%252fcompany-assets/x.jpg',
    '..%5ccompany-assets%5cx.jpg',
    'a%00.pdf',
  ])('rejects encoded traversal: %s', (input) => {
    expect(resolve(input)).toBeNull();
  });

  it.each([
    'https://api.example.com/storage/v1/object/public/company-assets/logos/x.jpg',
    'https://api.example.com/storage/v1/object/public/company-assets/resumes/x.jpg',
    'https://api.example.com/storage/v1/object/public/resumes/../company-assets/x.jpg',
    'https://api.example.com/storage/v1/object/public/resumes/%2e%2e/company-assets/x.jpg',
    'https://api.example.com/storage/v1/object/public/resumes/..%2fcompany-assets%2fx.jpg',
    'https://api.example.com/storage/v1/object/public/resumes/a/../b.pdf',
    'https://api.example.com/storage/v1/object/public/resumes/',
    'https://api.example.com/resumes/a.pdf',
  ])('rejects URLs that do not address a resumes object: %s', (input) => {
    expect(resolve(input)).toBeNull();
  });

  it.each([
    'https://evil.example.com/storage/v1/object/public/resumes/a.pdf',
    'http://api.example.com/storage/v1/object/public/resumes/a.pdf',
    'https://api.example.com.evil.com/storage/v1/object/public/resumes/a.pdf',
    'https://user:pw@api.example.com/storage/v1/object/public/resumes/a.pdf',
    'https://api.example.com@evil.com/storage/v1/object/public/resumes/a.pdf',
    '//evil.example.com/resumes/a.pdf',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])('rejects other hosts and schemes: %s', (input) => {
    expect(resolve(input)).toBeNull();
  });

  it('rejects everything when no origin is allowed', () => {
    expect(
      resolveResumeStoragePath('https://api.example.com/storage/v1/object/public/resumes/a.pdf', new Set()),
    ).toBeNull();
  });

  it('rejects empty, oversized, non-string and URL-altering input', () => {
    expect(resolve('')).toBeNull();
    expect(resolve('   ')).toBeNull();
    expect(resolve('resumes/')).toBeNull();
    expect(resolve('a//b.pdf')).toBeNull();
    expect(resolve('a.pdf?download=1')).toBeNull();
    expect(resolve('a.pdf#frag')).toBeNull();
    expect(resolve('a\n.pdf')).toBeNull();
    expect(resolve('a'.repeat(600))).toBeNull();
    expect(resolve(undefined)).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(['a.pdf'])).toBeNull();
    expect(resolve({ path: 'a.pdf' })).toBeNull();
  });
});

describe('isSafeResumeStoragePath', () => {
  it('allows nested object paths', () => {
    expect(isSafeResumeStoragePath('a/b/c.pdf')).toBe(true);
    expect(isSafeResumeStoragePath('file..name.pdf')).toBe(true);
  });

  it('rejects traversal and absolute forms', () => {
    expect(isSafeResumeStoragePath('a/../b.pdf')).toBe(false);
    expect(isSafeResumeStoragePath('a/ .. /b.pdf')).toBe(false);
    expect(isSafeResumeStoragePath('/a.pdf')).toBe(false);
    expect(isSafeResumeStoragePath('https://x/a.pdf')).toBe(false);
    expect(isSafeResumeStoragePath('')).toBe(false);
  });
});

describe('withPublicOrigin', () => {
  const signed = 'http://kong:8000/storage/v1/object/sign/resumes/a%20b.pdf?token=abc.def';

  it('replaces the internal gateway origin and keeps path and token', () => {
    expect(withPublicOrigin(signed, 'https://api.example.com')).toBe(
      'https://api.example.com/storage/v1/object/sign/resumes/a%20b.pdf?token=abc.def',
    );
    expect(withPublicOrigin(signed, 'https://api.example.com:8443/')).toBe(
      'https://api.example.com:8443/storage/v1/object/sign/resumes/a%20b.pdf?token=abc.def',
    );
  });

  it('returns the URL unchanged when no usable public URL is configured', () => {
    expect(withPublicOrigin(signed, undefined)).toBe(signed);
    expect(withPublicOrigin(signed, '')).toBe(signed);
    expect(withPublicOrigin(signed, 'not a url')).toBe(signed);
  });
});

describe('resumePathMatches', () => {
  it('matches stored paths and stored storage URLs', () => {
    expect(resumePathMatches('a.pdf', 'a.pdf')).toBe(true);
    expect(resumePathMatches('resumes/a.pdf', 'a.pdf')).toBe(true);
    expect(resumePathMatches('https://old.example.com/storage/v1/object/public/resumes/a.pdf', 'a.pdf')).toBe(true);
    expect(resumePathMatches('b.pdf', 'a.pdf')).toBe(false);
    expect(resumePathMatches(null, 'a.pdf')).toBe(false);
  });
});
