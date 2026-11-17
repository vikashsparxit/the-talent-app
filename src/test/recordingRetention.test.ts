import { describe, it, expect, vi } from 'vitest';
import {
  CLEANUP_DEFAULT_LIMIT,
  CLEANUP_MAX_LIMIT,
  isRecordingExpired,
  parseCleanupRequest,
  parseRecordingRetentionSetting,
  retentionUntil,
  runRecordingCleanup,
  type CleanupCandidate,
  type CleanupDeps,
} from '../../supabase/functions/_shared/recordingRetention.ts';

const NOW = new Date('2026-11-14T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const live = { status: 'completed', deleted_at: null };
const notHired = { hiredAt: null };

describe('isRecordingExpired', () => {
  it('expires 90 days after completion', () => {
    expect(isRecordingExpired(live, { completed_at: daysAgo(91), started_at: daysAgo(91) }, notHired, NOW)).toEqual({
      expired: true,
      reason: 'expired',
    });
    expect(isRecordingExpired(live, { completed_at: daysAgo(90), started_at: daysAgo(90) }, notHired, NOW).expired).toBe(true);
  });

  it('is kept within 90 days', () => {
    expect(isRecordingExpired(live, { completed_at: daysAgo(89), started_at: daysAgo(120) }, notHired, NOW)).toEqual({
      expired: false,
      reason: 'not_expired',
    });
  });

  it('counts from the start when the attempt was never completed', () => {
    const recording = { status: 'recording', deleted_at: null };
    expect(isRecordingExpired(recording, { completed_at: null, started_at: daysAgo(100) }, notHired, NOW).expired).toBe(true);
    expect(isRecordingExpired(recording, { completed_at: null, started_at: daysAgo(10) }, notHired, NOW).expired).toBe(false);
    expect(isRecordingExpired(recording, { completed_at: null, started_at: null }, notHired, NOW)).toEqual({
      expired: false,
      reason: 'no_attempt_date',
    });
  });

  it('keeps recordings of hired candidates', () => {
    expect(
      isRecordingExpired(live, { completed_at: daysAgo(400), started_at: daysAgo(400) }, { hiredAt: daysAgo(300) }, NOW),
    ).toEqual({ expired: false, reason: 'hired' });
  });

  it('skips recordings already deleted', () => {
    const attempt = { completed_at: daysAgo(400), started_at: daysAgo(400) };
    expect(isRecordingExpired({ status: 'deleted', deleted_at: daysAgo(300) }, attempt, notHired, NOW).reason).toBe(
      'already_deleted',
    );
    expect(isRecordingExpired({ status: 'completed', deleted_at: daysAgo(1) }, attempt, notHired, NOW).reason).toBe(
      'already_deleted',
    );
  });

  it('gives the keep-until date for display', () => {
    expect(retentionUntil({ completed_at: '2026-01-01T00:00:00Z', started_at: null })?.toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
    expect(retentionUntil({ completed_at: null, started_at: null })).toBeNull();
  });
});

describe('parseCleanupRequest', () => {
  it('is a dry run unless dry_run is exactly false', () => {
    expect(parseCleanupRequest(null)).toEqual({ dryRun: true, limit: CLEANUP_DEFAULT_LIMIT });
    expect(parseCleanupRequest({ dry_run: 'false' }).dryRun).toBe(true);
    expect(parseCleanupRequest({ dry_run: 0 }).dryRun).toBe(true);
    expect(parseCleanupRequest({ dry_run: false }).dryRun).toBe(false);
  });

  it('bounds the limit', () => {
    expect(parseCleanupRequest({ limit: 5 }).limit).toBe(5);
    expect(parseCleanupRequest({ limit: 10_000 }).limit).toBe(CLEANUP_MAX_LIMIT);
    expect(parseCleanupRequest({ limit: -1 }).limit).toBe(CLEANUP_DEFAULT_LIMIT);
    expect(parseCleanupRequest({ limit: 2.5 }).limit).toBe(CLEANUP_DEFAULT_LIMIT);
  });
});

// ── Cleanup run ─────────────────────────────────────────────────────────────

function rec(id: string, overrides: Partial<CleanupCandidate> = {}): CleanupCandidate {
  return {
    id,
    created_at: daysAgo(200),
    candidate_assessment_id: `ca-${id}`,
    kind: 'webcam',
    status: 'completed',
    deleted_at: null,
    bytes: 0,
    attempt: { completed_at: daysAgo(200), started_at: daysAgo(200) },
    hiredAt: null,
    ...overrides,
  };
}

function fakeDeps(rows: CleanupCandidate[], failKey?: string) {
  const deps = {
    listRecordings: vi.fn(async ({ after, size }: Parameters<CleanupDeps['listRecordings']>[0]) => {
      const start = after ? rows.findIndex((r) => r.id === after.id) + 1 : 0;
      return rows.slice(start, start + size);
    }),
    listObjectKeys: vi.fn(async (id: string) => [
      { key: `recordings/${id}/0.webm`, bytes: 100 },
      { key: `recordings/${id}/1.webm`, bytes: 50 },
    ]),
    deleteObject: vi.fn(async (key: string) => {
      if (key === failKey) throw new Error('Storage delete failed (500)');
    }),
    markDeleted: vi.fn(async (_id: string, _at: Date) => undefined),
  };
  return deps;
}

describe('runRecordingCleanup', () => {
  const rows = [
    rec('old'),
    rec('hired', { hiredAt: daysAgo(150) }),
    rec('recent', { attempt: { completed_at: daysAgo(30), started_at: daysAgo(200) } }),
    rec('abandoned', { status: 'recording', attempt: { completed_at: null, started_at: daysAgo(150) } }),
  ];

  it('makes no deletes in a dry run, but reports what it would delete', async () => {
    const deps = fakeDeps(rows);
    const report = await runRecordingCleanup(deps, { dryRun: true, limit: 100 }, true, NOW);
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.markDeleted).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dry_run: true,
      retention_enabled: true,
      retention_days: 90,
      scanned: 4,
      deleted: 2,
      deleted_ids: ['old', 'abandoned'],
      objects: 4,
      bytes: 300,
      skipped_hired: 1,
      skipped_hired_ids: ['hired'],
      not_expired: 1,
      failed: [],
    });
    // Only rows older than the retention period are listed.
    expect(deps.listRecordings.mock.calls[0][0].before.toISOString()).toBe(daysAgo(90));
  });

  it('deletes the objects, then marks the row deleted', async () => {
    const deps = fakeDeps(rows);
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 100 }, true, NOW);
    expect(deps.deleteObject.mock.calls.map(([k]) => k)).toEqual([
      'recordings/old/0.webm',
      'recordings/old/1.webm',
      'recordings/abandoned/0.webm',
      'recordings/abandoned/1.webm',
    ]);
    expect(deps.markDeleted.mock.calls.map(([id]) => id)).toEqual(['old', 'abandoned']);
    expect(report.deleted_ids).toEqual(['old', 'abandoned']);
  });

  it('does not mark a recording deleted when a file could not be removed', async () => {
    const deps = fakeDeps(rows, 'recordings/old/1.webm');
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 100 }, true, NOW);
    expect(deps.markDeleted.mock.calls.map(([id]) => id)).toEqual(['abandoned']);
    expect(report.failed).toEqual([{ id: 'old', error: 'Storage delete failed (500)' }]);
    expect(report.deleted_ids).toEqual(['abandoned']);
  });

  it('stops at the limit', async () => {
    const deps = fakeDeps([rec('a'), rec('b'), rec('c')]);
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 2 }, true, NOW);
    expect(report.deleted_ids).toEqual(['a', 'b']);
    expect(deps.markDeleted).toHaveBeenCalledTimes(2);
  });

  it('pages through more rows than fit in one page', async () => {
    const many = Array.from({ length: 450 }, (_, i) => rec(`r${i}`, { hiredAt: i < 440 ? daysAgo(1) : null }));
    const deps = fakeDeps(many);
    const report = await runRecordingCleanup(deps, { dryRun: true, limit: 100 }, true, NOW);
    expect(report.scanned).toBe(450);
    expect(report.skipped_hired).toBe(440);
    expect(report.deleted).toBe(10);
    expect(deps.listRecordings).toHaveBeenCalledTimes(3);
    expect(deps.listRecordings.mock.calls[1][0].after).toEqual({ created_at: many[199].created_at, id: 'r199' });
  });

  it('deletes the backlog that expired before retention was turned on', async () => {
    const backlog = [rec('year-old', { attempt: { completed_at: daysAgo(400), started_at: daysAgo(400) } }), ...rows];
    const deps = fakeDeps(backlog);
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 100 }, true, NOW);
    expect(report.deleted_ids).toEqual(['year-old', 'old', 'abandoned']);
    expect(report.skipped_hired_ids).toEqual(['hired']);
    expect(report.would_delete).toBe(0);
  });

  it('skips rows already marked deleted', async () => {
    const deps = fakeDeps([rec('gone', { status: 'deleted', deleted_at: daysAgo(5) }), rec('old')]);
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 100 }, true, NOW);
    expect(report.deleted_ids).toEqual(['old']);
    expect(report.not_expired).toBe(0);
    expect(deps.listObjectKeys).not.toHaveBeenCalledWith('gone');
  });
});

