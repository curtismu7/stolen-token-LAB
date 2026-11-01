// Runs a scenario in a fresh world, and the mutation proof: each control switched off alone lets through exactly its own attack.
import { createWorld } from './world.js';
import { allOn, CONTROL_IDS } from './gateway.js';
import { SCENARIOS, VERTICALS, getScenario, getVertical, renderScenario } from './stories.js';

export function runScenario(idOrSlug, verticalId = VERTICALS[0].id, { off = [] } = {}) {
  const sc = getScenario(idOrSlug); const v = getVertical(verticalId);
  if (!sc) throw new Error('unknown scenario'); if (!v) throw new Error('unknown vertical');
  const r = renderScenario(sc, v);
  const world = createWorld({ vertical: v });
  world.setControls({ ...allOn(), ...Object.fromEntries(off.map((c) => [c, false])) });
  const steps = r.steps.map((s) => world.exec(s));
  const attack = steps.find((s) => s.id === r.attackStep);
  const matched = steps.filter((s) => s.expected).every((s) => s.pass);
  return {
    id: r.id, slug: r.slug, vertical: v.id, kind: r.kind, title: r.title, takeaway: r.takeaway, stolen: r.stolen, rfc: r.rfc, defence: r.defence,
    controls: { ...world.gateway.controls }, off, expected: r.expect, blockedBy: r.blockedBy, attackStep: r.attackStep,
    attackOutcome: { status: attack.status, error: attack.error, allowed: !!attack.allowed },
    steps, pass: off.length === 0 ? matched : undefined,
  };
}

export const runAll = (verticalId) => SCENARIOS.map((s) => runScenario(s.id, verticalId));

// For one scenario: switch each control off alone and report whether the attack step got through.
export function mutationProof(idOrSlug, verticalId = VERTICALS[0].id) {
  const sc = getScenario(idOrSlug);
  const base = runScenario(sc.id, verticalId);
  const rows = CONTROL_IDS.map((c) => {
    const run = runScenario(sc.id, verticalId, { off: [c] });
    return { control: c, allowed: run.attackOutcome.allowed, status: run.attackOutcome.status, error: run.attackOutcome.error };
  });
  const baseAllowed = base.attackOutcome.allowed;
  const shouldPass = (c) => baseAllowed || c === sc.blockedBy;
  return { id: sc.id, blockedBy: sc.blockedBy, baseline: base.attackOutcome, rows, ok: base.pass && rows.every((r) => r.allowed === shouldPass(r.control)) };
}
