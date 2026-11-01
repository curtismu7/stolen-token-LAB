// The doctor script end to end: it exits 0 with PASS lines on a free port, and 1 on a port outside the range.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./doctor.mjs', import.meta.url));
const free = async () => {
  for (let p = 4990; p <= 4999; p++) { const ok = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); }); if (ok) return p; }
  throw new Error('no free port in 4990-4999');
};
const run = (port) => spawnSync(process.execPath, [script], { env: { ...process.env, PORT: String(port) }, encoding: 'utf8', timeout: 120000 });

test('doctor passes on a free port and names the http cycle, the diagrams and the mode', async () => {
  const r = run(await free());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const id of ['http-cycle', 'diagrams', 'mode', 'netguard', 'port-free']) assert.match(r.stdout, new RegExp(`PASS  ${id}:`));
  assert.match(r.stdout, /7\/7/);
});

test('doctor fails (exit 1) when the port is outside 4950-4999', () => {
  const r = run(5000);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL  port-range/);
});
