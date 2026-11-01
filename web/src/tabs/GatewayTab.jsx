import React, { useState } from "react";
import { Inert } from "../lib/Inert.jsx";
import { getMutation } from "../lib/api.js";

export default function GatewayTab({ app }) {
  const { catalog, off, setOff, scenarioId, run } = app;
  const [mut, setMut] = useState(null);
  const [mutError, setMutError] = useState(null);
  const [mutBusy, setMutBusy] = useState(false);
  const toggle = (id) => setOff(off.includes(id) ? off.filter((x) => x !== id) : [...off, id]);
  const proof = async () => {
    if (mutBusy) return;
    setMutError(null); setMutBusy(true);
    try { setMut(await getMutation(scenarioId, catalog.vertical)); } catch (e) { setMutError(e.message); } finally { setMutBusy(false); }
  };
  return (
    <>
      <h2>Mock gateway defences</h2>
      <p className="lede" data-admin-only>Each defence is a switch. Turn one off and the scenario re-runs: exactly the attack that defence blocks gets through. Signature, type, issuer and expiry of the access token are always on.</p>
      <section className="card" aria-labelledby="ctl-h">
        <h3 id="ctl-h">Defences</h3>
        <ul className="switches">
          {catalog.controls.map((c) => {
            const on = !off.includes(c.id);
            return (
              <li key={c.id} className="switches__item" data-state={on ? "on" : "off"}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                  <span><strong>{c.label}</strong> <span className="pill" data-state={on ? "ok" : "bad"}>{on ? "ON" : "OFF"}</span>
                    <span className="muted small block"><Inert text={c.text} /> <strong>{c.rfc}</strong></span></span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="actions">
          <button type="button" aria-disabled={off.length === 0} onClick={() => { if (off.length > 0) setOff([]); }}>Turn all defences on</button>
        </div>
        {run && <p className="muted small" data-testid="gw-outcome">Attack step in {run.id}: {run.attackOutcome.allowed ? "allowed" : "refused"} ({run.attackOutcome.status}{run.attackOutcome.error ? ` ${run.attackOutcome.error}` : ""}).</p>}
      </section>
      <section className="card" aria-labelledby="mut-h">
        <h3 id="mut-h">Mutation proof</h3>
        <p className="muted small">Switches each defence off alone for {scenarioId} and shows whether the attack got through. Only the scenario's own defence should let it in.</p>
        <button type="button" className="primary" aria-disabled={mutBusy} onClick={proof}>{mutBusy ? "Running..." : "Run mutation proof"}</button>
        {mutError && <p className="alert" role="alert">{mutError}</p>}
        {mut && (
          <>
            <p className="verdict" data-tone={mut.ok ? "ok" : "deny"} data-testid="mut-verdict">{mut.ok ? `Proof holds for ${mut.id}: blocked by ${mut.blockedBy || "nothing (it works with every defence on)"}.` : `Proof FAILED for ${mut.id}.`}</p>
            <table className="claims" data-testid="mut-table">
              <thead><tr><th scope="col">Defence off</th><th scope="col">Attack</th></tr></thead>
              <tbody>{mut.rows.map((r) => <tr key={r.control}><th scope="row">{r.control}</th><td>{r.allowed ? `GOT IN (${r.status})` : `stopped (${r.status} ${r.error || ""})`}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </section>
      <section className="card" aria-labelledby="notes-h">
        <h3 id="notes-h">Notes</h3>
        <ul>
          <li><strong>mTLS is simulated.</strong> There is no TLS in this lab. The certificate is a labelled fake thumbprint sent in a header, to show the check RFC 8705 describes.</li>
          <li><strong>UNVERIFIED:</strong> in the Ping stack only PingFederate is believed to support DPoP and ID-JAG; PingOne is not claimed to. Re-check before saying so to a customer.</li>
          <li>Local policy, not RFC text: the proof iat window is {catalog.iatWindowSeconds} seconds.</li>
        </ul>
      </section>
    </>
  );
}
