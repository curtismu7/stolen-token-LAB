// reset.mjs: a lab that is not running gives a clear message naming the origin, not a raw fetch failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { reset } from './reset.mjs';

test('reset against a closed loopback port says no lab is listening, and names the origin', async () => {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  const base = `http://127.0.0.1:${port}`;
  await assert.rejects(reset(base), (e) => e.message.startsWith(`no lab is listening at ${base}`));
});
