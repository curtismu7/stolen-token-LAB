import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, rawHttp } from './helpers.js';

const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('GET /api/health is demo-health/1, ready, no extra fields, no-store, GET only', async () => {
  await withServer(async (b) => {
    const r = await fetch(`${b}/api/health`); const j = await r.json();
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(j).sort(), ['at', 'demo', 'runtime', 'schema', 'state']);
    assert.equal(j.schema, 'demo-health/1'); assert.equal(j.state, 'ready'); assert.equal(j.runtime, 'offline');
    assert.equal(j.demo.id, 'stolen-token-lab');
    assert.equal((await post(b, '/api/health', {})).status, 405);
  });
});

test('catalog: banner, ten controls, every scenario, three verticals; unknown vertical is 400', async () => {
  await withServer(async (b) => {
    const j = await (await fetch(`${b}/api/catalog?vertical=banking`)).json();
    assert.match(j.banner, /SIMULATED/); assert.match(j.banner, /mTLS/);
    assert.equal(j.controls.length, 10); assert.equal(j.verticals.length, 3); assert.ok(j.scenarios.length >= 12);
    assert.match(j.scenarios[0].takeaway, /Payments agent/);
    assert.equal((await fetch(`${b}/api/catalog?vertical=nope`)).status, 400);
  });
});

test('run, run-all and mutation endpoints; every response carries the banner', async () => {
  await withServer(async (b) => {
    const r = await (await post(b, '/api/run', { scenario: 'S03' })).json();
    assert.equal(r.pass, true); assert.match(r.banner, /SIMULATED/); assert.equal(r.attackOutcome.status, 401);
    const off = await (await post(b, '/api/run', { scenario: 'dpop-no-key', off: ['dpop_binding'] })).json();
    assert.equal(off.attackOutcome.allowed, true);
    const all = await (await post(b, '/api/run-all', {})).json();
    assert.equal(all.passed, all.total);
    assert.equal((await (await post(b, '/api/mutation', { scenario: 'S05' })).json()).ok, true);
    for (const bad of [{}, { scenario: 5 }, { scenario: 'nope' }, { scenario: 'S01', off: 'x' }, { scenario: 'S01', off: ['nope'] }, { scenario: 'S01', vertical: 'x' }, { scenario: 'S01', off: Array(30).fill('audience') }]) assert.equal((await post(b, '/api/run', bad)).status, 400, JSON.stringify(bad));
  });
});

test('live world: toggle, issue, call, replay; invalid step is 400; reset clears everything', async () => {
  await withServer(async (b) => {
    const put = (body) => fetch(`${b}/api/live/controls`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ controls: { audience: false } })).status, 200);
    assert.equal((await put({ controls: { nope: false } })).status, 400);
    assert.equal((await (await fetch(`${b}/api/live`)).json()).controls.audience, false);
    assert.equal((await post(b, '/api/live/step', { step: { op: 'issue', id: 't1', kind: 'bearer' } })).status, 200);
    const c = await (await post(b, '/api/live/step', { step: { op: 'call', id: 'c1', who: 'attacker', token: 't1', api: 'b', scheme: 'Bearer' } })).json();
    assert.equal(c.result.status, 200, 'audience control is off in the live world');
    assert.equal((await post(b, '/api/live/step', { step: { op: 'eval' } })).status, 400);
    assert.equal((await post(b, '/api/live/step', {})).status, 400);
    assert.equal((await post(b, '/api/live/step', { step: { op: 'call', id: 'x', who: 'client', token: 'ghost' } })).status, 400);
    await post(b, '/api/reset', {});
    const after = await (await fetch(`${b}/api/live`)).json();
    assert.deepEqual(after.results, []); assert.equal(after.controls.audience, true);
  });
});

test('safety: bad Host refused, cross-origin write refused, big or invalid body refused, unknown route 404', async () => {
  await withServer(async (b) => {
    assert.equal((await rawHttp(`${b}/api/health`, { headers: { host: 'evil.example.invalid' } })).status, 403);
    assert.equal((await post(b, '/api/reset', {}, { origin: 'http://evil.example.invalid' })).status, 403);
    assert.equal((await post(b, '/api/reset', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await rawHttp(`${b}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'S01', pad: 'x'.repeat(20000) }) })).status, 413);
    assert.equal((await rawHttp(`${b}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).status, 400);
    assert.equal((await fetch(`${b}/api/nothing`)).status, 404);
    assert.equal((await fetch(`${b}/api/safety-scan`).then((r) => r.json())).ok, true);
  });
});

test('hostile live input: prototype pollution keys and deep nesting do not crash or pollute', async () => {
  await withServer(async (b) => {
    const r = await rawHttp(`${b}/api/live/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"step":{"op":"issue","id":"t1","kind":"bearer","__proto__":{"polluted":true}}}' });
    assert.equal(r.status, 400);
    assert.equal({}.polluted, undefined);
    const deep = `{"step":${'['.repeat(3000)}${']'.repeat(3000)}}`;
    assert.equal((await rawHttp(`${b}/api/live/step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: deep })).status, 400);
    assert.equal((await fetch(`${b}/api/health`)).status, 200, 'server still up');
  });
});

test('no outbound network was attempted while serving (netguard attempts list is empty)', async () => {
  const { installNetguard } = await import('../src/netguard.js');
  const g = installNetguard();
  try { await withServer(async (b) => { await post(b, '/api/run-all', {}); }); assert.deepEqual(g.attempts, []); } finally { g.restore(); }
});
