import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { fixtureKey, signJwt, sha256b64u, b64u, certThumbprint } from '../src/jose.js';
import { CONTROL_IDS, CERT_HEADER, IAT_WINDOW_S, allOn } from '../src/gateway.js';

// Hand-built requests, so each rule is pinned without going through the scenario DSL.
function rig({ kind = 'dpop', holder = 'client', ttl } = {}) {
  const s = setup();
  const t = s.w.as.issue({ kind, holder, sub: 'u', clientId: 'c', audience: `https://${s.c.host_a}`, ttl });
  const key = fixtureKey('holder-client');
  const now = () => Math.floor(s.w.clock.now() / 1000);
  const proof = (over = {}, { header = {}, signer = key, drop = [] } = {}) => {
    const claims = { jti: `j-${Math.random()}`, htm: 'GET', htu: s.url(), iat: now(), nonce: s.w.gateway.currentNonce(), ath: sha256b64u(t.token), ...over };
    for (const d of drop) delete claims[d];
    return signJwt({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk, ...header }, claims, signer.privateKey);
  };
  const call = (headers, { method = 'GET', url = s.url() } = {}) => s.w.gateway.evaluate({ method, url, headers });
  const dp = (over, o) => call({ authorization: `DPoP ${t.token}`, dpop: proof(over, o) });
  return { ...s, t, key, proof, call, dp, now };
}
const code = (r) => r.body?.error;

test('baseline: a correct DPoP request is allowed and the log shows every check passing', () => {
  const r = rig(); const out = r.dp();
  assert.equal(out.status, 200);
  assert.deepEqual(out.log.filter((l) => l.control).map((l) => l.control), ['audience', 'dpop_signature', 'dpop_binding', 'dpop_htm', 'dpop_htu', 'dpop_nonce', 'dpop_iat', 'dpop_ath', 'dpop_jti']);
  assert.ok(out.log.every((l) => l.result !== 'fail'));
});

test('no credential: 401 with a bare Bearer challenge and no error code (RFC 6750 3.1)', () => {
  const out = rig().call({});
  assert.equal(out.status, 401); assert.equal(out.headers['WWW-Authenticate'], 'Bearer realm="mock-gateway"');
});

test('token problems are always refused as invalid_token: tampered, foreign issuer key, expired, alg none, garbage', () => {
  const r = rig({ kind: 'bearer' });
  const [h, p, s] = r.t.token.split('.');
  assert.equal(r.call({ authorization: `Bearer ${h}.${b64u('{"iss":"x"}')}.${s}` }).status, 401);
  const forged = signJwt({ alg: 'ES256', typ: 'at+jwt' }, { ...r.t.claims }, fixtureKey('holder-attacker').privateKey);
  assert.equal(code(r.call({ authorization: `Bearer ${forged}` })), 'invalid_token');
  assert.equal(code(r.call({ authorization: `Bearer ${h.replace(/./, 'x')}.${p}.${s}` })), 'invalid_token');
  assert.equal(code(r.call({ authorization: `Bearer ${b64u('{"alg":"none","typ":"at+jwt"}')}.${p}.AAAA` })), 'invalid_token');
  assert.equal(code(r.call({ authorization: 'Bearer not-a-jwt' })), 'invalid_token');
  r.w.clock.advance(3601);
  const exp = r.call({ authorization: `Bearer ${r.t.token}` });
  assert.equal(code(exp), 'invalid_token'); assert.match(exp.body.error_description, /expired/);
});

test('malformed Authorization headers: wrong scheme, extra parts, control characters', () => {
  const r = rig({ kind: 'bearer' });
  for (const a of [`Basic ${r.t.token}`, `Bearer ${r.t.token} extra`, `Bearer`, `Bearer ${r.t.token}\n`, 'Bearer \u0000', `bearer  ${r.t.token}`]) assert.equal(r.call({ authorization: a }).status, 401, a.slice(0, 20));
  assert.equal(r.call({ authorization: `bearer ${r.t.token}` }).status, 200, 'scheme is case-insensitive');
});

test('unknown host is 404, malformed URL is 400', () => {
  const r = rig({ kind: 'bearer' });
  assert.equal(r.call({ authorization: `Bearer ${r.t.token}` }, { url: 'https://nowhere.example/x' }).status, 404);
  assert.equal(r.call({ authorization: `Bearer ${r.t.token}` }, { url: 'not a url' }).status, 400);
});

