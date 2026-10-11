import { describe, it, expect, vi } from 'vitest';
import { isTransientSupabaseError, retryWithTimeout, TimeoutError, withTimeout } from '@/lib/retry';

const noSleep = () => Promise.resolve();
const never = <T,>() => new Promise<T>(() => undefined);

describe('withTimeout', () => {
  it('resolves when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
  });

  it('rejects with TimeoutError when the promise hangs', async () => {
    vi.useFakeTimers();
    const p = withTimeout(never<number>(), 100);
    vi.advanceTimersByTime(100);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    vi.useRealTimers();
  });
});

describe('retryWithTimeout', () => {
  it('retries a hung attempt and returns the next success', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockImplementationOnce(() => never()).mockResolvedValueOnce('ok');
    const p = retryWithTimeout(fn, { attempts: 3, timeoutMs: 100, sleep: noSleep });
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('rethrows the last error once attempts are used up', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(retryWithTimeout(fn, { attempts: 3, timeoutMs: 100, sleep: noSleep })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries flagged results but returns the final one as-is', async () => {
    const transient = { data: null, error: { message: 'Failed to fetch', code: '' } };
    const fn = vi.fn(() => Promise.resolve(transient));
    const result = await retryWithTimeout(fn, {
      attempts: 2,
      timeoutMs: 100,
      sleep: noSleep,
      shouldRetryResult: (r) => isTransientSupabaseError(r.error),
    });
    expect(result).toBe(transient);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('waits the configured backoff between attempts', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue(1);
    await retryWithTimeout(fn, { attempts: 3, timeoutMs: 100, backoffMs: [10, 20], sleep });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });
});

describe('isTransientSupabaseError', () => {
  it('treats coded errors as final and uncoded ones as transient', () => {
    expect(isTransientSupabaseError(null)).toBe(false);
    expect(isTransientSupabaseError({ code: '42501' })).toBe(false);
    expect(isTransientSupabaseError({ code: 'PGRST116' })).toBe(false);
    expect(isTransientSupabaseError({ code: '' })).toBe(true);
    expect(isTransientSupabaseError({})).toBe(true);
  });
});
