// Web Push delivery: message encryption (RFC 8291, aes128gcm) and VAPID
// authorization (RFC 8292) on WebCrypto only. No Deno APIs or remote imports
// here, so the vitest suite (src/test/webPush.test.ts) can import it directly.

export type Bytes = Uint8Array<ArrayBuffer>;

export interface PushTarget {
  endpoint: string;
  /** Subscription public key, base64url (65-byte uncompressed P-256 point). */
  p256dh: string;
  /** Subscription auth secret, base64url (16 bytes). */
  auth: string;
}

export interface VapidConfig {
  /** base64url, 65-byte uncompressed P-256 point (as printed by `web-push generate-vapid-keys`). */
  publicKey: string;
  /** base64url, 32-byte private scalar. */
  privateKey: string;
  /** mailto: or https: contact for the push services. */
  subject: string;
}

export type PushUrgency = "very-low" | "low" | "normal" | "high";

export interface PushOptions {
  ttlSeconds: number;
  urgency: PushUrgency;
  /** Replaces an undelivered message with the same topic (max 32 base64url chars). */
  topic?: string;
}

const RECORD_SIZE = 4096;
const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Bytes {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** EC P-256 JWK from a raw uncompressed public point and optional private scalar. */
export function p256Jwk(publicKey: Bytes, privateKey?: Bytes): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Expected a 65-byte uncompressed P-256 public key");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    ext: true,
  };
  if (privateKey) {
    if (privateKey.length !== 32) throw new Error("Expected a 32-byte P-256 private key");
    jwk.d = base64UrlEncode(privateKey);
  }
  return jwk;
}

export interface EncryptOptions {
  /** Fixed salt, for test vectors only. */
  salt?: Bytes;
  /** Fixed sender key pair, for test vectors only. */
  sender?: { privateKey: CryptoKey; publicKey: Bytes };
}

/** Encrypt a push message body for one subscription (RFC 8291, single record). */
export async function encryptPushPayload(
  plaintext: Bytes,
  uaPublic: Bytes,
  authSecret: Bytes,
  options: EncryptOptions = {},
): Promise<Bytes> {
  let sender = options.sender;
  if (!sender) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    sender = {
      privateKey: pair.privateKey,
      publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    };
  }
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, sender.privateKey, 256),
  );

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, sender.publicKey, new Uint8Array([1]));
  const ikm = await hmacSha256(prkKey, keyInfo);
  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, encoder.encode("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmacSha256(prk, encoder.encode("Content-Encoding: nonce\0\x01"))).slice(0, 12);

  // One record: the plaintext followed by the 0x02 last-record delimiter.
  const padded = concat(plaintext, new Uint8Array([2]));
  if (padded.length + 16 > RECORD_SIZE) throw new Error("Push payload too large");
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = sender.publicKey.length;
  return concat(header, sender.publicKey, ciphertext);
}

/** `Authorization` header value for a push service request (RFC 8292). */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const publicKey = base64UrlDecode(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(publicKey, base64UrlDecode(vapid.privateKey)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 60 * 60, sub: vapid.subject }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto returns the raw r||s signature that JWS ES256 expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

/** The fetch() arguments that deliver `payload` to one subscription. */
export async function buildPushRequest(
  target: PushTarget,
  payload: string,
  vapid: VapidConfig,
  options: PushOptions,
): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPushPayload(
    encoder.encode(payload),
    base64UrlDecode(target.p256dh),
    base64UrlDecode(target.auth),
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(Math.max(0, Math.floor(options.ttlSeconds))),
    Urgency: options.urgency,
    Authorization: await vapidAuthorization(target.endpoint, vapid),
  };
  if (options.topic) headers.Topic = options.topic;
  return { url: target.endpoint, init: { method: "POST", headers, body } };
}

/** What to do with a subscription after the push service answered with `status`. */
export function subscriptionOutcome(status: number): "delivered" | "gone" | "failed" {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 404 || status === 410) return "gone";
  return "failed";
}
