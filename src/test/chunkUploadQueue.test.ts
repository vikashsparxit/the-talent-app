import { describe, it, expect, vi } from 'vitest';
import { ChunkUploadQueue, type QueuedChunk } from '@/lib/chunkUploadQueue';

const chunk = (seq: number): QueuedChunk => ({
  recordingId: 'rec-1',
  seq,
  blob: new Blob([new Uint8Array(4)]),
  capturedAt: 1_700_000_000_000 + seq * 10_000,
  durationMs: 10_000,
});

const ZERO_DELAYS = [0, 0, 0];

describe('ChunkUploadQueue', () => {
  it('uploads one at a time in seq order', async () => {
    const order: number[] = [];
    let active = 0;
    const queue = new ChunkUploadQueue({
      upload: async (c) => {
        active++;
        expect(active).toBe(1);
        await new Promise((r) => setTimeout(r, 1));
        order.push(c.seq);
        active--;
      },
      retryDelaysMs: ZERO_DELAYS,
    });
    queue.enqueue(chunk(0));
    queue.enqueue(chunk(2));
    queue.enqueue(chunk(1));
    expect(await queue.flush(1000)).toBe(true);
    // 0 was already uploading when 2 and 1 arrived; the rest go in seq order.
    expect(order).toEqual([0, 1, 2]);
    expect(queue.uploaded).toBe(3);
    expect(queue.pending).toBe(0);
  });

  it('retries failed uploads and keeps the order', async () => {
    const order: number[] = [];
    let failures = 2;
    const queue = new ChunkUploadQueue({
      upload: async (c) => {
        if (c.seq === 0 && failures-- > 0) throw new Error('network');
        order.push(c.seq);
      },
      retryDelaysMs: ZERO_DELAYS,
    });
    queue.enqueue(chunk(0));
    queue.enqueue(chunk(1));
    expect(await queue.flush(1000)).toBe(true);
    expect(order).toEqual([0, 1]);
    expect(queue.dropped).toBe(0);
  });

  it('drops a segment the server refuses, and one that keeps failing, then carries on', async () => {
    const onDropped = vi.fn();
    const uploaded: number[] = [];
    const queue = new ChunkUploadQueue({
      upload: async (c) => {
        if (c.seq === 0) throw Object.assign(new Error('closed'), { final: true });
        if (c.seq === 1) throw new Error('flaky');
        uploaded.push(c.seq);
      },
      isFinal: (e) => (e as { final?: boolean }).final === true,
      retryDelaysMs: ZERO_DELAYS,
      maxAttempts: 3,
      onDropped,
    });
    [0, 1, 2].forEach((s) => queue.enqueue(chunk(s)));
    expect(await queue.flush(1000)).toBe(true);
    expect(uploaded).toEqual([2]);
    expect(onDropped.mock.calls.map(([c, reason]) => [c.seq, reason])).toEqual([
      [0, 'refused'],
      [1, 'gave_up'],
    ]);
  });

  it('keeps segments while offline and uploads them once back online', async () => {
    let online = false;
    const upload = vi.fn(async (_c: QueuedChunk) => undefined);
    const queue = new ChunkUploadQueue({ upload, isOnline: () => online, retryDelaysMs: ZERO_DELAYS });
    queue.enqueue(chunk(0));
    queue.enqueue(chunk(1));
    await new Promise((r) => setTimeout(r, 5));
    expect(upload).not.toHaveBeenCalled();
    expect(queue.pending).toBe(2);

    online = true;
    queue.wake();
    expect(await queue.flush(1000)).toBe(true);
    expect(upload.mock.calls.map(([c]) => c.seq)).toEqual([0, 1]);
  });

  it('does not count failures while offline against the segment', async () => {
    let online = true;
    let calls = 0;
    const queue = new ChunkUploadQueue({
      upload: async () => {
        calls++;
        if (calls === 1) {
          online = false; // the connection dropped mid-upload
          throw new Error('offline');
        }
      },
      isOnline: () => online,
      retryDelaysMs: ZERO_DELAYS,
      maxAttempts: 1,
    });
    queue.enqueue(chunk(0));
    await new Promise((r) => setTimeout(r, 5));
    online = true;
    queue.wake();
    expect(await queue.flush(1000)).toBe(true);
    expect(queue.dropped).toBe(0);
    expect(queue.uploaded).toBe(1);
  });

  it('keeps at most maxBuffered segments, dropping the oldest waiting one', async () => {
    const onDropped = vi.fn();
    const queue = new ChunkUploadQueue({
      upload: async () => undefined,
      isOnline: () => false,
      maxBuffered: 3,
      onDropped,
    });
    [0, 1, 2, 3, 4].forEach((s) => queue.enqueue(chunk(s)));
    expect(queue.pending).toBe(3);
    expect(onDropped.mock.calls.map(([c, reason]) => [c.seq, reason])).toEqual([
      [0, 'buffer_full'],
      [1, 'buffer_full'],
    ]);
  });

  it('flush gives up after the timeout and reports false', async () => {
    const queue = new ChunkUploadQueue({ upload: async () => undefined, isOnline: () => false });
    queue.enqueue(chunk(0));
    expect(await queue.flush(10)).toBe(false);
    expect(await new ChunkUploadQueue({ upload: async () => undefined }).flush(10)).toBe(true);
  });
});
