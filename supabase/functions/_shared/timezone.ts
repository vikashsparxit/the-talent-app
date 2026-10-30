/**
 * Timezone helpers for times shown in emails and calendar invites.
 * Pure TS (no Deno APIs at import time) so Vitest can import it.
 *
 * Resolution order for a recipient: their profiles.timezone, then the
 * deployment default (DEFAULT_TIMEZONE env var, then the `default_timezone`
 * row in system_config), then UTC.
 */

export const FALLBACK_TIMEZONE = "UTC";
export const DEFAULT_TIMEZONE_CONFIG_KEY = "default_timezone";

/** True when `tz` is an IANA zone name the runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** First valid zone among the candidates, or UTC. */
export function resolveTimeZone(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (isValidTimeZone(candidate)) return candidate.trim();
  }
  return FALLBACK_TIMEZONE;
}

/** Accepts the system_config value either as a JSON string or as { "timezone": "..." }. */
export function parseTimeZoneConfig(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { timezone?: unknown }).timezone === "string") {
    return (value as { timezone: string }).timezone;
  }
  return null;
}

/**
 * Just enough of a Supabase client to read one system_config row. Kept loose on
 * purpose: matching the full SupabaseClient generics here trips TS2589, and this
 * file must stay importable from Vitest without the esm.sh client.
 */
interface ConfigReader {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
  try {
    return deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

/** Deployment-wide default zone: DEFAULT_TIMEZONE env, then system_config, then UTC. */
export async function getDefaultTimeZone(supabase: ConfigReader): Promise<string> {
  const fromEnv = readEnv("DEFAULT_TIMEZONE");
  if (isValidTimeZone(fromEnv)) return fromEnv.trim();
  try {
    const { data } = (await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", DEFAULT_TIMEZONE_CONFIG_KEY)
      .maybeSingle()) as { data: { config_value?: unknown } | null };
    return resolveTimeZone(parseTimeZoneConfig(data?.config_value));
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** "Tue, 15 Sept, 10:00 am IST" style, in the given zone, with its short zone name. */
export function formatDateTimeInZone(
  date: Date | string,
  timeZone: string,
  options: { year?: boolean } = {},
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleString("en-IN", {
    timeZone: resolveTimeZone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(options.year ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Minutes east of UTC for `timeZone` at the given instant. */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / 60000);
}

/** Start/end (ISO, UTC) of the calendar day containing `now` in `timeZone`. */
export function zonedDayBounds(now: Date, timeZone: string): {
  start: string;
  end: string;
  dateKey: string;
} {
  const tz = resolveTimeZone(timeZone);
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = dateKey.split("-").map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  const nextMidnightUtc = Date.UTC(y, m - 1, d + 1);
  const start = midnightUtc - timeZoneOffsetMinutes(new Date(midnightUtc), tz) * 60000;
  const nextStart = nextMidnightUtc - timeZoneOffsetMinutes(new Date(nextMidnightUtc), tz) * 60000;
  return {
    start: new Date(start).toISOString(),
    end: new Date(nextStart - 1).toISOString(),
    dateKey,
  };
}
