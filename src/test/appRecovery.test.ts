import { describe, it, expect, vi } from 'vitest';
import {
  RECOVERY_COOLDOWN_MS,
  RECOVERY_KEY,
  installChunkErrorGuard,
  isBuildAssetElement,
  isChunkLoadError,
  recoverFromStaleBuild,
  recoveredRecently,
  stripRecoveryParam,
} from '@/lib/appRecovery';

function memoryStorage(init: Record<string, string> = {}) {
  const data = { ...init };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

function env(now: number, storage = memoryStorage()) {
  const unregister = vi.fn(async () => true);
  const del = vi.fn(async () => true);
  const replace = vi.fn();
  return {
    storage,
    serviceWorker: {
      getRegistrations: vi.fn(async () => [{ unregister }, { unregister }] as unknown as readonly ServiceWorkerRegistration[]),
    },
    caches: { keys: vi.fn(async () => ['workbox-precache-v2', 'other']), delete: del },
    location: { href: 'https://app.example.com/dashboard?tab=1#x', replace },
    now: () => now,
    unregister,
    del,
    replace,
  };
}

describe('isChunkLoadError', () => {
  it.each([
    'TypeError: Failed to fetch dynamically imported module: https://x/assets/Jobs-abc.js',
    'TypeError: error loading dynamically imported module',
    'TypeError: Importing a module script failed.',
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'. 'text/html' is not a valid JavaScript MIME type.",
    'Unable to preload CSS for /assets/index-x.css',
  ])('detects %s', (msg) => {
    expect(isChunkLoadError(new Error(msg))).toBe(true);
    expect(isChunkLoadError(msg)).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

describe('isBuildAssetElement', () => {
  it('matches scripts and stylesheets under /assets/', () => {
    const s = document.createElement('script');
    s.src = 'https://app.example.com/assets/index-abc.js';
    const l = document.createElement('link');
    l.href = 'https://app.example.com/assets/index-abc.css';
    expect(isBuildAssetElement(s)).toBe(true);
    expect(isBuildAssetElement(l)).toBe(true);
  });
  it('ignores images and third-party scripts', () => {
    const img = document.createElement('img');
    img.src = 'https://app.example.com/assets/logo.png';
    const s = document.createElement('script');
    s.src = 'https://cdn.example.com/lib.js';
    expect(isBuildAssetElement(img)).toBe(false);
    expect(isBuildAssetElement(s)).toBe(false);
    expect(isBuildAssetElement(window)).toBe(false);
  });
});

describe('recoverFromStaleBuild', () => {
  it('unregisters service workers, clears caches and reloads once with a cache-busting param', async () => {
    const e = env(1_000_000);
    expect(await recoverFromStaleBuild({}, e)).toBe(true);
    expect(e.unregister).toHaveBeenCalledTimes(2);
    expect(e.del).toHaveBeenCalledWith('workbox-precache-v2');
    expect(e.del).toHaveBeenCalledWith('other');
    expect(e.replace).toHaveBeenCalledWith('https://app.example.com/dashboard?tab=1&__r=1000000#x');
    expect(e.storage.data[RECOVERY_KEY]).toBe('1000000');
  });

  it('does not loop: a second automatic recovery within the cooldown is skipped', async () => {
    const storage = memoryStorage({ [RECOVERY_KEY]: '1000000' });
    const e = env(1_000_000 + RECOVERY_COOLDOWN_MS - 1, storage);
    expect(recoveredRecently(e)).toBe(true);
    expect(await recoverFromStaleBuild({}, e)).toBe(false);
    expect(e.replace).not.toHaveBeenCalled();
  });

  it('runs again after the cooldown, or when the user presses Reload', async () => {
    const storage = memoryStorage({ [RECOVERY_KEY]: '1000000' });
    const later = env(1_000_000 + RECOVERY_COOLDOWN_MS + 1, storage);
    expect(await recoverFromStaleBuild({}, later)).toBe(true);
    const forced = env(1_000_001, memoryStorage({ [RECOVERY_KEY]: '1000000' }));
    expect(await recoverFromStaleBuild({ force: true }, forced)).toBe(true);
  });

  it('still reloads when storage, service workers and caches are unavailable', async () => {
    const replace = vi.fn();
    const ok = await recoverFromStaleBuild({}, { storage: null, serviceWorker: null, caches: null, location: { href: 'https://a.example/', replace }, now: () => 5 });
    expect(ok).toBe(true);
    expect(replace).toHaveBeenCalledWith('https://a.example/?__r=5');
  });
});

describe('installChunkErrorGuard', () => {
  it('recovers on vite:preloadError (and stops Vite from rethrowing)', () => {
    const recover = vi.fn();
    const off = installChunkErrorGuard(window, recover);
    const ev = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(ev);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    off();
  });

  it('recovers when a build script fails to load, not for other elements', () => {
    const recover = vi.fn();
    const off = installChunkErrorGuard(window, recover);
    const s = document.createElement('script');
    s.src = '/assets/index-old.js';
    document.body.appendChild(s);
    s.dispatchEvent(new Event('error'));
    const img = document.createElement('img');
    img.src = '/assets/logo.png';
    document.body.appendChild(img);
    img.dispatchEvent(new Event('error'));
    expect(recover).toHaveBeenCalledTimes(1);
    off();
    s.remove();
    img.remove();
  });

  it('recovers on an unhandled dynamic import rejection only', () => {
    const recover = vi.fn();
    const off = installChunkErrorGuard(window, recover);
    const fire = (reason: unknown) => {
      const ev = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(ev, 'reason', { value: reason });
      window.dispatchEvent(ev);
    };
    fire(new TypeError('Failed to fetch dynamically imported module: /assets/Jobs-old.js'));
    fire(new Error('network down'));
    expect(recover).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('stripRecoveryParam', () => {
  it('removes __r from the address bar and keeps the rest', () => {
    window.history.replaceState(null, '', '/candidates?x=1&__r=123#top');
    stripRecoveryParam();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/candidates?x=1#top');
  });
});
