// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a secret, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import { assertBindAllowed, bindHost, portProblem, scanHosts, scanKeys, DEFAULT_PORT, PORT_MIN, PORT_MAX } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { storyCorpus, VERTICALS, SCENARIOS, unfilledTokens } from './stories.js';
import { runAll, mutationProof } from './runner.js';
import { fixtureKey } from './jose.js';
import { DIAGRAM_NAMES, loadDiagram } from './diagramData.js';
import { modeInfo } from './mode.js';

export async function runChecks({ env = process.env } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 26 ? 'pass' : 'fail', `v${process.versions.node} (need >= 26)`);

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.STLAB_BIND ? ' (STLAB_BIND opt-in)' : ' (loopback)'}`); }
  catch (e) { add('bind', 'fail', e.message); }

  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port-range', problem ? 'fail' : 'pass', problem || `${port} is inside ${PORT_MIN}-${PORT_MAX} and not reserved`);

  const corpus = storyCorpus();
  const badHosts = corpus.map(({ where, text }) => ({ where, hosts: scanHosts(text) })).filter((x) => x.hosts.length);
  add('story-hosts', badHosts.length ? 'fail' : 'pass', badHosts.length ? `non-reserved hosts: ${badHosts.map((b) => `${b.where}: ${b.hosts.join(', ')}`).join('; ')}` : 'every host in every story is .invalid, .example or loopback');
  const badKeys = corpus.map(({ where, text }) => ({ where, keys: scanKeys(text) })).filter((x) => x.keys.length);
  add('story-keys', badKeys.length ? 'fail' : 'pass', badKeys.length ? `key-looking values or literal JWTs: ${badKeys.map((b) => b.where).join(', ')}` : 'no key-looking value and no literal JWT in any story (tokens are minted at run time)');
  const holes = SCENARIOS.flatMap((s) => VERTICALS.flatMap((v) => unfilledTokens(s, v).map((t) => `${s.id}/${v.id}:${t}`)));
  add('story-tokens', holes.length ? 'fail' : 'pass', holes.length ? `unfilled {{tokens}}: ${holes.join(', ')}` : 'every {{cast}} token is filled in every vertical');

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect to a non-loopback host (${ng.blocked}/7)` : ng.detail);

  try {
    const results = VERTICALS.flatMap((v) => runAll(v.id));
    const failed = results.filter((r) => !r.pass);
    add('scenarios', failed.length ? 'fail' : 'pass', failed.length ? `scenarios not behaving as written: ${failed.map((f) => f.id).join(', ')}` : `${results.length} scenario runs across ${VERTICALS.length} verticals all behave as written`);
    const bad = VERTICALS.flatMap((v) => SCENARIOS.map((s) => mutationProof(s.id, v.id)).filter((m) => !m.ok).map((m) => `${m.id}/${v.id}`));
    add('mutation', bad.length ? 'fail' : 'pass', bad.length ? `a control does not block exactly its own attack: ${bad.join(', ')}` : 'each control switched off alone lets through exactly its own attack (every scenario, every vertical)');
  } catch (e) { add('scenarios', 'fail', e.message); }
  try { const key = fixtureKey('doctor'); add('crypto', key.jkt.length === 43 ? 'pass' : 'fail', 'ES256 fixture keys via createECDH (fixed seeds, no random key generation)'); } catch (e) { add('crypto', 'fail', e.message); }

  try { for (const n of DIAGRAM_NAMES) loadDiagram(n); add('diagrams', 'pass', `${DIAGRAM_NAMES.length} diagram(s) are valid diagram-studio/1 data, loaded by name`); }
  catch (e) { add('diagrams', 'fail', e.message); }
  add('mode', 'pass', `Mock mode only (${modeInfo().modes.join(' | ')} toggle; Live is refused: no live engine)`);

  add('tenant', 'pass', 'mock only: no tenant, no credentials, no outbound network');
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
