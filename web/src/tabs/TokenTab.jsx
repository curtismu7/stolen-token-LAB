import React from "react";
import Json from "../components/JsonPane.jsx";

// The claims that bind or check a replayed request: JsonPane stands them out in both views.
const BOUND = ["cnf", "aud", "ath", "htm", "htu", "jti", "iat", "nonce"];

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
      <p className="lede" data-admin-only>The mock-issued access token and, for DPoP calls, the proof sent with it. Highlighted claims are the ones that bind or check the request. Every token here is mock-issued with a throwaway key.</p>
      {!claims ? <p className="muted">No token yet. Run a scenario.</p> : (
        <div className="cols">
          <section className="card"><h3>Access token claims</h3><Json value={claims} label="Access token claims" testId="token-claims" hot={BOUND} />
            <p className="muted small">{claims.cnf?.jkt ? "cnf.jkt: the token is bound to a DPoP key." : claims.cnf?.["x5t#S256"] ? "cnf x5t#S256: the token is bound to a certificate (simulated)." : "No cnf claim: a bearer token. Whoever holds it can use it."}</p>
          </section>
          <section className="card"><h3>DPoP proof</h3>
            {cur?.proof ? (<><h4>Header</h4><Json value={cur.proof.header} label="DPoP proof header" testId="proof-header" /><h4>Claims</h4><Json value={cur.proof.claims} label="DPoP proof claims" testId="proof-claims" hot={BOUND} /></>)
              : <p className="muted">The step on screen carries no DPoP proof.</p>}
          </section>
        </div>
      )}
    </>
  );
}
