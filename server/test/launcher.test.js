// Behind the family lab-proxy (the launcher at local.ping-devops.com:8443): Host is this lab's LAB_ALLOWED_HOSTS
// name with its port, the browser's Origin is the proxy's, and the proxy says so in X-Forwarded-Host/-Proto.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { parseAllowedHosts, proxyHostSet } from '../src/safety.js';
import { rawHttp } from './helpers.js';

const NAME = 'stolen-token-lab.local.ping-devops.com';
const XFH = 'local.ping-devops.com:8443';
const PROXY = `https://${XFH}`;

async function withLab(fn) {
  const health = createHealth({ intervalMs: 3_600_000 });
  await health.ready;
  const proxyHosts = new Set();
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, proxyHosts }) });
  const port = server.address().port;
  for (const h of proxyHostSet(parseAllowedHosts({ LAB_ALLOWED_HOSTS: ` ${NAME.toUpperCase()} ` }), port)) proxyHosts.add(h);
  try { await fn(url.replace(/\/$/, ''), port); } finally { health.stop(); await new Promise((r) => server.close(r)); }
}
const post = (base, headers) => rawHttp(`${base}/api/reset`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
const fwd = { 'x-forwarded-host': XFH, 'x-forwarded-proto': 'https' };

test('LAB_ALLOWED_HOSTS: unset is loopback only; names are lower-cased; a port or path is refused at start', () => {
  assert.deepEqual(parseAllowedHosts({}), []);
  assert.deepEqual(parseAllowedHosts({ LAB_ALLOWED_HOSTS: 'A.example, b.example,' }), ['a.example', 'b.example']);
  for (const bad of ['a.example:4950', 'http://a.example', 'a.example/x']) assert.throws(() => parseAllowedHosts({ LAB_ALLOWED_HOSTS: bad }));
});

test('launcher Host <name>:<port> is accepted on a read; the bare name, another port, or a foreign Host is refused', async () => {
  await withLab(async (base, port) => {
    assert.equal((await rawHttp(`${base}/api/health`, { headers: { host: `${NAME}:${port}` } })).status, 200);
    for (const host of [NAME, `${NAME}:1`, `local.ping-devops.com:${port}`, 'local.ping-devops.com:8443', `evil.example:${port}`]) {
      assert.equal((await rawHttp(`${base}/api/health`, { headers: { host } })).status, 403, host);
    }
  });
});

test('a proxied same-origin write is accepted; a foreign or mismatched Origin is refused', async () => {
  await withLab(async (base, port) => {
    const host = `${NAME}:${port}`;
    assert.equal((await post(base, { host, ...fwd, origin: PROXY, 'sec-fetch-site': 'same-origin' })).status, 200);
    for (const origin of ['https://evil.example', `http://${XFH}`, `https://${XFH.split(':')[0]}`]) {
      assert.equal((await post(base, { host, ...fwd, origin })).status, 403, origin);
    }
    assert.equal((await post(base, { host, ...fwd, 'x-forwarded-proto': 'ftp', origin: `ftp://${XFH}` })).status, 403);
    assert.equal((await post(base, { host, 'x-forwarded-proto': 'https', origin: 'https://' })).status, 403, 'empty X-Forwarded-Host');
    assert.equal((await post(base, { host, 'x-forwarded-host': XFH, origin: PROXY })).status, 403, 'no X-Forwarded-Proto');
  });
});

test('forwarded headers on a loopback Host are ignored; a Host outside the set is refused before any Origin check', async () => {
  await withLab(async (base, port) => {
    assert.equal((await post(base, { host: `127.0.0.1:${port}`, ...fwd, origin: PROXY })).status, 403);
    assert.equal((await post(base, { host: `localhost:${port}`, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', origin: 'https://evil.example' })).status, 403);
    const res = await post(base, { host: `evil.example:${port}`, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.match(res.text, /bad_host/);
  });
});
