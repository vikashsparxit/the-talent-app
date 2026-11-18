import { describe, it, expect } from 'vitest';
import {
  amzDate,
  clampExpires,
  isSafeObjectKey,
  loadR2Config,
  presignDelete,
  presignGet,
  presignPut,
  presignUrl,
  recordingChunkKey,
  recordingPrefix,
  spokenAnswerKey,
  uriEncode,
  type R2Config,
} from '../../supabase/functions/_shared/r2.ts';

const CA = '11111111-2222-4333-8444-555555555555';
const REC = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const cfg: R2Config = {
  accountId: 'acct123',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  bucket: 'recordings',
  defaultExpiresIn: 600,
};

describe('SigV4 presigning', () => {
  it('matches the AWS documentation presigned GET example', async () => {
    const url = await presignUrl({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      date: new Date('2013-05-24T00:00:00Z'),
      expiresIn: 86400,
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('formats dates and encodes like SigV4', () => {
    expect(amzDate(new Date('2026-11-14T08:09:10.123Z'))).toBe('20261114T080910Z');
    expect(uriEncode('a b/c~d+é')).toBe('a%20b%2Fc~d%2B%C3%A9');
    expect(uriEncode('/x/y z', false)).toBe('/x/y%20z');
  });

  it('builds path-style R2 URLs with region auto and a signed content-type on PUT', async () => {
    const now = new Date('2026-11-14T00:00:00Z');
    const key = recordingChunkKey(CA, REC, 3, 'webm');
    const put = new URL(await presignPut(cfg, { key, contentType: 'video/webm', now }));
    expect(put.host).toBe('acct123.r2.cloudflarestorage.com');
    expect(put.pathname).toBe(`/recordings/${key}`);
    expect(put.searchParams.get('X-Amz-Credential')).toBe('AKID/20261114/auto/s3/aws4_request');
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(put.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(put.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);

    const other = await presignPut(cfg, { key, contentType: 'video/mp4', now });
    expect(new URL(other).searchParams.get('X-Amz-Signature')).not.toBe(put.searchParams.get('X-Amz-Signature'));
  });

  it('signs response-content-type on GET and caps lifetimes', async () => {
    const key = spokenAnswerKey(CA, REC, 1, 'm4a');
    const get = new URL(await presignGet(cfg, { key, responseContentType: 'audio/mp4', expiresIn: 99999 }));
    expect(get.searchParams.get('response-content-type')).toBe('audio/mp4');
    expect(get.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(get.searchParams.get('X-Amz-SignedHeaders')).toBe('host');

    const del = new URL(await presignDelete(cfg, { key }));
    expect(del.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('refuses unsafe keys', async () => {
    await expect(presignGet(cfg, { key: '../secrets' })).rejects.toThrow();
    await expect(presignPut(cfg, { key: '/abs', contentType: 'video/webm' })).rejects.toThrow();
  });

  it('clamps expiry to 1..3600 with a default of 600', () => {
    expect(clampExpires(undefined)).toBe(600);
    expect(clampExpires(-5)).toBe(600);
    expect(clampExpires(30.7)).toBe(30);
    expect(clampExpires(7200)).toBe(3600);
  });
});

describe('R2 config loader', () => {
  const env = (vals: Record<string, string>) => (name: string) => vals[name];
  const full = {
    R2_ACCOUNT_ID: 'a',
    R2_ACCESS_KEY_ID: 'b',
    R2_SECRET_ACCESS_KEY: 'c',
    R2_BUCKET_RECORDINGS: 'd',
  };

  it('returns null when any required variable is missing', () => {
    expect(loadR2Config(env({}))).toBeNull();
    expect(loadR2Config(env({ ...full, R2_SECRET_ACCESS_KEY: ' ' }))).toBeNull();
  });

  it('reads the optional TTL and caps it', () => {
    expect(loadR2Config(env(full))?.defaultExpiresIn).toBe(600);
    expect(loadR2Config(env({ ...full, R2_PRESIGN_TTL_SECONDS: '900' }))?.defaultExpiresIn).toBe(900);
    expect(loadR2Config(env({ ...full, R2_PRESIGN_TTL_SECONDS: '86400' }))?.defaultExpiresIn).toBe(3600);
    expect(loadR2Config(env({ ...full, R2_PRESIGN_TTL_SECONDS: 'abc' }))?.defaultExpiresIn).toBe(600);
  });
});

describe('object keys', () => {
  it('accepts only simple relative keys', () => {
    expect(isSafeObjectKey('recordings/a/b/000001.webm')).toBe(true);
    for (const bad of ['', '/a', 'a/', 'a//b', 'a/../b', '..', './a', 'a b', 'a\\b', 'a/%2e%2e', 'ä', 'a?b', 'x'.repeat(513)]) {
      expect(isSafeObjectKey(bad)).toBe(false);
    }
    expect(isSafeObjectKey(42)).toBe(false);
  });

  it('builds recording and spoken keys from validated parts', () => {
    expect(recordingPrefix(CA, REC)).toBe(`recordings/${CA}/${REC}/`);
    expect(recordingChunkKey(CA, REC, 12, 'webm')).toBe(`recordings/${CA}/${REC}/000012.webm`);
    expect(spokenAnswerKey(CA, REC, 2, 'ogg')).toBe(`spoken/${CA}/${REC}/2.ogg`);
    expect(recordingChunkKey(CA.toUpperCase(), REC, 0, 'mp4')).toBe(`recordings/${CA}/${REC}/000000.mp4`);
  });

  it('rejects bad ids, sequences, attempts and extensions', () => {
    expect(() => recordingChunkKey('../x', REC, 0, 'webm')).toThrow();
    expect(() => recordingChunkKey(CA, REC, -1, 'webm')).toThrow();
    expect(() => recordingChunkKey(CA, REC, 1.5, 'webm')).toThrow();
    expect(() => recordingChunkKey(CA, REC, 0, 'we/bm')).toThrow();
    expect(() => spokenAnswerKey(CA, REC, 0, 'webm')).toThrow();
    expect(() => spokenAnswerKey(CA, 'not-a-uuid', 1, 'webm')).toThrow();
  });
});
