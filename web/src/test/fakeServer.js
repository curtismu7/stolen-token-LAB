// In-process stand-in for the Express server: routes fetch() to the real mock gateway, runner, story data and diagram data (same code the server uses), no sockets.
import { CONTROLS, IAT_WINDOW_S } from "../../../server/src/gateway.js";
import { runScenario, mutationProof } from "../../../server/src/runner.js";
import { SCENARIOS, VERTICALS, getVertical, renderScenario } from "../../../server/src/stories.js";
import { buildDiagram } from "../../../server/src/diagramData.js";
import { LIVE_REFUSAL, modeInfo } from "../../../server/src/mode.js";

export const BANNER = "MOCK mode. SIMULATED: mock gateway, mock authorization server and mock tokens. No tenant, no outbound network. The mTLS defence is a simulation (no real TLS).";

export function catalogFor(id = VERTICALS[0].id) {
  const v = getVertical(id);
  return {
    banner: BANNER, mode: "mock", iatWindowSeconds: IAT_WINDOW_S, verticals: VERTICALS.map(({ id: i, name, cast }) => ({ id: i, name, cast })), vertical: v.id, controls: CONTROLS,
    scenarios: SCENARIOS.map((s) => { const r = renderScenario(s, v); return { id: r.id, slug: r.slug, kind: r.kind, title: r.title, takeaway: r.takeaway, talk: r.talk, stolen: r.stolen, defence: r.defence, blockedBy: r.blockedBy, expected: r.expect, rfc: r.rfc, steps: r.steps.length }; }),
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function installFakeServer() {
  const calls = [];
  let epoch = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url, "http://localhost");
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: u.pathname, body, search: u.search });
    if (u.pathname === "/api/catalog") return json(catalogFor(u.searchParams.get("vertical") || undefined));
    if (u.pathname === "/api/diagram") return json(buildDiagram(getVertical(u.searchParams.get("vertical") || VERTICALS[0].id).cast, u.searchParams.get("name") || undefined));
    if (u.pathname === "/api/info") return json({ ...modeInfo(), banner: BANNER, epoch });
    if (u.pathname === "/api/mode") { const r = u.searchParams.get("requested"); return json({ ...modeInfo(), requested: r, accepted: r === "mock", message: r === "live" ? LIVE_REFUSAL : "Mock mode." }); }
    if (u.pathname === "/api/reset") { epoch += 1; return json({ ok: true, epoch }); }
    if (u.pathname === "/api/run") return json({ banner: BANNER, ...runScenario(body.scenario, body.vertical, { off: body.off }) });
    if (u.pathname === "/api/mutation") return json({ banner: BANNER, ...mutationProof(body.scenario, body.vertical) });
    return json({ error: "not_found" }, 404);
  };
  return { calls, bumpEpoch: () => { epoch += 1; } };
}
