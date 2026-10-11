import { describe, it, expect } from 'vitest';
import { safeExternalUrl, safeHref } from '@/lib/utils';

describe('safeExternalUrl', () => {
  it('allows http and https URLs', () => {
    expect(safeExternalUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(safeExternalUrl('http://meet.example.com/x')).toBe('http://meet.example.com/x');
  });

  it('normalizes bare hosts to https', () => {
    expect(safeExternalUrl('example.com/foo')).toBe('https://example.com/foo');
  });

  it('rejects javascript, data, and vbscript schemes', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects empty, non-http schemes, and invalid values', () => {
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl('   ')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl('ftp://example.com/file')).toBeNull();
    expect(safeExternalUrl('mailto:user@example.com')).toBeNull();
    expect(safeExternalUrl('//evil.com')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
  });
});

describe('safeHref', () => {
  it('allows same-origin relative paths', () => {
    expect(safeHref('/pipeline?job=1')).toBe('/pipeline?job=1');
  });

  it('rejects protocol-relative and dangerous relative values', () => {
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('/javascript:alert(1)')).toBeNull();
  });

  it('delegates absolute URLs to safeExternalUrl', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com/');
    expect(safeHref('javascript:alert(1)')).toBeNull();
  });
});
