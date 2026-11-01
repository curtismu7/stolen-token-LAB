import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, VERTICALS, unfilledTokens, renderScenario, storyCorpus } from '../src/stories.js';
import { runScenario, runAll, mutationProof } from '../src/runner.js';
import { CONTROL_IDS } from '../src/gateway.js';
import { stepProblem } from '../src/world.js';
import { scanHosts, scanKeys } from '../src/safety.js';

test('every scenario runs as written in every vertical', () => {
  for (const v of VERTICALS) for (const r of runAll(v.id)) assert.equal(r.pass, true, `${r.id}/${v.id}: ${JSON.stringify(r.steps.filter((s) => s.pass === false).map((s) => [s.id, s.status, s.error]))}`);
});

test('the scenario set covers the required lessons', () => {
  const slugs = SCENARIOS.map((s) => s.slug);
  for (const need of ['bearer-replay', 'audience-binding', 'dpop-no-key', 'dpop-proof-replay', 'dpop-wrong-htu', 'dpop-wrong-htm', 'dpop-wrong-ath', 'dpop-missing-ath', 'dpop-stale-iat', 'dpop-nonce', 'full-compromise', 'mtls-no-cert']) assert.ok(slugs.includes(need), need);
  assert.equal(SCENARIOS.length, new Set(SCENARIOS.map((s) => s.id)).size);
  assert.ok(SCENARIOS.every((s) => s.stolen && typeof s.stolen.token === 'boolean' && typeof s.stolen.key === 'boolean'), 'every scenario says what was stolen');
});

test('scenario data is well formed: every step validates, attackStep exists, blockedBy is a real control, bounded size', () => {
  for (const s of SCENARIOS) {
    assert.ok(s.steps.length > 0 && s.steps.length <= 40, s.id);
    for (const st of s.steps) assert.equal(stepProblem(renderScenario(s, VERTICALS[0]).steps[s.steps.indexOf(st)]), null, `${s.id}/${st.id ?? st.op}`);
    assert.ok(s.steps.some((st) => st.id === s.attackStep), `${s.id} attackStep`);
    assert.ok(s.blockedBy === null || CONTROL_IDS.includes(s.blockedBy), `${s.id} blockedBy`);
    assert.ok(s.rfc.length > 0 && s.takeaway.length > 20);
    const ids = s.steps.filter((x) => x.id).map((x) => x.id); assert.equal(ids.length, new Set(ids).size, `${s.id} duplicate step id`);
  }
});

test('MUTATION PROOF: with each control off alone, an attack gets through if and only if that control was its blocker', () => {
  for (const v of VERTICALS) for (const s of SCENARIOS) {
    const m = mutationProof(s.id, v.id);
    assert.equal(m.ok, true, `${s.id}/${v.id}: ${JSON.stringify(m.rows.filter((r) => r.allowed !== (!!s.blockedBy ? r.control === s.blockedBy : true)))}`);
  }
});

test('MUTATION PINS: each of the ten controls is the sole blocker of at least one scenario, except audience-free ones documented', () => {
  const blockers = new Set(SCENARIOS.map((s) => s.blockedBy).filter(Boolean));
  assert.deepEqual([...CONTROL_IDS].filter((c) => !blockers.has(c)), [], 'a control that blocks nothing is dead weight');
});

test('honest cases: bearer replay and full compromise succeed under every control at once', () => {
  for (const id of ['S01', 'S13']) {
    const r = runScenario(id, 'travel');
    assert.equal(r.attackOutcome.allowed, true, id);
    assert.ok(Object.values(r.controls).every(Boolean), 'all ten controls were ON');
  }
});

test('what is stolen is stated: DPoP attacks that need no key say so, S13 says the key was stolen', () => {
  const by = Object.fromEntries(SCENARIOS.map((s) => [s.id, s.stolen]));
  assert.equal(by.S03.key, false); assert.equal(by.S13.key, true); assert.equal(by.S05.proof, true); assert.equal(by.S01.proof, false);
});

test('the nonce scenario: first call 401 use_dpop_nonce with the header, retry 200', () => {
  const r = runScenario('S11', 'banking');
  const first = r.steps.find((s) => s.id === 'first'); const retry = r.steps.find((s) => s.id === 'retry');
  assert.equal(first.error, 'use_dpop_nonce'); assert.match(first.trace.response, /DPoP-Nonce: mock-nonce-1/);
  assert.equal(retry.status, 200);
});

test('a run records the raw trace: traceparent, request, response, gateway log; tokens are shown whole (raw)', () => {
  const r = runScenario('S03', 'retail');
  const t = r.steps.find((s) => s.id === 'thief').trace;
  assert.match(t.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.match(t.request, /^GET \/v1\/orders\/5530 HTTP\/1\.1\nHost: orders\.retail\.example/);
  assert.match(t.request, /Authorization: DPoP eyJ/);
  assert.ok(/eyJ[\w-]+\.[\w-]+\.[\w-]{20,}/.test(t.request), 'the full mock JWT is in the trace (tokens are shown raw)');
  assert.ok(t.gatewayLog.some((l) => l.result === 'fail' && l.control === 'dpop_binding'));
});

test('the run result carries whole mock tokens but never a private key member', () => {
  const text = JSON.stringify(runAll('travel'));
  assert.ok(!/"d":"/.test(text));
  assert.ok(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{40,}/.test(text.replace(/\\n/g, ' ')), 'tokens are shown raw (owner rule 4)');
});

test('verticals are packs of data: same cast keys everywhere, no unfilled tokens, hosts reserved, no keys or JWTs', () => {
  const keys = (v) => Object.keys(v.cast).sort().join();
  for (const v of VERTICALS) assert.equal(keys(v), keys(VERTICALS[0]), v.id);
  for (const s of SCENARIOS) for (const v of VERTICALS) assert.deepEqual(unfilledTokens(s, v), [], `${s.id}/${v.id}`);
  for (const { where, text } of storyCorpus()) { assert.deepEqual(scanHosts(text), [], where); assert.deepEqual(scanKeys(text), [], where); }
});

test('unknown scenario or vertical throws', () => {
  assert.throws(() => runScenario('nope'), /unknown scenario/);
  assert.throws(() => runScenario('S01', 'nope'), /unknown vertical/);
});
