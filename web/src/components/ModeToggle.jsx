import React from "react";

// Mock | Live, in the header of every page. Mock is the only mode that runs; asking for Live shows the server's refusal (see the note under the header).
export default function ModeToggle({ mode, onAsk }) {
  return (
    <div className="seg" role="group" aria-label="Mode">
      <button type="button" aria-pressed={mode === "mock"} onClick={() => onAsk("mock")} data-testid="mode-mock">Mock</button>
      <button type="button" aria-pressed={mode === "live"} onClick={() => onAsk("live")} data-testid="mode-live">Live</button>
      <span className="chip" data-testid="mode">Mode: {mode} (in-process mocks)</span>
    </div>
  );
}
