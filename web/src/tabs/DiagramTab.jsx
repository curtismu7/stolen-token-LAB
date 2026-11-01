import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Inert } from "../lib/Inert.jsx";
import { fill } from "../lib/fill.js";
import { stepText } from "../lib/session.js";
import { BASE_MS, SPEEDS, lightFor, sides, startBoxes } from "../lib/diagram.js";

export { lightFor, startBoxes };

// The picture is diagram-studio/1 data from the server (rule 17): the app draws what the data says and lights it from the scenario steps.
// Boxes are draggable; Simulate walks the steps on screen; Reset puts the boxes and the simulation back; the speed control sets the pace.
const HANDLES = [["t", Position.Top], ["b", Position.Bottom], ["l", Position.Left], ["r", Position.Right]];
const FIT = { padding: 0.12 };
// At phone width fitting the whole diagram makes the text unreadable, so the view is held at 0.8 on the first two boxes; drag the background to pan.
const narrow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;

function Box({ data }) {
  return (
    <div className="flow-box" data-group={data.group} data-on={data.on ? "true" : "false"} data-deny={data.deny ? "true" : "false"} data-dim={data.dim ? "true" : "false"}>
      {HANDLES.map(([k, pos]) => (
        <React.Fragment key={k}>
          <Handle id={`s-${k}`} type="source" position={pos} className="flow-box__handle" />
          <Handle id={`t-${k}`} type="target" position={pos} className="flow-box__handle" />
        </React.Fragment>
      ))}
      <strong>{data.title}</strong>
      {data.sub.map((line) => <span key={line}>{line}</span>)}
    </div>
  );
}
const nodeTypes = { box: Box };

function Canvas({ diagram, boxes, setBoxes, light, current, theme, resetKey }) {
  const { fitView } = useReactFlow();
  const fit = useMemo(() => (narrow() ? { padding: 0.1, minZoom: 0.8, maxZoom: 0.8, nodes: diagram.nodes.slice(0, 2).map((n) => ({ id: n.id })) } : FIT), [diagram]);
  useEffect(() => { const t = setTimeout(() => fitView(fit), 0); return () => clearTimeout(t); }, [resetKey, fit, fitView]);
  const byId = useMemo(() => Object.fromEntries(diagram.nodes.map((n) => [n.id, n])), [diagram]);
  const nodes = useMemo(() => boxes.map((b) => ({
    ...b, type: "box",
    data: { title: byId[b.id].label, sub: byId[b.id].sub ?? [], group: byId[b.id].group, on: light.nodes.includes(b.id) && light.deny !== b.id, deny: light.deny === b.id, dim: !!current && !light.nodes.includes(b.id) },
  })), [boxes, byId, light, current]);
  const at = useMemo(() => Object.fromEntries(boxes.map((b) => [b.id, b.position])), [boxes]);
  const edges = useMemo(() => diagram.edges.map((e) => {
    const lit = light.edges.includes(e.id);
    const [a, b] = sides(at[e.source], at[e.target]);
    return {
      id: e.id, source: e.source, target: e.target, sourceHandle: `s-${a}`, targetHandle: `t-${b}`, label: e.label, animated: lit,
      className: `flow-edge${e.dashed ? " flow-edge--dashed" : ""}${lit ? (light.deny ? " flow-edge--deny" : " flow-edge--on") : ""}`,
      markerEnd: { type: MarkerType.ArrowClosed },
    };
  }), [diagram, at, light]);
  const onNodesChange = useCallback((changes) => setBoxes((n) => applyNodeChanges(changes, n)), [setBoxes]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} colorMode={theme === "system" ? "system" : theme}
      fitView fitViewOptions={fit} nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.2}>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function DiagramTab({ app }) {
  const { run, cast, cursor, setCursor, diagram, boxes, setBoxes, resetPositions, theme } = app;
  const [speed, setSpeed] = useState("1");
  const [running, setRunning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const steps = useMemo(() => run?.steps ?? [], [run]);

  useEffect(() => { setRunning(false); }, [run]);
  useEffect(() => { if (cursor < 0) setRunning(false); }, [cursor]); // a lab-wide Reset stops a running simulation
  useEffect(() => {
    if (!running) return undefined;
    if (cursor >= steps.length - 1) { setRunning(false); return undefined; }
    const t = setTimeout(() => setCursor(cursor + 1), BASE_MS / Number(speed));
    return () => clearTimeout(t);
  }, [running, cursor, steps.length, speed, setCursor]);

  const simulateOff = running || steps.length === 0;
  const simulate = () => { if (simulateOff) return; setCursor(0); setRunning(true); };
  const reset = () => { setRunning(false); setCursor(-1); resetPositions(); setResetKey((k) => k + 1); };
  const prevReset = useRef(app.resetEpoch);
  useEffect(() => { if (prevReset.current !== app.resetEpoch) { prevReset.current = app.resetEpoch; setResetKey((k) => k + 1); } }, [app.resetEpoch]);

  const cur = cursor >= 0 ? steps[Math.min(cursor, steps.length - 1)] : null;
  const light = useMemo(() => lightFor(cur, cast), [cur, cast]);
  const refused = cur?.status >= 400;
  const caption = cur
    ? `Step ${cursor + 1} of ${steps.length}: ${fill(stepText(cur), cast)}${cur.status != null ? (refused ? ` STOPPED ${cur.status} ${cur.error || ""}.` : ` Let through (${cur.status}).`) : ""}`
    : "Press Simulate to walk the steps through the diagram. Drag any box to rearrange it.";

  return (
    <>
      <h2>How the replay travels</h2>
      <p className="lede" data-admin-only>{diagram.lede} Drag any box. A replay the gateway stops turns the gateway red; one that gets through lights the API.</p>
      <div className="card controls">
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(e.target.value)}>{SPEEDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <button type="button" className="primary" aria-disabled={simulateOff} onClick={simulate}>Simulate</button>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <div className="flow" role="group" aria-label="Flow diagram: mock authorization server, agent, attacker, mock gateway and two APIs. Boxes can be dragged.">
        <ReactFlowProvider>
          <Canvas diagram={diagram} boxes={boxes} setBoxes={setBoxes} light={light} current={cur} theme={theme} resetKey={resetKey} />
        </ReactFlowProvider>
      </div>
      <p className="muted small">Drag the background to pan on a phone. Diagram data: {diagram.id} (diagram-studio/1).</p>
      <p className="caption" data-state={refused ? "deny" : "ok"} role="status" aria-live="polite" data-testid="caption"><Inert text={caption} /></p>
    </>
  );
}
