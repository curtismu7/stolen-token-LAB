import test from 'node:test';
import assert from 'node:assert/strict';
import { world } from './helpers.js';
import { stepProblem, MAX_STEPS } from '../src/world.js';

const issue = { op: 'issue', id: 't1', kind: 'dpop' };
const call = { op: 'call', id: 'c1', who: 'client', token: 't1', scheme: 'DPoP', proof: { key: 'client' } };

test('stepProblem accepts the grammar and refuses everything else', () => {
  assert.equal(stepProblem(issue), null); assert.equal(stepProblem(call), null);
  assert.equal(stepProblem({ op: 'advance', seconds: 5 }), null); assert.equal(stepProblem({ op: 'rotate-nonce' }), null);
  const bad = [null, [], 'x', 5, {}, { op: 'eval' }, { op: 'issue' }, { ...issue, kind: 'jwt' }, { ...issue, holder: 'root' }, { ...issue, id: 'A B' }, { ...issue, id: '__proto__' }, { ...issue, extra: 1 },
    { ...issue, ttl: 0 }, { ...issue, ttl: 1e9 }, { ...issue, scope: '<script>' }, { op: 'advance', seconds: -1 }, { op: 'advance', seconds: 1e9 }, { op: 'advance', seconds: NaN }, { op: 'advance' },
    { ...call, who: 'root' }, { ...call, method: 'TRACE' }, { ...call, path: 'no-slash' }, { ...call, path: '/a b' }, { ...call, path: `/${'a'.repeat(300)}` }, { ...call, scheme: 'Basic' }, { ...call, proof: { key: 'client', evil: 1 } },
    { ...call, proof: { key: 'root' } }, { ...call, proof: { key: 'client', iat: 1e9 } }, { ...call, proof: { key: 'client', nonce: 'x' } }, { ...call, token: undefined }, { ...call, expect: { status: 'x' } }, { ...call, expect: { status: 200, extra: 1 } },
    JSON.parse('{"op":"issue","id":"t1","kind":"dpop","__proto__":{"x":1}}'), JSON.parse('{"op":"call","id":"c","who":"client","token":"t1","constructor":{}}')];
  for (const b of bad) assert.ok(stepProblem(b), JSON.stringify(b)?.slice(0, 60));
});

test('exec refuses an invalid step, an unknown token and an unknown replay', () => {
  const w = world();
  assert.throws(() => w.exec({ op: 'nope' }), /op must be/);
  assert.throws(() => w.exec(call), /no token/);
  w.exec(issue);
  assert.throws(() => w.exec({ op: 'call', id: 'r', who: 'attacker', replay: 'missing' }), /no step/);
});

test('free text in say is carried as data only (never interpreted)', () => {
  const w = world();
  const r = w.exec({ ...issue, say: '<img src=x onerror=alert(1)>' });
  assert.equal(r.say, '<img src=x onerror=alert(1)>');
});

test('the virtual clock moves only on advance; tokens expire on it', () => {
  const w = world();
  w.exec({ op: 'issue', id: 't1', kind: 'bearer', ttl: 60 });
  const ok = w.exec({ op: 'call', id: 'a', who: 'client', token: 't1', scheme: 'Bearer', expect: { status: 200 } });
  assert.equal(ok.pass, true);
  w.exec({ op: 'advance', seconds: 61 });
  const late = w.exec({ op: 'call', id: 'b', who: 'client', token: 't1', scheme: 'Bearer' });
  assert.equal(late.status, 401);
});

test('a captured-in-flight request is never delivered: the jti stays fresh, the gateway never saw it', () => {
  const w = world();
  w.exec(issue);
  const cap = w.exec({ ...call, id: 'cap', send: false });
  assert.equal(cap.captured, true); assert.equal(cap.status, undefined);
  assert.equal(w.exec({ op: 'call', id: 'go', who: 'attacker', replay: 'cap', expect: { status: 200 } }).pass, true);
});

test('worlds are isolated: tokens and jti caches do not leak between worlds', () => {
  const a = world(); const b = world();
  a.exec(issue);
  assert.throws(() => b.exec(call), /no token/);
});

test('MAX_STEPS is a sane bound', () => assert.ok(MAX_STEPS >= 10 && MAX_STEPS <= 100));

test('an issue step carries a trace: traceparent plus the raw token request and response; a clock advance has none', () => {
  const w = world();
  const i = w.exec({ op: 'issue', id: 't1', kind: 'dpop' });
  assert.match(i.trace.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.match(i.trace.request, /^POST \/mock\/token HTTP\/1\.1\nHost: as\.example/);
  assert.match(i.trace.response, /"access_token": "eyJ/);
  assert.equal(w.exec({ op: 'advance', seconds: 1 }).trace, undefined);
});

test('rotate-nonce invalidates the previously learned nonce; the stale option is always refused', () => {
  const w = world();
  w.exec(issue);
  const first = w.exec({ ...call, id: 'c0', proof: { key: 'client', nonce: 'none' } });
  assert.equal(first.error, 'use_dpop_nonce'); // learns mock-nonce-1 from the 401
  assert.equal(w.exec({ ...call, id: 'c1', proof: { key: 'client', nonce: 'learned' } }).status, 200);
  const rot = w.exec({ op: 'rotate-nonce', id: 'r' });
  assert.match(rot.note, /mock-nonce-2/);
  assert.equal(w.gateway.currentNonce(), 'mock-nonce-2');
  const old = w.exec({ ...call, id: 'c2', proof: { key: 'client', nonce: 'learned' } });
  assert.equal(old.status, 401); assert.equal(old.error, 'use_dpop_nonce');
  assert.equal(w.exec({ ...call, id: 'c3', proof: { key: 'client', nonce: 'stale' } }).error, 'use_dpop_nonce');
  assert.equal(w.exec({ ...call, id: 'c4', proof: { key: 'client', nonce: 'current' } }).status, 200);
});
