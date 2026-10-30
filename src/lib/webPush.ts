import { supabase } from '@/integrations/supabase/client';
import type { NotificationPrefs } from '../../supabase/functions/_shared/pushPayload.ts';

/**
 * Browser side of Web Push. The permission prompt is only ever requested from
 * enablePush(), which must run in a user tap handler (iOS requires it).
 * syncPushSubscription() runs on every app start: public/boot-guard.js
 * unregisters the service worker during stale-build recovery, which destroys
 * the push subscription, so a granted permission is re-subscribed silently.
 */

export type PushAvailability =
  /** Push works here. */
  | 'available'
  /** iOS/iPadOS Safari tab: push needs the app on the Home Screen first. */
  | 'needs-install'
  /** No Push API in this browser. */
  | 'unsupported';

export interface PushEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasPushApi: boolean;
}

export function isIosDevice(env: Pick<PushEnvironment, 'userAgent' | 'maxTouchPoints'>): boolean {
  // iPadOS reports a desktop Mac user agent; touch support gives it away.
  return /iPad|iPhone|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
}

export function pushAvailability(env: PushEnvironment): PushAvailability {
  if (isIosDevice(env) && !env.standalone) return 'needs-install';
  return env.hasPushApi ? 'available' : 'unsupported';
}

export function pushPlatform(env: Pick<PushEnvironment, 'userAgent' | 'maxTouchPoints'>): string {
  if (isIosDevice(env)) return 'ios';
  if (/Android/.test(env.userAgent)) return 'android';
  if (/Windows/.test(env.userAgent)) return 'windows';
  if (/Macintosh/.test(env.userAgent)) return 'macos';
  if (/Linux|CrOS/.test(env.userAgent)) return 'linux';
  return 'other';
}

export function currentPushEnvironment(): PushEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (nav as Navigator & { standalone?: boolean } | undefined)?.standalone === true),
    hasPushApi:
      typeof window !== 'undefined' &&
      !!nav &&
      'serviceWorker' in nav &&
      'PushManager' in window &&
      'Notification' in window,
  };
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const b64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

export interface SubscriptionRow {
  p_endpoint: string;
  p_p256dh: string;
  p_auth: string;
  p_user_agent: string;
  p_platform: string;
}

/** Arguments for register_push_subscription() from a browser subscription. */
export function subscriptionRow(sub: PushSubscriptionJSON, env: PushEnvironment): SubscriptionRow | null {
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!sub.endpoint || !p256dh || !auth) return null;
  return {
    p_endpoint: sub.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: env.userAgent.slice(0, 512),
    p_platform: pushPlatform(env),
  };
}

let publicKeyPromise: Promise<string | null> | null = null;

/** This instance's VAPID public key, or null when push is not configured. */
export function fetchPushPublicKey(): Promise<string | null> {
  publicKeyPromise ??= supabase.functions
    .invoke<{ publicKey: string | null }>('push-config')
    .then(({ data, error }) => (error ? null : data?.publicKey ?? null))
    .catch(() => null)
    .then((key) => {
      if (!key) publicKeyPromise = null;
      return key;
    });
  return publicKeyPromise;
}

/** The active service worker registration, or null if none shows up in time (dev server, blocked SW). */
async function readyRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function subscribeAndRegister(registration: ServiceWorkerRegistration, publicKey: string): Promise<boolean> {
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await registration.pushManager.getSubscription();
  // A subscription made with another instance's key (or rotated keys) cannot receive our pushes.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const row = subscriptionRow(sub.toJSON(), currentPushEnvironment());
  if (!row) return false;
  const { error } = await supabase.rpc('register_push_subscription', row);
  return !error;
}

export type EnablePushResult = 'enabled' | 'denied' | 'unavailable' | 'failed';

/** Ask for permission and subscribe this device. Call from a click/tap handler only. */
export async function enablePush(): Promise<EnablePushResult> {
  if (pushAvailability(currentPushEnvironment()) !== 'available') return 'unavailable';
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await readyRegistration();
  if (!registration) return 'unavailable';
  try {
    return (await subscribeAndRegister(registration, publicKey)) ? 'enabled' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Re-subscribe silently when permission is already granted. Never prompts. */
export async function syncPushSubscription(): Promise<boolean> {
  if (pushAvailability(currentPushEnvironment()) !== 'available') return false;
  if (Notification.permission !== 'granted') return false;
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return false;
  const registration = await readyRegistration();
  if (!registration) return false;
  try {
    return await subscribeAndRegister(registration, publicKey);
  } catch {
    return false;
  }
}

/** Unsubscribe this device and forget it server-side. Call before signing out. */
export async function disablePush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager?.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
}

/** Whether this device currently has a push subscription. */
export async function hasPushSubscription(): Promise<boolean> {
  if (pushAvailability(currentPushEnvironment()) !== 'available') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return !!(await registration?.pushManager?.getSubscription());
}

/** Show the unread count on the installed app icon; 0 clears it. */
export function setAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
  else void nav.clearAppBadge?.().catch(() => undefined);
}

/** Preferences row as stored, or the defaults when the user has none yet. Times become "HH:MM". */
export function normalizeNotificationPrefs(row: {
  push_enabled?: boolean | null;
  types?: unknown;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
} | null | undefined): NotificationPrefs {
  const types: Record<string, boolean> = {};
  if (row?.types && typeof row.types === 'object' && !Array.isArray(row.types)) {
    for (const [type, on] of Object.entries(row.types as Record<string, unknown>)) {
      if (typeof on === 'boolean') types[type] = on;
    }
  }
  const time = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
  return {
    push_enabled: row?.push_enabled !== false,
    types,
    quiet_hours_start: time(row?.quiet_hours_start),
    quiet_hours_end: time(row?.quiet_hours_end),
  };
}

const PROMPT_DISMISSED_KEY = 'tta:push-prompt-dismissed-at';
/** A dismissed prompt comes back after this long. */
export const PUSH_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function isPushPromptSnoozed(now: number = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(PROMPT_DISMISSED_KEY)) || 0;
    return at > 0 && now - at < PUSH_PROMPT_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozePushPrompt(now: number = Date.now()): void {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, String(now));
  } catch {
    // Private mode: the prompt simply shows again next time.
  }
}

/** Message the service worker posts when a notification is tapped while the app is open. */
export interface PushNavigateMessage {
  type: 'tta:push-navigate';
  link: string;
  id: string | null;
}

export function isPushNavigateMessage(data: unknown): data is PushNavigateMessage {
  const d = data as Partial<PushNavigateMessage> | null;
  return !!d && d.type === 'tta:push-navigate' && typeof d.link === 'string' && d.link.startsWith('/') && !d.link.startsWith('//') && !d.link.includes('\\');
}
