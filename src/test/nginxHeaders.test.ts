import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const conf = readFileSync(path.resolve(__dirname, '../../nginx.conf'), 'utf8');

const headerValues = (name: string) =>
  [...conf.matchAll(new RegExp(`add_header ${name} "([^"]*)" always;`, 'g'))].map((m) => m[1]);

describe('nginx security headers', () => {
  it('lets our own pages use the microphone for voice search and nothing else', () => {
    const policies = headerValues('Permissions-Policy');
    // Set once at server level; no location overrides add_header.
    expect(policies).toHaveLength(1);
    for (const policy of policies) {
      expect(policy).toBe('camera=(), microphone=(self), geolocation=()');
    }
  });

  it('keeps the report-only CSP a single well-formed header', () => {
    const csp = headerValues('Content-Security-Policy-Report-Only');
    expect(csp).toHaveLength(1);
    const directives = csp[0].split(';').map((d) => d.trim()).filter(Boolean);
    const names = directives.map((d) => d.split(/\s+/)[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['default-src', 'script-src', 'connect-src', 'object-src', 'frame-ancestors']));
    for (const d of directives) {
      const sources = d.split(/\s+/).slice(1);
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) {
        if (src.startsWith("'")) expect(src).toMatch(/^'[a-z-]+'$/);
      }
    }
  });

  it('revalidates the service worker, manifest and pages but caches hashed assets', () => {
    expect(conf).toMatch(/add_header Cache-Control \$app_cache_control always;/);
    expect(conf).not.toMatch(/^\s*location ~\*/m);
    expect(conf).toMatch(/~\*\^\/\(sw\\\.js\|registerSW\\\.js\|manifest\\\.webmanifest\)\$\s+"no-cache";/);
    expect(conf).toMatch(/~\^\/assets\/\s+"public, max-age=31536000, immutable";/);
    expect(conf).toMatch(/default\s+"no-cache";/);
  });
});
