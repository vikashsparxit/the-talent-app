import { describe, it, expect } from 'vitest';
import {
  PUSH_NOTIFICATION_TYPES,
  buildPushPayload,
  isPushAllowed,
  isPushTypeEnabled,
  isWithinQuietHours,
  pushDeliveryOptions,
  safePushLink,
  type NotificationPrefs,
} from '../../supabase/functions/_shared/pushPayload.ts';

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  push_enabled: true,
  types: {},
  quiet_hours_start: null,
  quiet_hours_end: null,
  ...over,
});

describe('buildPushPayload', () => {
  it('uses generic text for the type, never the stored title or message', () => {
    const p = buildPushPayload({ id: 'n1', type: 'interview_scheduled', link: '/calendar' }, 3);
    expect(p).toEqual({
      id: 'n1',
      type: 'interview_scheduled',
      title: 'Interview scheduled',
      body: 'You have a new interview. Tap to view.',
      link: '/calendar',
      tag: 'interview_scheduled:/calendar',
      badge: 3,
    });
    expect(Object.keys(p)).not.toContain('message');
  });

  it('falls back to neutral text for unknown types', () => {
    const p = buildPushPayload({ id: 'n2', type: 'something_new', link: null }, 0);
    expect(p.title).toBe('New notification');
    expect(p.body).toBe('Open the app to view it.');
    expect(p.link).toBe('/');
  });

  it('never puts a name-like placeholder in any catalog text', () => {
    for (const info of Object.values(PUSH_NOTIFICATION_TYPES)) {
      expect(`${info.title} ${info.body}`).not.toMatch(/[{}$%]/);
    }
  });

  it('clamps the badge count', () => {
    expect(buildPushPayload({ id: 'n', type: 'x', link: '/' }, -2).badge).toBe(0);
    expect(buildPushPayload({ id: 'n', type: 'x', link: '/' }, 4.7).badge).toBe(4);
  });
});

describe('safePushLink', () => {
  it('keeps app paths and rejects other origins', () => {
    expect(safePushLink('/pipeline?job=1&candidate=2')).toBe('/pipeline?job=1&candidate=2');
    expect(safePushLink('https://evil.example.com')).toBe('/');
    expect(safePushLink('//evil.example.com')).toBe('/');
    expect(safePushLink('/\\evil.example.com')).toBe('/');
    expect(safePushLink('javascript:alert(1)')).toBe('/');
    expect(safePushLink(undefined)).toBe('/');
  });
});

describe('isPushAllowed', () => {
  it('uses catalog defaults when the user has no preferences', () => {
    expect(isPushAllowed('interview_reminder', null)).toBe(true);
    expect(isPushAllowed('chitra_nudge', null)).toBe(false);
    expect(isPushAllowed('unknown_type', null)).toBe(false);
  });

  it('applies per-type overrides', () => {
    const p = prefs({ types: { interview_reminder: false, chitra_nudge: true } });
    expect(isPushAllowed('interview_reminder', p)).toBe(false);
    expect(isPushAllowed('chitra_nudge', p)).toBe(true);
    expect(isPushTypeEnabled('new_application', p)).toBe(true);
  });

  it('turns everything off when push is disabled', () => {
    expect(isPushAllowed('interview_scheduled', prefs({ push_enabled: false }))).toBe(false);
  });
});

describe('isWithinQuietHours', () => {
  // 2026-10-18 17:00 UTC = 22:30 in Asia/Kolkata (UTC+5:30)
  const at = new Date('2026-10-18T17:00:00Z');

  it('handles windows that wrap past midnight in the user timezone', () => {
    expect(isWithinQuietHours(at, '22:00', '07:00', 'Asia/Kolkata')).toBe(true);
    expect(isWithinQuietHours(at, '22:00', '07:00', 'UTC')).toBe(false);
  });

  it('handles same-day windows', () => {
    expect(isWithinQuietHours(at, '12:00', '18:00', 'UTC')).toBe(true);
    expect(isWithinQuietHours(at, '12:00', '17:00', 'UTC')).toBe(false);
  });

  it('treats missing, equal or malformed bounds as no window', () => {
    expect(isWithinQuietHours(at, null, '07:00', 'UTC')).toBe(false);
    expect(isWithinQuietHours(at, '08:00', '08:00', 'UTC')).toBe(false);
    expect(isWithinQuietHours(at, '25:00', '07:00', 'UTC')).toBe(false);
  });
});

describe('pushDeliveryOptions', () => {
  it('expires reminders quickly and sends interview updates at high urgency', () => {
    expect(pushDeliveryOptions('interview_reminder')).toEqual({ ttlSeconds: 900, urgency: 'high' });
    expect(pushDeliveryOptions('interview_cancelled').urgency).toBe('high');
    expect(pushDeliveryOptions('new_application')).toEqual({ ttlSeconds: 86400, urgency: 'normal' });
  });
});
