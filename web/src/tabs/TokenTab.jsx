import React from "react";
import { Inert, pretty } from "../lib/Inert.jsx";

const BOUND = ["cnf", "aud", "ath", "htm", "htu", "jti", "iat", "nonce"];
function Claims({ claims, testid }) {
  return (
    <table className="claims" data-testid={testid}>
      <thead><tr><th scope="col">Claim</th><th scope="col">Value</th></tr></thead>
      <tbody>{Object.entries(claims).map(([k, v]) => (
        <tr key={k} className={BOUND.includes(k) ? "claim--intent" : ""}><th scope="row">{k}</th><td><Inert text={typeof v === "object" ? pretty(v) : String(v)} /></td></tr>
      ))}</tbody>
    </table>
  );
}

/** A small panel only: the token's claims and the DPoP proof of the step on screen. Full decoding lives in token-workbench. */
export default function TokenTab({ app }) {
  const { run, cursor } = app;
  const steps = run?.steps ?? [];
  const cur = steps[cursor];
  const issued = [...steps.slice(0, Math.max(cursor, 0) + 1)].reverse().find((s) => s.claims) || steps.find((s) => s.claims);
  const claims = cur?.claims || issued?.claims;
  return (
    <>
      <h2>Token and proof</h2>
      <p className="lede" data-admin-only>The mock-issued access token and, for DPoP calls, the proof sent with it. Highlighted rows are the ones that bind or check the request. Every token here is mock-issued with a throwaway key.</p>
      {!claims ? <p className="muted">No token yet. Run a scenario.</p> : (
        <div className="cols">
          <section className="card"><h3>Access token claims</h3><Claims claims={claims} testid="token-claims" />
            <p className="muted small">{claims.cnf?.jkt ? "cnf.jkt: the token is bound to a DPoP key." : claims.cnf?.["x5t#S256"] ? "cnf x5t#S256: the token is bound to a certificate (simulated)." : "No cnf claim: a bearer token. Whoever holds it can use it."}</p>
          </section>
          <section className="card"><h3>DPoP proof</h3>
            {cur?.proof ? (<><h4>Header</h4><Inert block text={pretty(cur.proof.header)} testid="proof-header" /><h4>Claims</h4><Claims claims={cur.proof.claims} testid="proof-claims" /></>)
              : <p className="muted">The step on screen carries no DPoP proof.</p>}
          </section>
        </div>
      )}
    </>
  );
}
