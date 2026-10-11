export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Rejects with TimeoutError if the promise has not settled within timeoutMs. */
export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new TimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export interface RetryOptions<T> {
  /** Total tries, including the first. */
  attempts: number;
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Delay before each retry; the last value repeats if there are more retries than entries. */
  backoffMs?: number[];
  /** Treat a resolved value as a failure worth retrying (e.g. a transient Supabase error result). */
  shouldRetryResult?: (result: T) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs fn with a per-attempt timeout, retrying on rejection/timeout (and on results
 * flagged by shouldRetryResult). Returns the last result, or rethrows the last error.
 */
export async function retryWithTimeout<T>(fn: () => PromiseLike<T>, options: RetryOptions<T>): Promise<T> {
  const { attempts, timeoutMs, backoffMs = [500, 1500], shouldRetryResult, sleep = defaultSleep } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0);
    }
    try {
      const result = await withTimeout(fn(), timeoutMs);
      if (attempt < attempts - 1 && shouldRetryResult?.(result)) continue;
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * PostgREST errors with a SQLSTATE/PGRST code are real answers (permissions, bad query);
 * errors without one are network failures worth retrying.
 */
export function isTransientSupabaseError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && !error.code;
}
