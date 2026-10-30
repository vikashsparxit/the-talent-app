// Push notification catalog, per-user preference checks and payload builder.
// Shared by the send-push function and the app's notification settings.
// No Deno APIs or remote imports here, so the app and the vitest suite can
// import it directly.
//
// Push payloads pass through the browser vendors' push services and show on
// lock screens, so they carry generic text keyed by notification type only:
// never the stored title or message, which can contain candidate names.

import type { PushUrgency } from "./webPush.ts";

export interface PushTypeInfo {
  /** Settings label. */
  label: string;
  /** Lock-screen title. */
  title: string;
  /** Lock-screen body. */
  body: string;
  /** Whether push is on for this type until the user changes it. */
  defaultOn: boolean;
}

export const PUSH_NOTIFICATION_TYPES = {
  interview_scheduled: {
    label: "Interview scheduled",
    title: "Interview scheduled",
    body: "You have a new interview. Tap to view.",
    defaultOn: true,
  },
  interview_reminder: {
    label: "Interview reminders",
    title: "Interview starting soon",
    body: "You have an interview coming up. Tap to view.",
    defaultOn: true,
  },
  interview_cancelled: {
    label: "Interview cancelled",
    title: "Interview cancelled",
    body: "An interview on your calendar was cancelled. Tap to view.",
    defaultOn: true,
  },
  verdict_submitted: {
    label: "Interview feedback submitted",
    title: "Interview feedback submitted",
    body: "New interview feedback is ready. Tap to view.",
    defaultOn: true,
  },
  new_application: {
    label: "New applications on my jobs",
    title: "New application",
    body: "A job you recruit for has a new application. Tap to view.",
    defaultOn: true,
  },
  candidate_assigned: {
    label: "Candidate assigned to me",
    title: "Candidate assigned",
    body: "A candidate was assigned to you. Tap to view.",
    defaultOn: true,
  },
  assessment_completed: {
    label: "Assessment submitted",
    title: "Assessment submitted",
    body: "A candidate submitted an assessment. Tap to view.",
    defaultOn: true,
  },
  assessment_graded: {
    label: "Assessment graded",
    title: "Assessment graded",
    body: "An assessment result is ready. Tap to view.",
    defaultOn: true,
  },
  chitra_warning: {
    label: "Escalations",
    title: "Action needed",
    body: "Something needs your attention. Tap to view.",
    defaultOn: true,
  },
  chitra_nudge: {
    label: "Nudges and reminders",
    title: "Reminder",
    body: "You have a new reminder. Tap to view.",
    defaultOn: false,
  },
  chitra_praise: {
    label: "Recognition",
    title: "Nice work",
    body: "You have new recognition. Tap to view.",
    defaultOn: false,
  },
} as const satisfies Record<string, PushTypeInfo>;

export type PushNotificationType = keyof typeof PUSH_NOTIFICATION_TYPES;

/** Types that are not in the catalog never push unless the user opts in to them. */
const UNKNOWN_TYPE: PushTypeInfo = {
  label: "Other notifications",
  title: "New notification",
  body: "Open the app to view it.",
  defaultOn: false,
};

export function pushTypeInfo(type: string): PushTypeInfo {
  return (PUSH_NOTIFICATION_TYPES as Record<string, PushTypeInfo>)[type] ?? UNKNOWN_TYPE;
}

export interface NotificationPrefs {
  push_enabled: boolean;
  /** Per-type overrides; a missing type uses the catalog default. */
  types: Record<string, boolean>;
  /** "HH:MM" in the user's timezone, or null for no quiet hours. */
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export function isPushTypeEnabled(type: string, prefs: NotificationPrefs | null | undefined): boolean {
  const override = prefs?.types?.[type];
  return typeof override === "boolean" ? override : pushTypeInfo(type).defaultOn;
}

export function isPushAllowed(type: string, prefs: NotificationPrefs | null | undefined): boolean {
  if (prefs && prefs.push_enabled === false) return false;
  return isPushTypeEnabled(type, prefs);
}

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Whether `now` falls inside the quiet window in `timeZone`. The window may
 * wrap past midnight (22:00–07:00). Equal or missing bounds mean no window.
 */
export function isWithinQuietHours(
  now: Date,
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone: string,
): boolean {
  if (!start || !end) return false;
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s === null || e === null || s === e) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  return s < e ? current >= s && current < e : current >= s || current < e;
}

/** Only same-origin app paths; anything else opens the dashboard. */
export function safePushLink(link: string | null | undefined): string {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return "/";
  return link;
}

export interface PushPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  /** Collapses repeat notifications about the same thing on the device. */
  tag: string;
  /** Unread count for the app icon badge. */
  badge: number;
}

export function buildPushPayload(
  notification: { id: string; type: string; link: string | null },
  unreadCount: number,
): PushPayload {
  const info = pushTypeInfo(notification.type);
  const link = safePushLink(notification.link);
  return {
    id: notification.id,
    type: notification.type,
    title: info.title,
    body: info.body,
    link,
    tag: `${notification.type}:${link}`,
    badge: Math.max(0, Math.floor(unreadCount)),
  };
}

/** Delivery settings: reminders are useless after the interview starts. */
export function pushDeliveryOptions(type: string): { ttlSeconds: number; urgency: PushUrgency } {
  if (type === "interview_reminder") return { ttlSeconds: 15 * 60, urgency: "high" };
  if (type.startsWith("interview_")) return { ttlSeconds: 24 * 60 * 60, urgency: "high" };
  return { ttlSeconds: 24 * 60 * 60, urgency: "normal" };
}
