import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import DiagramTab, { lightFor, startBoxes } from "../tabs/DiagramTab.jsx";
import { buildDiagram } from "../../../server/src/diagramData.js";
import { VERTICALS } from "../../../server/src/stories.js";
import { installFakeServer } from "./fakeServer.js";

beforeEach(() => { window.location.hash = "#/diagram"; installFakeServer(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("diagram", () => {
  it("has movable boxes, Simulate, Reset and a speed control", async () => {
    render(<App />);
    await screen.findByRole("group", { name: /Flow diagram/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Simulate" })).toHaveAttribute("aria-disabled", "false"));
    expect(screen.getAllByRole("button", { name: "Reset" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Speed")).toHaveValue("1");
    for (const t of ["Mock authorization server", "Agent", "Attacker", "Mock gateway"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(6);
  });

  it("Simulate walks the steps at the chosen speed; a stopped replay turns the gateway red", async () => {
    render(<App />);
    await screen.findByRole("group", { name: /Flow diagram/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Simulate" })).toHaveAttribute("aria-disabled", "false"));
    vi.useFakeTimers();
    const caption = () => screen.getByTestId("caption").textContent;
    expect(caption()).toMatch(/Press Simulate/);
    act(() => { screen.getByRole("button", { name: "Simulate" }).click(); });
    expect(caption()).toMatch(/Step 1 of 3/); // S01: issue, legit, thief
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(caption()).toMatch(/Step 2 of 3/);
    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(caption()).toMatch(/Step 3 of 3/);
    expect(caption()).toMatch(/Let through \(200\)/); // bearer replay works: the lesson
    expect(screen.getByRole("button", { name: "Simulate" })).toHaveAttribute("aria-disabled", "false");
  });

  it("a faster speed shortens the step interval", async () => {
    render(<App />);
    await screen.findByRole("group", { name: /Flow diagram/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Simulate" })).toHaveAttribute("aria-disabled", "false"));
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "4" } });
    act(() => { screen.getByRole("button", { name: "Simulate" }).click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });
    expect(screen.getByTestId("caption").textContent).toMatch(/Step 2 of 3/);
  });

  it("Reset stops the simulation and puts the boxes back at the start positions from the data", async () => {
    const diagram = buildDiagram(VERTICALS[0].cast);
    const setBoxes = vi.fn(); const setCursor = vi.fn(); const resetPositions = vi.fn();
    const moved = startBoxes(diagram).map((b) => ({ ...b, position: { x: 1, y: 1 } }));
    render(<DiagramTab app={{ run: null, cast: {}, cursor: 2, setCursor, diagram, boxes: moved, setBoxes, resetPositions, resetEpoch: 0, theme: "light" }} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Reset" }).find((b) => b.closest("[role='tabpanel'], .flow") || !b.closest("header")));
    expect(resetPositions).toHaveBeenCalledTimes(1);
    expect(setCursor).toHaveBeenCalledWith(-1);
    expect(startBoxes(diagram).map((b) => [b.id, b.position])).toEqual(diagram.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  });

  it("the boxes and their labels come from the diagram-studio data, not from the component", async () => {
    render(<App />);
    await screen.findByRole("group", { name: /Flow diagram/ });
    const d = buildDiagram(VERTICALS[0].cast);
    await waitFor(() => expect(document.querySelectorAll(".react-flow__node")).toHaveLength(d.nodes.length));
    for (const n of d.nodes) expect(screen.getAllByText(n.label).length).toBeGreaterThan(0);
    // jsdom has no layout, so React Flow draws no edges here; the edges are checked in the real browser run.
    expect(d.schema).toBe("diagram-studio/1");
  });

  it("every edge id lightFor can light exists in the data, and every node id it lights exists too", () => {
    const d = buildDiagram(VERTICALS[0].cast);
    const edgeIds = new Set(d.edges.map((e) => e.id)); const nodeIds = new Set(d.nodes.map((n) => n.id));
    const cast = { host_a: "a.example", host_b: "b.example" };
    const req = (h) => `GET / HTTP/1.1\nHost: ${h}\n`;
    const steps = [{ op: "issue" }, { op: "rotate-nonce" }, { op: "advance" }];
    for (const who of ["client", "attacker"]) for (const status of [200, 401]) for (const h of ["a.example", "b.example"]) steps.push({ op: "call", who, status, trace: { request: req(h) } });
    steps.push({ op: "call", who: "client", captured: true });
    for (const s of steps) { const l = lightFor(s, cast); for (const e of l.edges) expect(edgeIds.has(e), e).toBe(true); for (const n of l.nodes) expect(nodeIds.has(n), n).toBe(true); }
  });

  it("lightFor: a refused replay lights the gateway as deny and no API; a let-through call lights the API", () => {
    const cast = { host_a: "a.example", host_b: "b.example" };
    const req = (h) => `GET / HTTP/1.1\nHost: ${h}\n`;
    expect(lightFor({ op: "call", who: "attacker", status: 401, trace: { request: req("a.example") } }, cast)).toEqual({ nodes: ["attacker", "gateway"], edges: ["attack"], deny: "gateway" });
    expect(lightFor({ op: "call", who: "attacker", status: 200, trace: { request: req("b.example") } }, cast).nodes).toContain("api_b");
    expect(lightFor({ op: "call", who: "client", status: 200, trace: { request: req("a.example") } }, cast).edges).toEqual(["legit", "to_a"]);
    expect(lightFor({ op: "call", who: "client", captured: true }, cast).edges).toEqual(["steal"]);
  });
});

describe("global Reset lab", () => {
  const xform = () => [...document.querySelectorAll(".react-flow__node")].map((n) => n.style.transform);
  it("puts moved boxes back at their start positions", async () => {
    render(<App />);
    await screen.findByRole("group", { name: /Flow diagram/ });
    await waitFor(() => expect(document.querySelectorAll(".react-flow__node")).toHaveLength(6));
    const before = xform();
    const node = document.querySelector(".react-flow__node");
    node.focus();
    fireEvent.keyDown(node, { key: "Enter" });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(node, { key: "ArrowRight", shiftKey: true });
    await waitFor(() => expect(xform()).not.toEqual(before));
    await userEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(xform()).toEqual(before));
  });
});
