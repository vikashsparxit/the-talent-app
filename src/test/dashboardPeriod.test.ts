import { describe, it, expect } from 'vitest';
import {
  FALLBACK_TIMEZONE,
  formatPeriodStartHint,
  reportDateRange,
  timeZoneLabel,
  velocityPeriodDays,
  zonedDateKey,
} from '@/lib/dashboardPeriod';

const IST = 'Asia/Kolkata';

describe('formatPeriodStartHint', () => {
  it('formats the IST Monday week start as returned by Postgres in UTC', () => {
    expect(formatPeriodStartHint('2026-10-18T18:30:00+00:00', IST)).toBe('Since Mon 19 Oct (IST)');
  });

  it('formats the same instant when returned with an IST offset', () => {
    expect(formatPeriodStartHint('2026-10-19T00:00:00+05:30', IST)).toBe('Since Mon 19 Oct (IST)');
  });

  it('uses the given zone calendar day, not UTC, around midnight', () => {
    // 23:59 IST on Sunday is still Sunday in IST although it is 18:29 UTC.
    expect(formatPeriodStartHint('2026-10-18T18:29:00Z', IST)).toBe('Since Sun 18 Oct (IST)');
  });

  it('formats a 30-day month window start', () => {
    // 00:00 IST 24 Sep = 29 IST days before 23 Oct.
    expect(formatPeriodStartHint('2026-09-23T18:30:00Z', IST)).toBe('Since Thu 24 Sep (IST)');
  });

  it('labels with the timezone returned by the RPC', () => {
    expect(formatPeriodStartHint('2026-10-19T00:00:00Z', 'UTC')).toBe('Since Mon 19 Oct (UTC)');
  });

  it('falls back to UTC for a missing or invalid timezone', () => {
    expect(formatPeriodStartHint('2026-10-19T00:00:00Z', null)).toBe('Since Mon 19 Oct (UTC)');
    expect(formatPeriodStartHint('2026-10-19T00:00:00Z', 'Not/AZone')).toBe('Since Mon 19 Oct (UTC)');
  });

  it('returns null for a missing or invalid periodStart', () => {
    expect(formatPeriodStartHint(undefined, IST)).toBeNull();
    expect(formatPeriodStartHint(null, IST)).toBeNull();
    expect(formatPeriodStartHint('not a date', IST)).toBeNull();
  });
});

describe('timeZoneLabel', () => {
  it('uses the short zone name', () => {
    expect(timeZoneLabel(IST)).toBe('IST');
    expect(timeZoneLabel('UTC')).toBe('UTC');
  });
});

describe('zonedDateKey', () => {
  it('returns the calendar date in the zone', () => {
    // 20:00 UTC Thu 22 Oct = 01:30 IST Fri 23 Oct.
    const now = new Date('2026-10-22T20:00:00Z');
    expect(zonedDateKey(now, IST)).toBe('2026-10-23');
    expect(zonedDateKey(now, 'UTC')).toBe('2026-10-22');
  });

  it('falls back to UTC for an invalid zone', () => {
    expect(zonedDateKey(new Date('2026-10-22T20:00:00Z'), 'Not/AZone')).toBe('2026-10-22');
    expect(FALLBACK_TIMEZONE).toBe('UTC');
  });
});

describe('reportDateRange', () => {
  // Fri 23 Oct 2026, 10:00 IST.
  const now = new Date('2026-10-23T04:30:00Z');

  it("'week' starts on Monday of the current week in the zone (matches dashboard week)", () => {
    expect(reportDateRange('week', now, IST)).toEqual({ start: '2026-10-19', end: '2026-10-23' });
  });

  it("'week' on a Monday is just that day; on a Sunday reaches back to Monday", () => {
    expect(reportDateRange('week', new Date('2026-10-19T00:00:00+05:30'), IST))
      .toEqual({ start: '2026-10-19', end: '2026-10-19' });
    expect(reportDateRange('week', new Date('2026-10-25T23:59:00+05:30'), IST))
      .toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });

  it("'30' is 30 days including today (matches dashboard month)", () => {
    expect(reportDateRange('30', now, IST)).toEqual({ start: '2026-09-24', end: '2026-10-23' });
  });

  it("'7' is 7 days including today", () => {
    expect(reportDateRange('7', now, IST)).toEqual({ start: '2026-10-17', end: '2026-10-23' });
  });

  it('uses the app timezone day, not UTC, just after IST midnight', () => {
    // 00:30 IST Mon 19 Oct is still Sun 18 Oct in UTC.
    const justAfterMidnight = new Date('2026-10-18T19:00:00Z');
    expect(reportDateRange('week', justAfterMidnight, IST)).toEqual({ start: '2026-10-19', end: '2026-10-19' });
    expect(reportDateRange('week', justAfterMidnight, 'UTC')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });

  it('crosses month and year boundaries', () => {
    expect(reportDateRange('14', new Date('2027-01-03T12:00:00Z'), 'UTC'))
      .toEqual({ start: '2026-12-21', end: '2027-01-03' });
  });
});

describe('velocityPeriodDays', () => {
  it("'week' is days since Monday + 1 in the zone (Fri = 5)", () => {
    expect(velocityPeriodDays('week', new Date('2026-10-23T04:30:00Z'), IST)).toBe(5);
  });

  it("'week' is 1 on Monday and 7 on Sunday", () => {
    expect(velocityPeriodDays('week', new Date('2026-10-19T00:00:00+05:30'), IST)).toBe(1);
    expect(velocityPeriodDays('week', new Date('2026-10-25T23:59:00+05:30'), IST)).toBe(7);
  });

  it("'week' uses the app timezone day around midnight", () => {
    // 00:30 IST Mon 19 Oct is still Sun 18 Oct in UTC.
    const justAfterMidnight = new Date('2026-10-18T19:00:00Z');
    expect(velocityPeriodDays('week', justAfterMidnight, IST)).toBe(1);
    expect(velocityPeriodDays('week', justAfterMidnight, 'UTC')).toBe(7);
  });

  it("'week' covers the same days as reportDateRange('week')", () => {
    const now = new Date('2026-10-22T10:00:00Z');
    const { start, end } = reportDateRange('week', now, IST);
    const span = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    expect(velocityPeriodDays('week', now, IST)).toBe(span);
  });

  it('passes numeric ranges through', () => {
    expect(velocityPeriodDays('30', new Date(), IST)).toBe(30);
    expect(velocityPeriodDays('90', new Date(), IST)).toBe(90);
  });
});
