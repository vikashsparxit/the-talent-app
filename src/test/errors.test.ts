import { afterEach, describe, it, expect, vi } from 'vitest';
import { errorResponse, HttpError } from '../../supabase/functions/_shared/errors.ts';

const CORS = { 'Access-Control-Allow-Headers': 'authorization' };

describe('errorResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides unexpected error details behind a generic 500 with a request id', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new Error('duplicate key value violates unique constraint "candidates_pkey"');

    const res = errorResponse('parse-resume', err, CORS);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('authorization');
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.error).toContain(body.request_id);
    expect(JSON.stringify(body)).not.toContain('candidates_pkey');

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe(`[parse-resume] request_id=${body.request_id}`);
    expect(log.mock.calls[0][1]).toBe(err);
  });

  it('handles non-Error throwables', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = errorResponse('chitra-engine', 'connection refused to db:5432', CORS);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('5432');
  });

  it('uses a new request id for every failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const first = await errorResponse('fn', new Error('a'), CORS).json();
    const second = await errorResponse('fn', new Error('b'), CORS).json();

    expect(first.request_id).not.toBe(second.request_id);
  });

  it('passes HttpError status and message through without logging', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = errorResponse('analyze-candidate', new HttpError(404, 'Candidate not found'), CORS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Candidate not found' });
    expect(log).not.toHaveBeenCalled();
  });
});
