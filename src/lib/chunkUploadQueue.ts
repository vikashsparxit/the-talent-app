// Upload queue for webcam recording segments: one upload at a time in seq
// order, retries with backoff, waits while the browser is offline, and keeps
// at most maxBuffered segments in memory (the oldest waiting one is dropped
// first). Uploading itself (presign, PUT, confirm) is injected, so this has no
// network code and is unit-tested directly.

export interface QueuedChunk {
  recordingId: string;
  seq: number;
  blob: Blob;
  /** Browser time the segment started (ms since epoch). */
  capturedAt: number;
  durationMs: number;
}

export type DropReason = 'buffer_full' | 'refused' | 'gave_up';

export interface ChunkUploadQueueOptions {
  upload: (chunk: QueuedChunk) => Promise<void>;
  isOnline?: () => boolean;
  /** Waits between tries; wake() cuts a wait short. */
  retryDelaysMs?: readonly number[];
  /** Tries per segment while online before it is given up. */
  maxAttempts?: number;
  maxBuffered?: number;
  /** A refusal that retrying cannot fix (e.g. the recording is closed). */
  isFinal?: (error: unknown) => boolean;
  onDropped?: (chunk: QueuedChunk, reason: DropReason) => void;
  onUploaded?: (chunk: QueuedChunk) => void;
  onChange?: (pending: number) => void;
}

/** About five minutes of 10-second segments. */
export const MAX_BUFFERED_CHUNKS = 30;
export const CHUNK_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 5000, 10_000, 20_000, 30_000];
export const CHUNK_MAX_ATTEMPTS = 10;
/** How often to look again while offline, in case no 'online' event arrives. */
export const OFFLINE_RECHECK_MS = 5000;

export class ChunkUploadQueue {
  private items: QueuedChunk[] = [];
  private attempts = new Map<QueuedChunk, number>();
  private inFlight: QueuedChunk | null = null;
  private running = false;
  private wakers: (() => void)[] = [];
  private idleWaiters: (() => void)[] = [];
  private readonly opts: Required<Omit<ChunkUploadQueueOptions, 'onDropped' | 'onUploaded' | 'onChange'>> &
    Pick<ChunkUploadQueueOptions, 'onDropped' | 'onUploaded' | 'onChange'>;
  uploaded = 0;
  dropped = 0;

  constructor(options: ChunkUploadQueueOptions) {
    this.opts = {
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
      retryDelaysMs: CHUNK_RETRY_DELAYS_MS,
      maxAttempts: CHUNK_MAX_ATTEMPTS,
      maxBuffered: MAX_BUFFERED_CHUNKS,
      isFinal: () => false,
      ...options,
    };
  }

  get pending(): number {
    return this.items.length;
  }

  enqueue(chunk: QueuedChunk): void {
    this.items.push(chunk);
    this.items.sort((a, b) => a.seq - b.seq);
    while (this.items.length > this.opts.maxBuffered) {
      const victim = this.items.find((c) => c !== this.inFlight);
      if (!victim) break;
      this.remove(victim);
      this.drop(victim, 'buffer_full');
    }
    this.opts.onChange?.(this.items.length);
    this.wake();
    void this.run();
  }

  /** Retry now, e.g. when the browser comes back online. */
  wake(): void {
    const wakers = this.wakers;
    this.wakers = [];
    wakers.forEach((w) => w());
  }

  /** Waits until everything queued is uploaded or dropped; false if timeoutMs passes first. */
  flush(timeoutMs: number): Promise<boolean> {
    if (!this.running && this.items.length === 0) return Promise.resolve(true);
    this.wake();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.idleWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private remove(chunk: QueuedChunk) {
    this.items = this.items.filter((c) => c !== chunk);
    this.attempts.delete(chunk);
  }

  private drop(chunk: QueuedChunk, reason: DropReason) {
    this.dropped++;
    this.opts.onDropped?.(chunk, reason);
  }

  private waitForWake(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakers = this.wakers.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.push(done);
    });
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.items.length > 0) {
        const chunk = this.items[0];
        if (!this.opts.isOnline()) {
          await this.waitForWake(OFFLINE_RECHECK_MS);
          continue;
        }
        this.inFlight = chunk;
        try {
          await this.opts.upload(chunk);
          this.inFlight = null;
          this.remove(chunk);
          this.uploaded++;
          this.opts.onUploaded?.(chunk);
          this.opts.onChange?.(this.items.length);
        } catch (error) {
          this.inFlight = null;
          // Dropped for space while uploading, or the connection went: failures
          // while offline are not the segment's fault and are not counted.
          if (!this.items.includes(chunk) || !this.opts.isOnline()) continue;
          const final = this.opts.isFinal(error);
          const tries = (this.attempts.get(chunk) ?? 0) + 1;
          this.attempts.set(chunk, tries);
          if (final || tries >= this.opts.maxAttempts) {
            this.remove(chunk);
            this.drop(chunk, final ? 'refused' : 'gave_up');
            this.opts.onChange?.(this.items.length);
            continue;
          }
          const delays = this.opts.retryDelaysMs;
          await this.waitForWake(delays[Math.min(tries - 1, delays.length - 1)] ?? 0);
        }
      }
    } finally {
      this.running = false;
      this.inFlight = null;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((w) => w());
    }
  }
}
