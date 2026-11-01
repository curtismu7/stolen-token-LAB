import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealth } from '../src/health.js';

const run = async (runChecks) => { const h = createHealth({ runChecks, intervalMs: 3_600_000 }); await h.ready; h.stop(); return h; };
const get = (h) => new Promise((resolve) => { const res = { set() {}, json: resolve }; h.router.stack[0].route.stack[0].handle({}, res); });

test('health state follows the checks: ready, broken, unknown', async () => {
  assert.equal((await get(await run(async () => [{ level: 'pass' }]))).state, 'ready');
  assert.equal((await get(await run(async () => [{ level: 'fail' }]))).state, 'broken');
  assert.equal((await get(await run(async () => { throw new Error('x'); }))).state, 'unknown');
});
