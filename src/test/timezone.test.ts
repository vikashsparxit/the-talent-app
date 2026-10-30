import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  FALLBACK_TIMEZONE,
  formatDateTimeInZone,
  getDefaultTimeZone,
  isValidTimeZone,
  parseTimeZoneConfig,
  resolveTimeZone,
  timeZoneOffsetMinutes,
  zonedDayBounds,
} from '../../supabase/functions/_shared/timezone.ts';

function configClient(configValue: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: configValue === undefined ? null : { config_value: configValue } }),
        }),
      }),
    }),
  };
}

describe('timezone helpers', () => {
  const at = new Date('2026-09-15T04:30:00.000Z');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates IANA zone names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('resolves the first valid candidate and falls back to UTC', () => {
    expect(resolveTimeZone(null, 'Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveTimeZone('Not/AZone', ' America/New_York ')).toBe('America/New_York');
    expect(resolveTimeZone(undefined, '')).toBe(FALLBACK_TIMEZONE);
  });

  it('reads the config value as a string or { timezone }', () => {
    expect(parseTimeZoneConfig('Asia/Dubai')).toBe('Asia/Dubai');
    expect(parseTimeZoneConfig({ timezone: 'Asia/Dubai' })).toBe('Asia/Dubai');
    expect(parseTimeZoneConfig(42)).toBeNull();
  });

  it('formats in the recipient zone with its short name', () => {
    expect(formatDateTimeInZone(at, 'Asia/Kolkata')).toMatch(/10:00\s?am IST$/i);
    expect(formatDateTimeInZone(at, 'UTC')).toMatch(/04:30\s?am UTC$/i);
    expect(formatDateTimeInZone(at.toISOString(), 'America/New_York')).toMatch(/12:30\s?am GMT-4$/i);
    expect(formatDateTimeInZone(at, 'Not/AZone')).toMatch(/UTC$/);
  });

  it('computes offsets across DST', () => {
    expect(timeZoneOffsetMinutes(at, 'Asia/Kolkata')).toBe(330);
    expect(timeZoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T12:00:00Z'), 'America/New_York')).toBe(-300);
  });

  it('returns the calendar-day window in a zone', () => {
    expect(zonedDayBounds(at, 'Asia/Kolkata')).toEqual({
      start: '2026-09-14T18:30:00.000Z',
      end: '2026-09-15T18:29:59.999Z',
      dateKey: '2026-09-15',
    });
    expect(zonedDayBounds(at, 'UTC')).toEqual({
      start: '2026-09-15T00:00:00.000Z',
      end: '2026-09-15T23:59:59.999Z',
      dateKey: '2026-09-15',
    });
    // 03:30 UTC is still the evening of the 14th in New York (EDT, UTC-4).
    expect(zonedDayBounds(new Date('2026-09-15T03:30:00Z'), 'America/New_York')).toEqual({
      start: '2026-09-14T04:00:00.000Z',
      end: '2026-09-15T03:59:59.999Z',
      dateKey: '2026-09-14',
    });
  });

  it('prefers DEFAULT_TIMEZONE, then system_config, then UTC', async () => {
    expect(await getDefaultTimeZone(configClient(undefined))).toBe('UTC');
    expect(await getDefaultTimeZone(configClient('Asia/Kolkata'))).toBe('Asia/Kolkata');
    expect(await getDefaultTimeZone(configClient({ timezone: 'Not/AZone' }))).toBe('UTC');
    vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'DEFAULT_TIMEZONE' ? 'Europe/Berlin' : undefined) } });
    expect(await getDefaultTimeZone(configClient('Asia/Kolkata'))).toBe('Europe/Berlin');
  });
});
