// One Express app. /api = the lab API: scenarios, mutation proof, and a live world (mock AS + mock gateway with toggles).
// Loopback Host check and same-origin writes on everything. Serves web/dist when it exists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { makeHostCheck, makeSameOriginWrites, scanHosts, scanKeys } from './safety.js';
import { createHealth } from './health.js';
import { createWorld, MAX_STEPS } from './world.js';
import { CONTROLS, IAT_WINDOW_S } from './gateway.js';
import { runScenario, runAll, mutationProof } from './runner.js';
import { SCENARIOS, VERTICALS, getScenario, getVertical, storyCorpus, renderScenario } from './stories.js';
import { DIAGRAM_NAMES, buildDiagram } from './diagramData.js';
import { LIVE_REFUSAL, modeInfo, modeOf, rule19Info } from './mode.js';
import { shelfInfo } from './shelfLink.js';

const WEB_DIST = process.env.WEB_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const bad = (res, message, status = 400) => res.status(status).json({ error: status === 404 ? 'not_found' : 'bad_request', message });
export const BANNER = 'MOCK mode. SIMULATED: mock gateway, mock authorization server and mock tokens. No tenant, no outbound network. The mTLS defence is a simulation (no real TLS).';

export function createApp({ health = createHealth(), proxyHosts = new Set() } = {}) {
  const live = new Map(); // vertical id -> live world; POST /api/reset empties it
  let epoch = 0;          // counts resets, so a page opened elsewhere can notice one made through the API or the script
  const liveWorld = (vid) => { if (!live.has(vid)) live.set(vid, createWorld({ vertical: getVertical(vid), start: Date.now() })); return live.get(vid); };
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(proxyHosts));
  app.use(makeSameOriginWrites(proxyHosts));
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

  const api = express.Router();
  api.use(express.json({ limit: '16kb' }));
  api.use('/health', health.router);
  // Mock | Live: this lab has no live engine. A write that asks for Live is refused with the honest message, whatever else it carries.
  api.use((req, res, next) => {
    const asked = req.body?.mode;
    if (asked === undefined) return next();
    if (asked === 'live') return res.status(409).json({ error: 'live_unavailable', message: LIVE_REFUSAL });
    if (modeOf(asked) === null) return bad(res, 'mode must be mock or live');
    return next();
  });
  const vertical = (req, res) => { const id = req.body?.vertical ?? req.query.vertical ?? VERTICALS[0].id; const v = typeof id === 'string' ? getVertical(id) : null; if (!v) bad(res, 'unknown vertical'); return v; };

  api.get('/info', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ...modeInfo(), ...rule19Info(), version: health.DEMO.version || null, banner: BANNER, epoch }); });
  // Rule 19: POST /api/mode {source:"mock"|"real"}. This lab is mock only: real is a 409 with the honest reason.
  api.post('/mode', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const b = req.body;
    if (b === null || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 1 || !['mock', 'real'].includes(b.source)) return bad(res, 'body must be exactly {source: "mock" or "real"}');
    if (b.source === 'real') return res.status(409).json({ error: 'real_not_available', message: LIVE_REFUSAL });
    return res.json({ ...modeInfo(), ...rule19Info(), banner: BANNER, epoch });
  });
  // The header toggle asks here. Live is answered with data (HTTP 200, accepted false) so the page can say why without a console error.
  api.get('/mode', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const requested = modeOf(req.query.requested);
    if (!requested) return bad(res, 'requested must be mock or live');
    return res.json({ ...modeInfo(), requested, accepted: requested === 'mock', message: requested === 'live' ? LIVE_REFUSAL : 'Mock mode.' });
  });
  api.get('/diagram', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    res.set('Cache-Control', 'no-store');
    return res.json(buildDiagram(v.cast, DIAGRAM_NAMES.includes(req.query.name) ? req.query.name : DIAGRAM_NAMES[0]));
  });
  api.get('/catalog', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    return res.json({
      banner: BANNER, mode: 'mock', iatWindowSeconds: IAT_WINDOW_S,
      verticals: VERTICALS.map(({ id, name, cast }) => ({ id, name, cast })), vertical: v.id, controls: CONTROLS,
      scenarios: SCENARIOS.map((s) => { const r = renderScenario(s, v); return { id: r.id, slug: r.slug, kind: r.kind, title: r.title, takeaway: r.takeaway, talk: r.talk, stolen: r.stolen, defence: r.defence, blockedBy: r.blockedBy, expected: r.expect, rfc: r.rfc, steps: r.steps.length }; }),
    });
  });
  api.post('/run', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    const { scenario, off = [] } = req.body || {};
    if (typeof scenario !== 'string' || !getScenario(scenario)) return bad(res, 'scenario must be a known id or slug');
    if (!Array.isArray(off) || off.length > 20 || !off.every((c) => CONTROLS.some((k) => k.id === c))) return bad(res, 'off must be a list of control ids');
    return res.json({ banner: BANNER, ...runScenario(scenario, v.id, { off }) });
  });
  api.post('/run-all', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    const results = runAll(v.id);
    return res.json({ banner: BANNER, vertical: v.id, total: results.length, passed: results.filter((r) => r.pass).length, results });
  });
  api.post('/mutation', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    const { scenario } = req.body || {};
    if (typeof scenario !== 'string' || !getScenario(scenario)) return bad(res, 'scenario must be a known id or slug');
    return res.json({ banner: BANNER, ...mutationProof(scenario, v.id) });
  });

  // The live world: toggle controls and run steps by hand. Same step grammar as the scenarios, same validation.
  api.get('/live', (req, res) => { const v = vertical(req, res); if (!v) return undefined; const w = liveWorld(v.id); return res.json({ banner: BANNER, vertical: v.id, controls: { ...w.gateway.controls }, results: w.results }); });
  api.put('/live/controls', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    try { return res.json({ controls: liveWorld(v.id).setControls(req.body?.controls) }); } catch (e) { return bad(res, e.message); }
  });
  api.post('/live/step', (req, res) => {
    const v = vertical(req, res); if (!v) return undefined;
    const w = liveWorld(v.id);
    if (w.results.length >= MAX_STEPS * 5) return bad(res, 'live world is full: POST /api/reset');
    try { return res.json({ banner: BANNER, result: w.exec(req.body?.step) }); } catch (e) { return bad(res, e.message); }
  });
  api.post('/reset', (_req, res) => { live.clear(); epoch += 1; res.json({ ok: true, epoch, reset: 'live worlds, tokens, captured requests, jti cache, nonce and controls cleared' }); });
  api.get('/safety-scan', (_req, res) => {
    const offenders = storyCorpus().map(({ where, text }) => ({ where, hosts: scanHosts(text), keys: scanKeys(text) })).filter((x) => x.hosts.length || x.keys.length);
    res.json({ ok: offenders.length === 0, offenders });
  });
  api.use((_req, res) => bad(res, 'no such endpoint', 404));
  api.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err.type === 'entity.parse.failed') return bad(res, 'request body is not valid JSON');
    console.error('[stolen-token-lab] api error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  });
  app.get('/api/shelf', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(shelfInfo()); }); // the header "Shelf" button
  app.use('/api', api);

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }
  // The last two handlers catch everything left, for every method and path: Express's defaults would print the path the visitor typed.
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = Number(err?.status || err?.statusCode);
    if (status >= 400 && status < 500) return res.status(status).json({ error: status === 413 ? 'payload_too_large' : 'bad_request' });
    return res.status(500).json({ error: 'server_error' });
  });
  return app;
}

export function startHttpServer({ port, host, app = createApp() } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` }));
    server.once('error', reject);
  });
}
