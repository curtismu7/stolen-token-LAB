import test from 'node:test';
import assert from 'node:assert/strict';
import { childTraceparent, newTraceparent, TRACEPARENT, rawRequest, rawResponse, envelope } from '../src/trace.js';

test('raw request and response carry the full mock token (tokens are shown raw)', () => {
  const jwt = ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJ1In0', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('.');
  assert.ok(rawRequest({ method: 'GET', host: 'h.example', path: '/x', headers: { Authorization: `DPoP ${jwt}` } }).includes(jwt));
  assert.ok(rawResponse({ status: 200, body: { access_token: jwt } }).includes(jwt));
});

test('traceparent: valid shape, a caller trace id is kept, a bad or all-zero one is replaced', () => {
  assert.match(newTraceparent(), TRACEPARENT);
  const tp = newTraceparent();
  assert.equal(childTraceparent(tp).split('-')[1], tp.split('-')[1]);
  assert.notEqual(childTraceparent(tp), tp);
  for (const bad of [undefined, 'x', `00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`, `00-${'a'.repeat(32)}-${'0'.repeat(16)}-01`, `ff-${'a'.repeat(32)}-${'b'.repeat(16)}-01`]) assert.match(childTraceparent(bad), TRACEPARENT);
});

test('raw request/response look like the wire and the envelope carries the trace id', () => {
  assert.equal(rawRequest({ method: 'GET', host: 'h.example', path: '/x', headers: { A: 'b' } }), 'GET /x HTTP/1.1\nHost: h.example\nA: b');
  assert.match(rawResponse({ status: 401, headers: { 'WWW-Authenticate': 'x' }, body: { error: 'e' } }), /^HTTP\/1\.1 401 Unauthorized\nWWW-Authenticate: x\n\n\{/);
  const tp = newTraceparent();
  assert.equal(envelope({ traceparent: tp }).traceId, tp.split('-')[1]);
});
