import { describe, it, expect } from 'vitest';
import {
  computeIntegrityStats,
  getIntegrityEventLabel,
  normalizeIntegrityEventType,
  normalizeIntegrityLog,
} from '@/lib/integrity';

describe('normalizeIntegrityEventType', () => {
  it('keeps every known event type as-is', () => {
    for (const type of [
      'tab_switch',
      'focus_lost',
      'fullscreen_exit',
      'paste_attempt',
      'auto_submit_time_limit',
      'auto_complete_browser_close',
    ]) {
      expect(normalizeIntegrityEventType(type)).toBe(type);
    }
  });

  it('maps the legacy focus_loss alias and falls back for unknown types', () => {
    expect(normalizeIntegrityEventType('focus_loss')).toBe('focus_lost');
    expect(normalizeIntegrityEventType('something_new')).toBe('tab_switch');
    expect(normalizeIntegrityEventType(undefined)).toBe('tab_switch');
  });
});

describe('normalizeIntegrityLog', () => {
  it('preserves paste_attempt fields and drops wrongly typed ones', () => {
    const [paste, bad] = normalizeIntegrityLog([
      {
        type: 'paste_attempt',
        timestamp: '2026-11-14T10:00:00.000Z',
        question_id: 'q1',
        question_index: 2,
        section_title: 'Coding',
        chars: 120,
        input_kind: 'coding',
      },
      { type: 'paste_attempt', timestamp: '2026-11-14T10:00:05.000Z', chars: '120', input_kind: 7 },
    ]);
    expect(paste).toEqual({
      type: 'paste_attempt',
      timestamp: '2026-11-14T10:00:00.000Z',
      duration_seconds: undefined,
      question_id: 'q1',
      question_index: 2,
      section_title: 'Coding',
      chars: 120,
      input_kind: 'coding',
    });
    expect(bad.chars).toBeUndefined();
    expect(bad.input_kind).toBeUndefined();
  });

  it('keeps server-written auto-close events distinct from tab switches', () => {
    const log = normalizeIntegrityLog([
      { type: 'auto_submit_time_limit', timestamp: '2026-11-14T10:00:00.000Z' },
      { type: 'auto_complete_browser_close', timestamp: '2026-11-14T10:00:00.000Z' },
    ]);
    expect(log.map((e) => e.type)).toEqual(['auto_submit_time_limit', 'auto_complete_browser_close']);
  });
});

describe('computeIntegrityStats', () => {
  it('counts tab switches and paste attempts separately', () => {
    const stats = computeIntegrityStats([
      { type: 'tab_switch' },
      { type: 'focus_lost', duration_seconds: 30 },
      { type: 'tab_switch' },
      { type: 'focus_loss', duration_seconds: 15 },
      { type: 'paste_attempt', chars: 40 },
      { type: 'paste_attempt' },
      { type: 'paste_attempt' },
      { type: 'auto_submit_time_limit' },
      { type: 'auto_complete_browser_close' },
    ]);
    expect(stats).toEqual({
      tabSwitchCount: 2,
      pasteAttempts: 3,
      totalSecondsAway: 45,
      eventCount: 9,
    });
  });

  it('still counts unknown legacy types as tab switches', () => {
    expect(computeIntegrityStats([{ type: 'visibility_hidden' }]).tabSwitchCount).toBe(1);
  });

  it('adds the live away session to time away', () => {
    expect(computeIntegrityStats([], 12).totalSecondsAway).toBe(12);
  });
});

describe('getIntegrityEventLabel', () => {
  it('labels paste and server events', () => {
    expect(getIntegrityEventLabel('paste_attempt')).toBe('Paste attempt blocked');
    expect(getIntegrityEventLabel('auto_submit_time_limit')).toBe('Auto-submitted (time limit)');
    expect(getIntegrityEventLabel('auto_complete_browser_close')).toBe('Auto-completed (browser closed)');
    expect(getIntegrityEventLabel('tab_switch')).toBe('Tab switch');
  });
});
