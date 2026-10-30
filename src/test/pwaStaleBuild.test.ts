/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RECOVERY_KEY } from '@/lib/appRecovery';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('nginx: missing build files are real 404s', () => {
  const conf = read('nginx.conf');
  it('serves /assets/ with try_files $uri =404 (no index.html fallback)', () => {
    expect(conf).toMatch(/location \/assets\/ \{\s*try_files \$uri =404;\s*\}/);
  });
  it('never caches a 404 and keeps immutable caching for real assets', () => {
    expect(conf).toMatch(/map "\$status \$uri" \$app_cache_control \{/);
    expect(conf).toMatch(/~\^404\\s\s+"no-store";/);
    const i404 = conf.indexOf('"no-store"');
    const iAssets = conf.indexOf('immutable');
    expect(i404).toBeGreaterThan(0);
    expect(i404).toBeLessThan(iAssets);
  });
});

describe('PWA update flow', () => {
  const vite = read('vite.config.ts');
  it('registers through virtual:pwa-register (reloads on update), not the injected registerSW.js', () => {
    expect(vite).toMatch(/registerType: "autoUpdate"/);
    expect(vite).toMatch(/injectRegister: false/);
    expect(vite).toMatch(/skipWaiting: true/);
    expect(vite).toMatch(/clientsClaim: true/);
    expect(vite).toMatch(/cleanupOutdatedCaches: true/);
    expect(read('src/main.tsx')).toMatch(/registerAppServiceWorker\(\)/);
    expect(read('src/lib/pwa.ts')).toMatch(/from 'virtual:pwa-register'/);
  });
  it('does not answer /assets/ navigations with the app shell', () => {
    expect(vite).toMatch(/navigateFallbackDenylist: \[[^\]]*\/\^\\\/assets\\\/\//);
  });
});

describe('boot guard', () => {
  it('loads before the module bundle and shares the recovery key', () => {
    const html = read('index.html');
    expect(html.indexOf('<script src="/boot-guard.js"></script>')).toBeGreaterThan(0);
    expect(html.indexOf('/boot-guard.js')).toBeLessThan(html.indexOf('type="module"'));
    expect(read('public/boot-guard.js')).toContain(`'${RECOVERY_KEY}'`);
  });

  it('shows a Reload screen when a build script fails right after a recovery reload', () => {
    document.body.innerHTML = '<div id="root"></div>';
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    new Function(read('public/boot-guard.js'))();
    const s = document.createElement('script');
    s.src = '/assets/index-gone.js';
    document.body.appendChild(s);
    s.dispatchEvent(new Event('error'));
    const fallback = document.getElementById('tta-boot-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toContain('Reload');
  });
});

describe('global search: mic stays clear of the dialog close button', () => {
  it('pads the input row right of the mic', () => {
    expect(read('src/components/GlobalSearchCommand.tsx')).toMatch(/suffix=\{micButton\}[\s\S]{0,300}wrapperClassName="pr-12"/);
    expect(read('src/components/ui/command.tsx')).toMatch(/cn\("flex items-center gap-1 border-b px-3", wrapperClassName\)/);
  });
});
