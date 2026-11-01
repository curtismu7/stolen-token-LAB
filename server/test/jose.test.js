import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixtureKey, jwkThumbprint, signJwt, parseJwt, verifyJwtSig, jwkProblem, sha256b64u, certThumbprint, b64u, LIMITS } from '../src/jose.js';

test('fixture keys are deterministic, distinct, public-only in the JWK, and have a 43-char RFC 7638 thumbprint', () => {
  const a = fixtureKey('holder-client'); const b = fixtureKey('holder-attacker');
  assert.equal(a.jkt, fixtureKey('holder-client').jkt);
  assert.notEqual(a.jkt, b.jkt);
  assert.equal(a.jkt.length, 43);
  assert.deepEqual(Object.keys(a.publicJwk).sort(), ['crv', 'kty', 'x', 'y']);
  assert.equal(jwkProblem(a.publicJwk), null);
});

test('thumbprint is exactly SHA-256 of {"crv","kty","x","y"} with no whitespace, base64url', () => {
  const { publicJwk } = fixtureKey('holder-client');
  const manual = createHash('sha256').update(`{"crv":"P-256","kty":"EC","x":"${publicJwk.x}","y":"${publicJwk.y}"}`).digest('base64url');
  assert.equal(jwkThumbprint(publicJwk), manual);
  assert.equal(jwkThumbprint({ ...publicJwk, extra: 'ignored', kid: 'x' }), manual, 'optional members never change the thumbprint');
});

test('ES256 sign/verify round trip; tampering and the wrong key fail', () => {
  const k = fixtureKey('holder-client');
  const jwt = signJwt({ alg: 'ES256' }, { a: 1 }, k.privateKey);
  const p = parseJwt(jwt);
  assert.equal(verifyJwtSig(p, k.publicJwk), true);
  assert.equal(verifyJwtSig(p, fixtureKey('holder-attacker').publicJwk), false);
  const [h, , s] = jwt.split('.');
  assert.equal(verifyJwtSig(parseJwt(`${h}.${b64u('{"a":2}')}.${s}`), k.publicJwk), false);
});

test('ath and cert thumbprints are base64url SHA-256', () => {
  assert.equal(sha256b64u('abc'), createHash('sha256').update('abc').digest('base64url'));
  assert.equal(certThumbprint('client').length, 43);
  assert.notEqual(certThumbprint('client'), certThumbprint('attacker'));
});

test('parseJwt hostile input: wrong types, sizes, segments, non-JSON, non-object JSON', () => {
  for (const bad of [null, undefined, 5, {}, '', 'a.b', 'a.b.c.d', '..', 'a.b.', 'a b.c.d', 'x'.repeat(LIMITS.token + 1), `${'a'.repeat(LIMITS.segment + 1)}.b.c`,
    `${b64u('nope')}.${b64u('{}')}.AAAA`, `${b64u('[]')}.${b64u('{}')}.AAAA`, `${b64u('{}')}.${b64u('"str"')}.AAAA`, `${b64u('null')}.${b64u('{}')}.AAAA`]) {
    assert.throws(() => parseJwt(bad), /./, String(bad).slice(0, 30));
  }
});

test('deeply nested JSON in a token is handled without a stack overflow', () => {
  const deep = `${'['.repeat(500)}${']'.repeat(500)}`;
  const jwt = `${b64u(`{"a":${deep}}`)}.${b64u('{}')}.AAAA`;
  assert.doesNotThrow(() => parseJwt(jwt));
  const huge = `${'['.repeat(1400)}${']'.repeat(1400)}`;
  try { parseJwt(`${b64u(`{"a":${huge}}`)}.${b64u('{}')}.AAAA`); } catch (e) { assert.ok(!(e instanceof RangeError), 'must be a JoseError, never a stack overflow'); }
});

test('jwkProblem refuses private members, other curves, short coordinates and non-objects', () => {
  const pub = fixtureKey('holder-client').publicJwk;
  for (const m of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']) assert.match(jwkProblem({ ...pub, [m]: 'x' }), /private/, m);
  assert.match(jwkProblem({ ...pub, crv: 'P-384' }), /P-256/);
  assert.match(jwkProblem({ ...pub, x: 'short' }), /x/);
  for (const v of [null, 'x', [], 5, undefined]) assert.ok(jwkProblem(v));
  assert.equal(verifyJwtSig(parseJwt(signJwt({ alg: 'ES256' }, {}, fixtureKey('holder-client').privateKey)), { ...pub, d: 'x' }), false);
});

test('parseJwt size limit is on the whole token, not only on each segment', () => {
  const seg = 'a'.repeat(LIMITS.segment - 1);
  assert.throws(() => parseJwt(`${seg}.${seg}.${seg}`), /too large/);
});