describe('runRecordingCleanup with retention off', () => {
  const rows = [rec('old'), rec('hired', { hiredAt: daysAgo(150) })];

  it('deletes nothing and does not scan on a real run', async () => {
    const deps = fakeDeps(rows);
    const report = await runRecordingCleanup(deps, { dryRun: false, limit: 100 }, false, NOW);
    expect(deps.listRecordings).not.toHaveBeenCalled();
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.markDeleted).not.toHaveBeenCalled();
    expect(report).toMatchObject({ dry_run: false, retention_enabled: false, scanned: 0, deleted: 0, deleted_ids: [] });
  });

  it('previews what would be deleted on a dry run', async () => {
    const deps = fakeDeps(rows);
    const report = await runRecordingCleanup(deps, { dryRun: true, limit: 100 }, false, NOW);
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(deps.markDeleted).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dry_run: true,
      retention_enabled: false,
      scanned: 2,
      deleted: 0,
      deleted_ids: [],
      would_delete: 1,
      would_delete_ids: ['old'],
      objects: 2,
      skipped_hired_ids: ['hired'],
    });
  });
});

describe('parseRecordingRetentionSetting', () => {
  it('reads missing or malformed values as off', () => {
    const off = { enabled: false, enabled_at: null, enabled_by: null, updated_at: null };
    expect(parseRecordingRetentionSetting(null)).toEqual(off);
    expect(parseRecordingRetentionSetting([])).toEqual(off);
    expect(parseRecordingRetentionSetting({ enabled: 'true' })).toEqual(off);
  });

  it('reads an enabled setting', () => {
    expect(
      parseRecordingRetentionSetting({
        enabled: true,
        enabled_at: '2026-11-17T10:00:00Z',
        enabled_by: 'user-1',
        updated_at: '2026-11-17T10:00:00Z',
      }),
    ).toEqual({ enabled: true, enabled_at: '2026-11-17T10:00:00Z', enabled_by: 'user-1', updated_at: '2026-11-17T10:00:00Z' });
  });
});
