import React from "react";
import { Inert } from "../lib/Inert.jsx";
import { fill } from "../lib/fill.js";
import { WHO_LABEL, stepTag, stepText, verdictOf } from "../lib/session.js";

const KIND = { lesson: "Lesson", attack: "Attack", conformance: "Conformance", limit: "Honest limit" };

/** What the attacker walked away with. Token only is the common case; token plus key is full compromise. */
export function StolenPanel({ stolen }) {
  const items = [["token", "Access token"], ["proof", "A captured DPoP proof"], ["key", "The private key"], ["cert", "A client certificate"]];
  return (
    <section className="card" aria-labelledby="stolen-h" data-testid="stolen">
      <h3 id="stolen-h">What I stole</h3>
      <ul className="stolen">
        {items.map(([k, t]) => (
          <li key={k} className="stolen__item" data-state={stolen?.[k] ? "has" : "hasnt"}><span>{t}</span><span className="pill" data-state={stolen?.[k] ? "bad" : "ok"}>{stolen?.[k] ? "YES" : "no"}</span></li>
        ))}
      </ul>
    </section>
  );
}

export default function AttackTab({ app }) {
  const { catalog, cast, run, runError, running, scenarioId, setScenarioId, doRun, cursor, setCursor, off } = app;
  const picked = catalog.scenarios.find((s) => s.id === scenarioId);
  const v = run ? verdictOf(run, catalog.controls) : null;
  return (
    <>
      <h2>Replay a captured token</h2>
      <p className="lede" data-admin-only>{fill("{{agent}} calls {{api_a}} for {{user}}. A thief captures the access token off the wire and replays it. Pick a scenario, then turn defences on and off on the Gateway tab.", cast)}</p>
      <section className="card" aria-labelledby="scn-h">
        <h3 id="scn-h">The replay</h3>
        <div className="controls">
          <label>Scenario
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {catalog.scenarios.map((s) => <option key={s.id} value={s.id}>{s.id} · {KIND[s.kind] || s.kind} · {s.title}</option>)}
            </select>
          </label>
          <button type="button" className="primary" aria-disabled={running} onClick={() => { if (!running) doRun(); }}>{running ? "Running..." : "Run again"}</button>
        </div>
        {picked && <p className="muted small"><Inert text={fill(picked.takeaway, cast)} /></p>}
        {off.length > 0 && <p className="alert" role="status" data-testid="off-note">Defences switched off: {off.join(", ")}.</p>}
        {runError && <p className="alert" role="alert">{runError}</p>}
      </section>
      {run && <StolenPanel stolen={run.stolen} />}
      {run && (
        <section className="story" aria-labelledby="story-h">
          <p className="story__eyebrow">{run.id} · {KIND[run.kind] || run.kind}</p>
          <h3 id="story-h" className="story__title"><Inert text={fill(run.title, cast)} /></h3>
          <p className="verdict" data-tone={v.tone} data-testid="verdict">{v.text}</p>
          <div className="story__controls">
            <button type="button" aria-disabled={cursor <= 0} onClick={() => { if (cursor > 0) setCursor(cursor - 1); }}>Previous step</button>
            <button type="button" aria-disabled={cursor >= run.steps.length - 1} onClick={() => { if (cursor < run.steps.length - 1) setCursor(cursor + 1); }}>Next step</button>
            <span className="muted small">{cursor >= 0 ? `Step ${cursor + 1} of ${run.steps.length}` : `${run.steps.length} steps`}</span>
          </div>
          <ol className="story__steps">
            {run.steps.map((s, i) => {
              const tag = stepTag(s);
              return (
                <li key={i} data-state={i === cursor ? "current" : undefined}>
                  <button type="button" className="story__step" aria-current={i === cursor ? "step" : undefined} onClick={() => setCursor(i)}>
                    <span className="story__n">{i + 1}</span>
                    <span>{s.who && <strong>{WHO_LABEL[s.who]}: </strong>}<Inert text={fill(stepText(s), cast)} /></span>
                    {tag && <span className="story__tag" data-state={tag.refused ? "refused" : "ok"}>{tag.text}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="story__takeaway"><Inert text={fill(run.takeaway, cast)} /></p>
        </section>
      )}
    </>
  );
}