test('audience: wrong API is refused; with the control off it is accepted', () => {
  const r = rig({ kind: 'bearer' });
  const other = r.call({ authorization: `Bearer ${r.t.token}` }, { url: r.url('/x', 'b') });
  assert.equal(other.status, 401); assert.match(other.body.error_description, /audience/);
  r.w.setControls({ audience: false });
  assert.equal(r.call({ authorization: `Bearer ${r.t.token}` }, { url: r.url('/x', 'b') }).status, 200);
  assert.ok(r.call({ authorization: `Bearer ${r.t.token}` }).log.some((l) => l.result === 'skipped' && l.control === 'audience'));
});

test('DPoP: bound token as Bearer, with no proof, and with a foreign key are all refused', () => {
  const r = rig();
  assert.equal(code(r.call({ authorization: `Bearer ${r.t.token}` })), 'invalid_token');
  assert.equal(code(r.call({ authorization: `DPoP ${r.t.token}` })), 'invalid_dpop_proof');
  const mine = fixtureKey('holder-attacker');
  assert.equal(code(r.dp({}, { header: { jwk: mine.publicJwk }, signer: mine })), 'invalid_token');
});

test('DPoP proof structure: typ, alg none/HS256, jwk with private key, missing claims, two headers, junk', () => {
  const r = rig();
  const d = (o) => code(r.dp({}, o));
  assert.equal(d({ header: { typ: 'JWT' } }), 'invalid_dpop_proof');
  assert.equal(d({ header: { alg: 'none' } }), 'invalid_dpop_proof');
  assert.equal(d({ header: { alg: 'HS256' } }), 'invalid_dpop_proof');
  assert.equal(d({ header: { jwk: { ...r.key.publicJwk, d: 'AAAA' } } }), 'invalid_dpop_proof');
  assert.match(r.dp({}, { header: { jwk: { ...r.key.publicJwk, d: 'AAAA' } } }).body.error_description, /private/);
  for (const drop of ['jti', 'htm', 'htu', 'iat']) assert.equal(d({ drop: [drop] }), 'invalid_dpop_proof', drop);
  const two = r.call({ authorization: `DPoP ${r.t.token}`, dpop: [r.proof(), r.proof()] });
  assert.equal(code(two), 'invalid_dpop_proof'); assert.match(two.body.error_description, /more than one/);
  for (const junk of ['x', '', 'a.b.c', 'x'.repeat(10000), `${'['.repeat(5000)}`]) assert.equal(code(r.call({ authorization: `DPoP ${r.t.token}`, dpop: junk })), 'invalid_dpop_proof');
  assert.equal(code(r.call({ authorization: `DPoP ${r.t.token}`, dpop: { not: 'a string' } })), 'invalid_dpop_proof');
});

test('DPoP checks one by one: signature, htm, htu, nonce, iat, ath, jti each refuse exactly their own fault', () => {
  const r = rig();
  const cases = [
    ['dpop_signature', r.proof({}, { signer: fixtureKey('holder-attacker') })],
    ['dpop_htm', r.proof({ htm: 'POST' })],
    ['dpop_htu', r.proof({ htu: r.url('/other') })],
    ['dpop_nonce', r.proof({ nonce: undefined })],
    ['dpop_iat', r.proof({ iat: r.now() - 3600 })],
    ['dpop_ath', r.proof({ ath: undefined })],
  ];
  for (const [control, proof] of cases) {
    assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: proof }).status, 401, control);
    r.w.setControls({ ...allOn(), [control]: false });
    assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: proof }).status, 200, `${control} off`);
    r.w.setControls(allOn());
  }
  const p = r.proof();
  assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: p }).status, 200);
  assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: p }).status, 401, 'same jti twice');
});

test('iat window is +/-60 s and also refuses a proof from the future', () => {
  const r = rig();
  assert.equal(r.dp({ iat: r.now() - IAT_WINDOW_S }).status, 200);
  assert.equal(r.dp({ iat: r.now() - IAT_WINDOW_S - 1 }).status, 401);
  assert.equal(r.dp({ iat: r.now() + IAT_WINDOW_S }).status, 200);
  assert.equal(r.dp({ iat: r.now() + IAT_WINDOW_S + 1 }).status, 401);
  assert.equal(r.dp({ iat: 'now' }).status, 401);
  assert.equal(r.dp({ iat: 1.5 }).status, 401);
});

