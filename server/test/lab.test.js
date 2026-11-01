// The -LAB standard pieces: Mock | Live (Live refused), the diagram as diagram-studio/1 data, the reset epoch, fixed JSON for unknown paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, rawHttp } from './helpers.js';
import { DIAGRAM_NAMES, buildDiagram, loadDiagram, rawDiagram } from '../src/diagramData.js';
import { validateDiagram } from '../src/diagramStudioValidate.js';
import { LIVE_REFUSAL, MODES, modeInfo, modeOf } from '../src/mode.js';
import { VERTICALS } from '../src/stories.js';

const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('mode: Mock is the only mode that runs, and Live is refused with the honest message', () => {
  assert.deepEqual(MODES, ['mock', 'live']);
  assert.equal(modeOf('mock'), 'mock'); assert.equal(modeOf('live'), 'live'); assert.equal(modeOf('MODE'), null); assert.equal(modeOf(undefined), null);
  const i = modeInfo();
  assert.equal(i.mode, 'mock'); assert.equal(i.liveAvailable, false); assert.equal(i.liveRefusal, LIVE_REFUSAL);
  assert.match(LIVE_REFUSAL, /no live engine/); assert.match(LIVE_REFUSAL, /Mock mode/);
});

test('GET /api/info and GET /api/mode: the toggle asks, Live is answered with data (200, accepted false), junk is a 400 that does not echo it', async () => {
  await withServer(async (b) => {
    const info = await (await fetch(`${b}/api/info`)).json();
    assert.equal(info.mode, 'mock'); assert.equal(info.liveAvailable, false); assert.equal(typeof info.epoch, 'number'); assert.match(info.banner, /^MOCK mode/);
    const live = await fetch(`${b}/api/mode?requested=live`); const lj = await live.json();
    assert.equal(live.status, 200); assert.equal(lj.accepted, false); assert.equal(lj.mode, 'mock'); assert.equal(lj.message, LIVE_REFUSAL);
    const mock = await (await fetch(`${b}/api/mode?requested=mock`)).json();
    assert.equal(mock.accepted, true); assert.equal(mock.mode, 'mock');
    const junk = await fetch(`${b}/api/mode?requested=zzz-secret-value`);
    assert.equal(junk.status, 400); assert.ok(!(await junk.text()).includes('zzz-secret-value'));
    assert.equal((await fetch(`${b}/api/mode`)).status, 400);
  });
});

test('a write that asks for Live is refused 409 live_unavailable on every write route; mock and no mode still work; a junk mode is 400', async () => {
  await withServer(async (b) => {
    for (const [method, route, body] of [['POST', '/api/run', { scenario: 'S01' }], ['POST', '/api/run-all', {}], ['POST', '/api/mutation', { scenario: 'S01' }], ['PUT', '/api/live/controls', { controls: {} }], ['POST', '/api/live/step', { step: { op: 'advance', seconds: 1 } }], ['POST', '/api/reset', {}]]) {
      const r = await fetch(b + route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, mode: 'live' }) });
      assert.equal(r.status, 409, `${method} ${route}`);
      const j = await r.json(); assert.equal(j.error, 'live_unavailable'); assert.equal(j.message, LIVE_REFUSAL);
      const bad = await fetch(b + route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, mode: 'zzz-secret-value' }) });
      assert.equal(bad.status, 400, `${method} ${route} junk mode`); assert.ok(!(await bad.text()).includes('zzz-secret-value'));
    }
    assert.equal((await post(b, '/api/run', { scenario: 'S01', mode: 'mock' })).status, 200);
    assert.equal((await post(b, '/api/run', { scenario: 'S01' })).status, 200);
  });
});

test('the catalog and the banner say Mock mode, and the banner still says what is simulated, mTLS included', async () => {
  await withServer(async (b) => {
    const c = await (await fetch(`${b}/api/catalog`)).json();
    assert.equal(c.mode, 'mock'); assert.match(c.banner, /^MOCK mode\. SIMULATED/); assert.match(c.banner, /mTLS/);
    assert.equal((await (await post(b, '/api/run', { scenario: 'S01' })).json()).banner, c.banner);
  });
});

test('reset bumps the epoch, so a page opened elsewhere notices a reset made through the API or the script', async () => {
  await withServer(async (b) => {
    const e0 = (await (await fetch(`${b}/api/info`)).json()).epoch;
    const r = await (await post(b, '/api/reset', {})).json();
    assert.equal(r.epoch, e0 + 1);
    assert.equal((await (await fetch(`${b}/api/info`)).json()).epoch, e0 + 1);
  });
});

test('the diagram is diagram-studio/1 data loaded by name: valid, no overlapping boxes, short edge labels, tokens filled per vertical, unknown name falls back', async () => {
  assert.deepEqual(DIAGRAM_NAMES, ['replay']);
  for (const n of DIAGRAM_NAMES) {
    assert.deepEqual(validateDiagram(loadDiagram(n)), []);
    const d = rawDiagram(n);
    assert.equal(d.schema, 'diagram-studio/1');
    const boxes = d.nodes.map((x) => ({ x: x.x, y: x.y })); // a box is about 230 by 100
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(Math.abs(boxes[i].x - boxes[j].x) >= 260 || Math.abs(boxes[i].y - boxes[j].y) >= 130, `${d.nodes[i].id} and ${d.nodes[j].id} overlap`);
    assert.ok(d.edges.every((e) => typeof e.id === 'string' && e.label.length <= 24), 'every edge has a key and a short label');
    assert.equal(new Set(d.edges.map((e) => e.id)).size, d.edges.length);
    for (const v of VERTICALS) assert.ok(!/\{\{/.test(JSON.stringify(buildDiagram(v.cast, n))), `${v.id}: an undefined token`);
  }
  assert.equal(buildDiagram(VERTICALS[1].cast).nodes.find((x) => x.id === 'api_a').label, VERTICALS[1].cast.api_a);
  assert.equal(buildDiagram(VERTICALS[0].cast, 'nope').id, 'replay');
  assert.ok(validateDiagram({ ...rawDiagram('replay'), schema: 'x' }).length > 0);
  await withServer(async (b) => {
    const j = await (await fetch(`${b}/api/diagram?vertical=banking&name=replay`)).json();
    assert.equal(j.schema, 'diagram-studio/1'); assert.equal(j.nodes.find((x) => x.id === 'api_b').label, 'cards-api');
    assert.equal((await fetch(`${b}/api/diagram?vertical=nope`)).status, 400);
    assert.equal((await fetch(`${b}/api/diagram?name=zzz-secret-value`).then((r) => r.json())).id, 'replay');
  });
});

test('every path that is left gets fixed JSON that never echoes the path, for any method', async () => {
  await withServer(async (b) => {
    for (const [method, p] of [['POST', '/zzz-secret-path'], ['DELETE', '/zzz-secret-path'], ['PATCH', '/api/zzz-secret-path'], ['GET', '/api/zzz-secret-path']]) {
      const r = await rawHttp(b + p, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${p}`); assert.ok(!r.text.includes('zzz-secret'), `${method} ${p} echoed the path`);
      assert.equal(JSON.parse(r.text).error.length > 0, true);
    }
  });
});
