import http from 'node:http';
import { createApp, startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { createWorld } from '../src/world.js';
import { getVertical } from '../src/stories.js';

export const vertical = (id = 'travel') => getVertical(id);
export const world = (id = 'travel') => createWorld({ vertical: vertical(id) });

// Build and send one request through the mock gateway of a world; returns the gateway result plus the world.
export function setup(id = 'travel') {
  const w = world(id);
  const c = vertical(id).cast;
  return { w, c, url: (p = c.path_read, api = 'a') => `https://${api === 'a' ? c.host_a : c.host_b}${p}` };
}

export async function withServer(fn) {
  const health = createHealth({ intervalMs: 3_600_000 });
  await health.ready;
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health }) });
  try { await fn(url.replace(/\/$/, '')); } finally { health.stop(); await new Promise((r) => server.close(r)); }
}

// fetch cannot set Host; node:http can.
export function rawHttp(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent: false }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
