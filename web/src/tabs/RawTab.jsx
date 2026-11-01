import React, { useEffect, useState } from "react";
import { Inert } from "../lib/Inert.jsx";

export default function RawTab({ app }) {
  const { run, cursor } = app;
  const calls = (run?.steps ?? []).filter((s) => s.trace);
  const [id, setId] = useState(null);
  useEffect(() => { const s = run?.steps[cursor]; if (s?.trace) setId(s.id); else setId(null); }, [cursor, run]);
  const m = calls.find((s) => s.id === id) ?? calls[calls.length - 1];
  return (
    <>
      <h2>Raw messages</h2>
      <p className="lede" data-admin-only>The request and response the gateway saw, and its check-by-check log. Tokens are shown in full: they are mock tokens, signed with a throwaway fixture key. Text is shown, never run.</p>
      {!m ? <p className="muted">No messages yet. Run a scenario.</p> : (
        <>
          <div className="card controls">
            <label>Call
              <select value={m.id} onChange={(e) => setId(e.target.value)}>
                {calls.map((s) => <option key={s.id} value={s.id}>{s.n} · {s.who} · {s.id} · {s.status}</option>)}
              </select>
            </label>
            <span className="muted small">traceparent <code>{m.trace.traceparent}</code></span>
          </div>
          <div className="cols">
            <section className="card"><h3>Request</h3><Inert block text={m.trace.request} testid="raw-request" /></section>
            <section className="card"><h3>Response</h3><Inert block text={m.trace.response} testid="raw-response" /></section>
          </div>
          <section className="card"><h3>Gateway log</h3>
            <table className="claims" data-testid="gw-log">
              <thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Detail</th></tr></thead>
              <tbody>{m.trace.gatewayLog.map((l, i) => <tr key={i}><th scope="row">{l.check}</th><td>{l.result}</td><td><Inert text={l.detail} /></td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
