// Timezone-aware date formatting using the native Intl API (no extra dependencies).

export function detectBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export const BROWSER_TIMEZONE = detectBrowserTimezone();

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata',       label: 'IST — India Standard Time (UTC+5:30)' },
  { value: 'UTC',                label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York',   label: 'ET — Eastern Time, US (UTC−5/4)' },
  { value: 'America/Chicago',    label: 'CT — Central Time, US (UTC−6/5)' },
  { value: 'America/Denver',     label: 'MT — Mountain Time, US (UTC−7/6)' },
  { value: 'America/Los_Angeles',label: 'PT — Pacific Time, US (UTC−8/7)' },
  { value: 'Europe/London',      label: 'GMT/BST — London (UTC+0/1)' },
  { value: 'Europe/Paris',       label: 'CET — Central Europe (UTC+1/2)' },
  { value: 'Asia/Dubai',         label: 'GST — Gulf Standard Time, UAE (UTC+4)' },
  { value: 'Asia/Singapore',     label: 'SGT — Singapore (UTC+8)' },
  { value: 'Asia/Tokyo',         label: 'JST — Japan Standard Time (UTC+9)' },
  { value: 'Asia/Shanghai',      label: 'CST — China Standard Time (UTC+8)' },
  { value: 'Australia/Sydney',   label: 'AEST — Sydney, Australia (UTC+10/11)' },
];

/** Legacy / alternate IANA names → preferred values in TIMEZONE_OPTIONS. */
const TIMEZONE_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
};

/** Prefer a listed option when the browser returns a known alias (e.g. Asia/Calcutta). */
export function resolveTimezoneOptionValue(tz: string): string {
  const aliased = TIMEZONE_ALIASES[tz] ?? tz;
  if (TIMEZONE_OPTIONS.some((o) => o.value === aliased)) return aliased;
  return tz;
}

/**
 * Radix Select only displays a value when a matching SelectItem exists.
 * Merge any selected / detected IANA zones that are missing from the curated list.
 */
export function buildTimezoneOptions(
  ...extra: Array<string | null | undefined>
): { value: string; label: string }[] {
  const options = [...TIMEZONE_OPTIONS];
  const seen = new Set(options.map((o) => o.value));
  for (const raw of extra) {
    if (!raw) continue;
    const value = resolveTimezoneOptionValue(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    options.unshift({ value, label: value.replace(/_/g, ' ') });
  }
  return options;
}

// "25 May, 4:00 PM" in the given timezone
export function formatDateTimeInTz(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const datePart = d.toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' });
  const timePart = d.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

// "Thursday, 12 Jun 2026" in the given timezone
export function formatCalendarDayHeader(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Absolute weekday + date without year, e.g. "Monday, 13 Jul" */
export function formatCalendarDayHeaderShort(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export type RelativeDayLabel = 'Today' | 'Tomorrow' | 'Yesterday';

/**
 * Calendar-day proximity label in `tz` (SparxIT default: Asia/Kolkata).
 * Returns null for days farther than ±1 local day.
 */
export function getRelativeDayLabel(
  date: Date | string,
  tz: string,
  now: Date = new Date(),
): RelativeDayLabel | null {
  const targetKey = calendarDayKey(date, tz);
  const todayKey = calendarDayKey(now, tz);
  if (!targetKey || !todayKey) return null;
  if (targetKey === todayKey) return 'Today';

  // Day keys are yyyy-MM-dd; compare as UTC noon to avoid DST edge cases.
  const dayMs = 24 * 60 * 60 * 1000;
  const todayUtc = Date.parse(`${todayKey}T12:00:00Z`);
  const targetUtc = Date.parse(`${targetKey}T12:00:00Z`);
  if (Number.isNaN(todayUtc) || Number.isNaN(targetUtc)) return null;

  const diffDays = Math.round((targetUtc - todayUtc) / dayMs);
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return null;
}

export type CalendarDayHeaderParts = {
  relative: RelativeDayLabel | null;
  /** With relative: "Monday, 13 Jul". Farther: "Wednesday, 15 Jul 2026". */
  absolute: string;
};

/** Split header for relative + absolute styling on My Interviews day groups. */
export function formatCalendarDayHeaderParts(
  date: Date | string,
  tz: string,
  now: Date = new Date(),
): CalendarDayHeaderParts {
  const relative = getRelativeDayLabel(date, tz, now);
  if (relative) {
    return { relative, absolute: formatCalendarDayHeaderShort(date, tz) };
  }
  return { relative: null, absolute: formatCalendarDayHeader(date, tz) };
}

// "yyyy-MM-dd" in the given timezone (for calendar day grouping)
export function calendarDayKey(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

// "4:00 PM" in the given timezone
export function formatTimeInTz(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
}
