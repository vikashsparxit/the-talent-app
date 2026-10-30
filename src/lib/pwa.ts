import { registerSW } from 'virtual:pwa-register';

/** How often a long-lived tab or installed app checks for a new build. */
export const SW_UPDATE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Register the service worker. With registerType "autoUpdate" the new worker
 * skips waiting and claims the page, and registerSW reloads the page once when
 * the updated worker activates, so a running tab never keeps the old build
 * after the new worker has replaced its cached files.
 *
 * Installed apps can stay open for days, so also check for an update when the
 * app comes back to the foreground and every SW_UPDATE_INTERVAL_MS.
 */
export function registerAppServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine === false) return;
        registration.update().catch(() => undefined);
      };
      window.setInterval(check, SW_UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
