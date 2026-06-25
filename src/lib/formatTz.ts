// Timezone-aware date formatting using the native Intl API (no extra dependencies).

export const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
