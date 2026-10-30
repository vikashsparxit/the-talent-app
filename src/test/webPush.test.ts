import { describe, it, expect } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  encryptPushPayload,
  p256Jwk,
  subscriptionOutcome,
  vapidAuthorization,
  type Bytes,
} from '../../supabase/functions/_shared/webPush.ts';

const enc = new TextEncoder();

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Decrypt the way a browser does, to check our encryption end to end. */
async function decrypt(body: Bytes, uaPrivate: CryptoKey, uaPublic: Bytes, authSecret: Bytes): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivate, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic, 1]);
  const ikm = await hmac(prkKey, info);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function newSubscriber() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: pair.privateKey, publicKey, auth };
}

async function newVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    publicKey: base64UrlEncode(publicKey),
    privateKey: jwk.d!,
    subject: 'mailto:ops@example.com',
    verifyKey: pair.publicKey,
  };
}

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = new Uint8Array([0, 251, 255, 1, 2]);
    const s = base64UrlEncode(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...base64UrlDecode(s)]).toEqual([...bytes]);
  });
});

describe('encryptPushPayload', () => {
  it('matches the RFC 8291 Appendix A example', async () => {
    const asPublic = base64UrlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const asPrivate = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(asPublic, base64UrlDecode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw')),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const body = await encryptPushPayload(
      enc.encode('When I grow up, I want to be a watermelon'),
      base64UrlDecode('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
      base64UrlDecode('BTBZMqHH6r4Tts7J_aSIgg'),
      { salt: base64UrlDecode('DGv6ra1nlYgDCS1FRnbzlw'), sender: { privateKey: asPrivate, publicKey: asPublic } },
    );
    expect(base64UrlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('produces a body the subscriber can decrypt, with a fresh key and salt each time', async () => {
    const sub = await newSubscriber();
    const message = JSON.stringify({ title: 'Interview scheduled', link: '/calendar' });
    const a = await encryptPushPayload(enc.encode(message), sub.publicKey, sub.auth);
    const b = await encryptPushPayload(enc.encode(message), sub.publicKey, sub.auth);
    expect(await decrypt(a, sub.privateKey, sub.publicKey, sub.auth)).toBe(message);
    expect(base64UrlEncode(a.slice(0, 16))).not.toBe(base64UrlEncode(b.slice(0, 16)));
  });

  it('rejects payloads that do not fit in one record', async () => {
    const sub = await newSubscriber();
    await expect(encryptPushPayload(new Uint8Array(4090), sub.publicKey, sub.auth)).rejects.toThrow(/too large/);
  });
});

describe('vapidAuthorization', () => {
  it('signs an ES256 JWT for the push service origin', async () => {
    const vapid = await newVapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 1_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, c, sig, k] = m!;
    expect(k).toBe(vapid.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_000_000 + 12 * 3600,
      sub: 'mailto:ops@example.com',
    });
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapid.verifyKey,
      base64UrlDecode(sig),
      enc.encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });
});

describe('buildPushRequest', () => {
  it('posts an encrypted body with the Web Push headers', async () => {
    const sub = await newSubscriber();
    const vapid = await newVapidKeys();
    const { url, init } = await buildPushRequest(
      { endpoint: 'https://push.example.com/send/1', p256dh: base64UrlEncode(sub.publicKey), auth: base64UrlEncode(sub.auth) },
      '{"title":"x"}',
      vapid,
      { ttlSeconds: 900, urgency: 'high', topic: 'interview' },
    );
    expect(url).toBe('https://push.example.com/send/1');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.TTL).toBe('900');
    expect(headers.Urgency).toBe('high');
    expect(headers.Topic).toBe('interview');
    expect(headers.Authorization).toMatch(/^vapid t=/);
    expect(await decrypt(init.body as Bytes, sub.privateKey, sub.publicKey, sub.auth)).toBe('{"title":"x"}');
  });
});

describe('subscriptionOutcome', () => {
  it('drops subscriptions the push service no longer knows', () => {
    expect(subscriptionOutcome(201)).toBe('delivered');
    expect(subscriptionOutcome(404)).toBe('gone');
    expect(subscriptionOutcome(410)).toBe('gone');
    expect(subscriptionOutcome(429)).toBe('failed');
    expect(subscriptionOutcome(500)).toBe('failed');
  });
});
