// Preflight: the same checks GET /api/health reports from, plus whether the port is free.
// Prints only pass/fail lines, never the value of a setting. Exit 1 on any failure. Needs no network.
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installNetguard } from '../server/src/netguard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Settings: this lab reads nothing from the shared settings file (no tenant, no credentials). PORT and STLAB_BIND come from the shell.
installNetguard(); // the doctor makes no outbound call either

const { runChecks } = await import(pathToFileURL(path.join(root, 'server/src/doctor.js')));
let failed = 0;
const report = (level, name, detail) => { if (level === 'fail') failed++; console.log(`${level.toUpperCase().padEnd(4)}  ${name}: ${detail}`); };
for (const c of await runChecks()) report(c.level, c.id, c.detail);

// A real cycle through the HTTP layer, in this process, on an ephemeral loopback port: health answers, Live is refused, a scenario runs as written.
try {
  const { createApp, startHttpServer } = await import(pathToFileURL(path.join(root, 'server/src/app.js')));
  const { createHealth } = await import(pathToFileURL(path.join(root, 'server/src/health.js')));
  const health = createHealth({ intervalMs: 3_600_000 });
  await health.ready;
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health }) });
  try {
    const base = url.replace(/\/$/, ''); const h = { 'content-type': 'application/json', origin: base };
    const hj = await (await fetch(`${base}/api/health`)).json();
    const run = await (await fetch(`${base}/api/run`, { method: 'POST', headers: h, body: JSON.stringify({ scenario: 'S03' }) })).json();
    const live = await (await fetch(`${base}/api/mode?requested=live`)).json();
    const ok = hj.schema === 'demo-health/1' && hj.state === 'ready' && run.pass === true && run.attackOutcome.status === 401 && live.accepted === false && live.mode === 'mock';
    report(ok ? 'pass' : 'fail', 'http-cycle', ok ? 'health is demo-health/1 and ready, a DPoP replay is refused (401) as written, and Live is refused (the page stays in Mock)' : 'the HTTP cycle did not behave as written');
  } finally { health.stop(); await new Promise((res) => server.close(res)); }
} catch { report('fail', 'http-cycle', 'the HTTP cycle could not run'); }

const port = Number(process.env.PORT) || 4950;
await new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', (e) => { report('fail', 'port-free', `${port} is not free (${e.code}). Start with PORT=<other port in 4950-4999> npm run doctor, or see the README, section Ports`); resolve(); });
  s.listen(port, '127.0.0.1', () => s.close(() => { report('pass', 'port-free', `${port} is free`); resolve(); }));
});
process.exit(failed ? 1 : 0);
