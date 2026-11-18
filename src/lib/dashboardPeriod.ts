/** Used when the deployment has no valid default_timezone (same fallback as public._app_timezone()). */
export const FALLBACK_TIMEZONE = 'UTC';

export interface ReportDateRange {
  /** yyyy-MM-dd, first day of the window in the app timezone. */
  start: string;
  /** yyyy-MM-dd, today in the app timezone (the RPCs include the whole day). */
  end: string;
}

function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Calendar date (yyyy-MM-dd) of `now` in `timeZone`. */
export function zonedDateKey(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: validTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Reports date range, computed in the app timezone so it matches the dashboard
 * (get_dashboard_metrics): 'week' = Monday of this week → today, 'N' = the last
 * N days including today ('30' = dashboard "month").
 */
export function reportDateRange(range: string, now: Date, timeZone: string): ReportDateRange {
  const end = zonedDateKey(now, timeZone);
  if (range === 'week') {
    return { start: addDays(end, -daysSinceMonday(end)), end };
  }
  const days = Math.max(1, parseInt(range, 10) || 1);
  return { start: addDays(end, -(days - 1)), end };
}

function daysSinceMonday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * p_period_days for get_time_velocity_metrics (whole app-tz days including
 * today): 'week' = Monday → today (1 on Monday, 7 on Sunday), 'N' = N.
 */
export function velocityPeriodDays(range: string, now: Date, timeZone: string): number {
  if (range === 'week') return daysSinceMonday(zonedDateKey(now, timeZone)) + 1;
  return Math.max(1, parseInt(range, 10) || 1);
}

/** Short zone label, e.g. "IST" for Asia/Kolkata, "UTC" for UTC. */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  const tz = validTimeZone(timeZone);
  const name = new Intl.DateTimeFormat('en-IN', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value;
  return name ?? tz;
}

/**
 * "Since Mon 19 Oct (IST)" for the window start and timezone returned by
 * get_dashboard_metrics. Null when the RPC did not send a usable periodStart.
 */
export function formatPeriodStartHint(
  periodStart: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!periodStart) return null;
  const d = new Date(periodStart);
  if (isNaN(d.getTime())) return null;
  const tz = validTimeZone(timeZone);
  // en-US parts: en-GB renders September as "Sept" on newer ICU.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `Since ${part('weekday')} ${part('day')} ${part('month')} (${timeZoneLabel(tz, d)})`;
}