test('htu ignores query and fragment (RFC 9449 4.2) but not path or host', () => {
  const r = rig();
  assert.equal(r.dp({ htu: `${r.url()}?x=1#frag` }).status, 200);
  assert.equal(r.dp({ htu: r.url('/v1/other') }).status, 401);
  assert.equal(r.dp({ htu: r.url(r.c.path_read, 'b') }).status, 401);
  assert.equal(r.dp({ htu: 'not a url' }).status, 401);
  assert.equal(r.dp({ htu: 42 }).status, 401);
  assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: r.proof({ htu: r.url() }) }, { url: `${r.url()}?q=1` }).status, 200, 'request query is ignored too');
});

test('nonce: the 401 carries the server nonce and a retry with it succeeds; rotating the nonce invalidates an old proof', () => {
  const r = rig();
  const first = r.dp({ nonce: undefined });
  assert.equal(code(first), 'use_dpop_nonce');
  assert.equal(first.headers['DPoP-Nonce'], r.w.gateway.currentNonce());
  assert.match(first.headers['WWW-Authenticate'], /^DPoP error="use_dpop_nonce"/);
  assert.equal(r.dp({ nonce: first.headers['DPoP-Nonce'] }).status, 200);
  const old = r.proof();
  r.w.gateway.rotateNonce();
  assert.equal(code(r.call({ authorization: `DPoP ${r.t.token}`, dpop: old })), 'use_dpop_nonce');
});

test('a failed proof does not burn its jti; a passed one is remembered only for the window', () => {
  const r = rig();
  const p = r.proof({ htm: 'POST' });
  assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: p }).status, 401);
  assert.equal(r.call({ authorization: `DPoP ${r.t.token}`, dpop: p }, { method: 'POST' }).status, 200, 'first accepted use is not blocked by the failed attempt');
});

test('401 challenges use the right scheme and name the algorithms for DPoP', () => {
  const r = rig();
  const a = r.dp({ htm: 'POST' });
  assert.match(a.headers['WWW-Authenticate'], /^DPoP error="invalid_dpop_proof".*algs="ES256"/);
  const b = rig({ kind: 'bearer' });
  assert.match(b.call({ authorization: 'Bearer x.y.z' }).headers['WWW-Authenticate'], /^Bearer error="invalid_token"/);
});

test('mTLS (simulated): matching thumbprint allowed; missing, other or garbage refused; control off lets it through', () => {
  const r = rig({ kind: 'mtls' });
  const bearer = { authorization: `Bearer ${r.t.token}` };
  assert.equal(r.call({ ...bearer, [CERT_HEADER]: certThumbprint('client') }).status, 200);
  for (const v of [undefined, certThumbprint('attacker'), 'garbage', '']) assert.equal(code(r.call({ ...bearer, [CERT_HEADER]: v })), 'invalid_token', String(v));
  r.w.setControls({ mtls_binding: false });
  assert.equal(r.call(bearer).status, 200);
});

test('setControls refuses unknown ids, non-boolean values and non-objects', () => {
  const { w } = setup();
  for (const bad of [null, [], 'x', { nope: true }, { audience: 'yes' }, { audience: 1 }, { __proto__: { x: 1 }, constructor: true }]) assert.throws(() => w.setControls(bad), /./);
  assert.deepEqual(Object.keys(w.gateway.controls), CONTROL_IDS);
});

test('the access token itself can never be skipped: signature and expiry have no toggle', () => {
  const r = rig({ kind: 'bearer' });
  r.w.setControls(Object.fromEntries(CONTROL_IDS.map((c) => [c, false])));
  const [h, p] = r.t.token.split('.');
  assert.equal(r.call({ authorization: `Bearer ${h}.${p}.AAAA` }).status, 401);
  r.w.clock.advance(7200);
  assert.equal(r.call({ authorization: `Bearer ${r.t.token}` }).status, 401);
});

test('an access token with the right key but the wrong issuer is refused', () => {
  const r = rig({ kind: 'bearer' });
  const as = fixtureKey('mock-authorization-server'); // same deterministic fixture the mock AS signs with
  const good = signJwt({ alg: 'ES256', typ: 'at+jwt' }, { ...r.t.claims }, as.privateKey);
  assert.equal(r.call({ authorization: `Bearer ${good}` }).status, 200);
  const wrong = signJwt({ alg: 'ES256', typ: 'at+jwt' }, { ...r.t.claims, iss: 'https://elsewhere.example' }, as.privateKey);
  const out = r.call({ authorization: `Bearer ${wrong}` });
  assert.equal(code(out), 'invalid_token'); assert.match(out.body.error_description, /issuer/);
});

