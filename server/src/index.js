import { installNetguard } from './netguard.js';
import { startHttpServer, createApp } from './app.js';
import { allPassed, runChecks } from './doctor.js';
import { assertBindAllowed, bindHost, parseAllowedHosts, proxyHostSet, resolvePort } from './safety.js';

const allowedNames = parseAllowedHosts(); // LAB_ALLOWED_HOSTS, before any server or timer starts
const port = resolvePort();

installNetguard(); // before anything else can open a socket

const checks = await runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[stolen-token-lab] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
const host = assertBindAllowed(bindHost(), process.env);
const { url } = await startHttpServer({ port, host, app: createApp({ proxyHosts: proxyHostSet(allowedNames, port) }) });
console.log(`[stolen-token-lab] mock AS + mock gateway at ${url} (Mock mode only; loopback, no outbound network, SIMULATED)`);
console.log(`[stolen-token-lab] health: ${url}api/health | catalog: ${url}api/catalog | run: POST ${url}api/run`);
