/**
 * Recovery from a stale or half-updated build.
 *
 * After a deploy, a page (often an installed PWA kept alive in the background)
 * can still run the previous build. When it later asks for one of that build's
 * hashed files (a lazy route chunk, a stylesheet) the file is gone, the load
 * fails and the app used to go blank. These helpers detect that case and do a
 * single cache-busting reload, with the service worker and Cache Storage
 * cleared so the reload really fetches the new build.
 */

/** sessionStorage key shared with public/boot-guard.js. */
export const RECOVERY_KEY = 'tta:recovery-reload-at';
/** Do not reload again within this window, so a real outage cannot loop. */
export const RECOVERY_COOLDOWN_MS = 60_000;
/** Query parameter added to the reload URL (removed again on the next load). */
export const RECOVERY_PARAM = '__r';

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading (css )?chunk [\w-]+ failed/i,
  /unable to preload css/i,
  /is not a valid javascript mime type/i,
  /'text\/html' is not a valid/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message: string }).message)
          : '';
  if (!message) return false;
  if ((error as { name?: string }).name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

/** True when a failed element load is one of our hashed build files. */
export function isBuildAssetElement(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLScriptElement & HTMLLinkElement;
  const tag = el.tagName.toUpperCase();
  const url = tag === 'SCRIPT' ? el.src : tag === 'LINK' ? el.href : '';
  return typeof url === 'string' && /\/assets\/[^/]+\.(?:js|mjs|css)(?:[?#]|$)/.test(url);
}

export interface RecoveryEnv {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistrations'> | null;
  caches?: Pick<CacheStorage, 'keys' | 'delete'> | null;
  location: Pick<Location, 'href' | 'replace'>;
  now?: () => number;
}

function browserEnv(): RecoveryEnv {
  let storage: RecoveryEnv['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : null,
    caches: typeof caches !== 'undefined' ? caches : null,
    location: window.location,
  };
}

export function recoveredRecently(env: Pick<RecoveryEnv, 'storage' | 'now'>): boolean {
  const now = (env.now ?? Date.now)();
  let last = 0;
  try {
    last = Number(env.storage?.getItem(RECOVERY_KEY) ?? 0) || 0;
  } catch {
    last = 0;
  }
  return last > 0 && now - last < RECOVERY_COOLDOWN_MS;
}

/**
 * Unregister service workers, clear Cache Storage and reload once with a
 * cache-busting parameter. Returns false (and does nothing) when a recovery
 * reload already happened within the cooldown, unless `force` is set (the
 * user pressed Reload).
 */
export async function recoverFromStaleBuild(
  options: { force?: boolean } = {},
  env: RecoveryEnv = browserEnv(),
): Promise<boolean> {
  const now = (env.now ?? Date.now)();
  if (!options.force && recoveredRecently(env)) return false;
  try {
    env.storage?.setItem(RECOVERY_KEY, String(now));
  } catch {
    // Storage can be unavailable (private mode); the reload still helps.
  }
  try {
    const regs = (await env.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    // ignore
  }
  try {
    const keys = (await env.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => env.caches!.delete(k).catch(() => false)));
  } catch {
    // ignore
  }
  const url = new URL(env.location.href);
  url.searchParams.set(RECOVERY_PARAM, String(now));
  env.location.replace(url.toString());
  return true;
}

/** Drop the cache-busting parameter from the address bar after a recovery reload. */
export function stripRecoveryParam(win: Window = window): void {
  try {
    const url = new URL(win.location.href);
    if (!url.searchParams.has(RECOVERY_PARAM)) return;
    url.searchParams.delete(RECOVERY_PARAM);
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // ignore
  }
}

/**
 * Catch failed loads of build files: Vite's preload error, a <script>/<link>
 * for /assets/* that errors, and unhandled dynamic-import rejections.
 * Returns a function that removes the listeners.
 */
export function installChunkErrorGuard(
  win: Window = window,
  recover: () => unknown = () => recoverFromStaleBuild(),
): () => void {
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    void recover();
  };
  const onError = (event: Event) => {
    if (isBuildAssetElement(event.target)) void recover();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) void recover();
  };
  win.addEventListener('vite:preloadError', onPreloadError);
  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError);
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
