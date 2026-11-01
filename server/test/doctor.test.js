import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, allPassed } from '../src/doctor.js';
import { scanKeys } from '../src/safety.js';

test('doctor passes on a clean default environment and names every check', async () => {
  const checks = await runChecks({ env: {} });
  assert.ok(allPassed(checks), JSON.stringify(checks.filter((c) => c.level === 'fail')));
  assert.deepEqual(checks.map((c) => c.id), ['node', 'bind', 'port-range', 'story-hosts', 'story-keys', 'story-tokens', 'netguard', 'scenarios', 'mutation', 'crypto', 'diagrams', 'mode', 'tenant']);
});

test('doctor fails on a bad port and on a non-loopback bind without opt-in', async () => {
  assert.equal((await runChecks({ env: { PORT: '5000' } })).find((c) => c.id === 'port-range').level, 'fail');
  assert.equal((await runChecks({ env: { PORT: '8080' } })).find((c) => c.id === 'port-range').level, 'fail');
  assert.equal((await runChecks({ env: { STLAB_BIND: '0.0.0.0' } })).find((c) => c.id === 'bind').level, 'pass', 'opt-in is allowed');
});

test('doctor never prints a key or a token', async () => {
  const text = JSON.stringify(await runChecks({ env: {} }));
  assert.deepEqual(scanKeys(text), []);
});