test('the access token header must be ES256 / at+jwt: a typ of JWT or an alg of none is refused even when the signature is good', () => {
  const r = rig({ kind: 'bearer' });
  const as = fixtureKey('mock-authorization-server');
  const bad = signJwt({ alg: 'ES256', typ: 'JWT' }, { ...r.t.claims }, as.privateKey);
  const out = r.call({ authorization: `Bearer ${bad}` });
  assert.equal(out.status, 401); assert.match(out.body.error_description || JSON.stringify(out.log), /ES256 \/ at\+jwt/);
  assert.equal(r.call({ authorization: `Bearer ${r.t.token}` }).status, 200);
});

test('audience is matched exactly: a string aud that merely contains the resource does not pass', () => {
  const r = rig({ kind: 'bearer' });
  const as = fixtureKey('mock-authorization-server');
  const sneaky = signJwt({ alg: 'ES256', typ: 'at+jwt' }, { ...r.t.claims, aud: `https://${r.c.host_a}.evil.example/x` }, as.privateKey);
  assert.equal(r.call({ authorization: `Bearer ${sneaky}` }).status, 401);
  const scalar = signJwt({ alg: 'ES256', typ: 'at+jwt' }, { ...r.t.claims, aud: `https://${r.c.host_a}` }, as.privateKey);
  assert.equal(r.call({ authorization: `Bearer ${scalar}` }).status, 200);
});

test('a DPoP proof jti longer than 200 characters is refused as malformed', () => {
  const r = rig();
  assert.equal(r.dp({ jti: 'x'.repeat(201) }).status, 401);
  assert.equal(r.dp({ jti: 'x'.repeat(200) }).status, 200);
});

test('jti memory outlives the clock moving inside the iat window: a replay 30s later is still refused', () => {
  const r = rig(); const p = r.proof(); const h = { authorization: `DPoP ${r.t.token}`, dpop: p };
  assert.equal(r.call(h).status, 200);
  r.w.clock.advance(30);
  const again = r.call(h);
  assert.equal(again.status, 401);
  assert.match(again.body.error_description, /iat|jti/);
  const fresh = r.dp(); assert.equal(fresh.status, 200, 'a fresh proof still passes');
});

test('a full jti cache fails closed instead of forgetting', async () => {
  const { createGateway } = await import('../src/gateway.js');
  const r = rig();
  const gw = createGateway({ clock: r.w.clock, as: r.w.as, apis: r.w.apis, jtiMax: 2 });
  const go = () => gw.evaluate({ method: 'GET', url: r.url(), headers: { authorization: `DPoP ${r.t.token}`, dpop: r.proof({ nonce: gw.currentNonce() }) } });
  assert.equal(go().status, 200); assert.equal(go().status, 200);
  const third = go();
  assert.equal(third.status, 401); assert.match(third.body.error_description, /cache is full/);
  r.w.clock.advance(121);
  assert.equal(go().status, 200, 'entries expire and space frees up');
});

test('a token with both cnf.jkt and cnf x5t#S256 must satisfy both bindings', () => {
  const r = rig();
  const claims = { ...r.t.claims, cnf: { jkt: r.key.jkt, 'x5t#S256': certThumbprint('client') } };
  const token = signJwt({ alg: 'ES256', typ: 'at+jwt', kid: 'mock-as-1' }, claims, fixtureKey('mock-authorization-server').privateKey);
  // A fresh proof per attempt: every attempt that reaches the proof pipeline consumes its jti, so reusing one would test the replay check instead.
  const proof = (jti) => signJwt({ typ: 'dpop+jwt', alg: 'ES256', jwk: r.key.publicJwk }, { jti, htm: 'GET', htu: r.url(), iat: r.now(), nonce: r.w.gateway.currentNonce(), ath: sha256b64u(token) }, r.key.privateKey);
  const noCert = r.call({ authorization: `DPoP ${token}`, dpop: proof('dual-1') });
  assert.equal(noCert.status, 401); assert.equal(noCert.log.at(-1).control, 'mtls_binding');
  const wrong = r.call({ authorization: `DPoP ${token}`, dpop: proof('dual-2'), [CERT_HEADER]: certThumbprint('attacker') });
  assert.equal(wrong.status, 401); assert.equal(wrong.log.at(-1).control, 'mtls_binding');
  assert.match(wrong.log.at(-1).detail, /thumbprint does not match/);
  assert.equal(r.call({ authorization: `DPoP ${token}`, dpop: proof('dual-3'), [CERT_HEADER]: certThumbprint('client') }).status, 200);
});
