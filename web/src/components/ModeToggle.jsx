import React from "react";

// Rule 19: the Mock / Real toggle, in the header of every page. This lab is mock only, so Real is
// always disabled with the server's reason (realAvailable: false, realReason from /api/info).
export default function ModeToggle({ info, onSelect }) {
  const loading = !info;
  const source = info?.source;
  const realOff = loading || info?.realAvailable !== true;
  const pick = (next) => { if (next !== source) onSelect?.(next); };
  return (
    <div className="seg" role="group" aria-label="Mode" data-testid="mode">
      <button type="button" aria-pressed={source === "mock"} disabled={loading} onClick={() => pick("mock")} data-testid="mode-mock">Mock</button>
      <button type="button" aria-pressed={source === "real"} disabled={realOff} title={realOff && !loading ? info?.realReason : undefined} onClick={() => pick("real")} data-testid="mode-real">Real</button>
      <span className="chip">Mode: {source || "..."} (in-process mocks)</span>
    </div>
  );
}
