import test from 'node:test';
import assert from 'node:assert/strict';
import { createAs } from '../src/as.js';

const as = createAs({ clock: { now: () => 1_700_000_000_000 } });
const base = { sub: 'u', clientId: 'c', audience: 'https://api.example/' };

test('every issued token is labelled mock: true', () => {
  for (const kind of ['bearer', 'dpop', 'mtls']) assert.equal(as.issue({ ...base, kind }).claims.mock, true);
});

test('a DPoP token is bound to its holder key: different holders get different jkt', () => {
  const a = as.issue({ ...base, kind: 'dpop', holder: 'client' }).claims.cnf.jkt;
  const b = as.issue({ ...base, kind: 'dpop', holder: 'attacker' }).claims.cnf.jkt;
  assert.ok(a && b); assert.notEqual(a, b);
  assert.equal(as.issue({ ...base, kind: 'bearer' }).claims.cnf, undefined);
});
