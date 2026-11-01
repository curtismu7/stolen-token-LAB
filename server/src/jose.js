// Tiny JOSE helpers: ES256 only. Keys come from fixed fixture seeds through createECDH + createPrivateKey (JWK form).
// Never the sync key-pair generator (see docs/architecture.md): it aborts under GC on Node 20 on this machine. Every parser has hard size limits.
import { createECDH, createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const sha256b64u = (text) => b64u(createHash('sha256').update(String(text)).digest());

export class JoseError extends Error {}

// Fixture keys: the private scalar is SHA-256 of a fixed label. Deterministic, mock-only, never a real credential.
const cache = new Map();
export function fixtureKey(name) {
  if (cache.has(name)) return cache.get(name);
  const seed = createHash('sha256').update(`stolen-token-lab fixture key v1: ${name}`).digest();
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(seed);
  const pub = ecdh.getPublicKey(); // 0x04 || X || Y
  const publicJwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  const privateKey = createPrivateKey({ key: { ...publicJwk, d: b64u(seed) }, format: 'jwk' });
  const key = { name, publicJwk, privateKey, jkt: jwkThumbprint(publicJwk) };
  cache.set(name, key);
  return key;
}

// RFC 7638: required members only (crv, kty, x, y), lexicographic order, no whitespace, SHA-256, base64url.
export function jwkThumbprint(jwk) {
  return sha256b64u(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }));
}

// The simulated client certificate: a labelled fake DER blob, hashed like RFC 8705 (base64url SHA-256 of the DER).
export const certThumbprint = (holder) => sha256b64u(`MOCK-CERT-DER (simulated, no real TLS): ${holder}`);

export function signJwt(header, payload, privateKey) {
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  return `${input}.${b64u(sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }))}`;
}

export const LIMITS = { token: 4096, segment: 2048 };
const SEG = /^[A-Za-z0-9_-]+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Parse a compact JWT without verifying it. Throws JoseError on anything malformed or oversized.
export function parseJwt(token) {
  if (typeof token !== 'string') throw new JoseError('not a string');
  if (token.length > LIMITS.token) throw new JoseError('token too large');
  const parts = token.split('.');
  if (parts.length !== 3) throw new JoseError('not a three-part compact JWT');
  for (const p of parts) if (!p || p.length > LIMITS.segment || !SEG.test(p)) throw new JoseError('bad segment');
  let header; let payload;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { throw new JoseError('header or payload is not JSON'); }
  if (!isObj(header) || !isObj(payload)) throw new JoseError('header and payload must be JSON objects');
  return { header, payload, input: `${parts[0]}.${parts[1]}`, sig: Buffer.from(parts[2], 'base64url') };
}

const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];
// A public P-256 JWK or a reason it is not one. A jwk carrying private members is refused (RFC 9449 4.3 item 7).
export function jwkProblem(jwk) {
  if (!isObj(jwk)) return 'jwk is not an object';
  for (const m of PRIVATE_MEMBERS) if (Object.hasOwn(jwk, m)) return 'jwk contains private key material';
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return 'jwk must be EC P-256';
  for (const m of ['x', 'y']) if (typeof jwk[m] !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk[m])) return `jwk.${m} is malformed`;
  return null;
}

// True only if the ES256 signature verifies under the given public JWK. Never throws.
export function verifyJwtSig(parsed, publicJwk) {
  try {
    if (jwkProblem(publicJwk)) return false;
    if (parsed.sig.length !== 64) return false;
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y }, format: 'jwk' });
    return verify('sha256', Buffer.from(parsed.input), { key, dsaEncoding: 'ieee-p1363' }, parsed.sig);
  } catch { return false; }
}
