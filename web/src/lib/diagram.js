import { stepApi } from "./session.js";

// The diagram is diagram-studio/1 data from the server (GET /api/diagram). These helpers read it; nothing here lists nodes or edges.
export const SPEEDS = [["0.5", "0.5x"], ["1", "1x"], ["2", "2x"], ["4", "4x"]];
export const BASE_MS = 1600;

/** Where the boxes start: the x and y in the data. Reset puts them back here. */
export const startBoxes = (diagram) => (diagram?.nodes ?? []).map((n) => ({ id: n.id, position: { x: n.x, y: n.y }, data: {} }));

/** The side of each box that faces the other box, so an arrow leaves toward its target even after a box is moved. */
export function sides(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ["r", "l"] : ["l", "r"]) : (dy > 0 ? ["b", "t"] : ["t", "b"]);
}

/** What a step lights up on the picture, by node id and edge id from the data. Pure, so it can be tested on its own. */
export function lightFor(step, cast) {
  if (!step) return { nodes: [], edges: [], deny: null };
  if (step.op === "issue") return { nodes: ["as", "client"], edges: ["issue"], deny: null };
  if (step.op !== "call") return { nodes: step.op === "rotate-nonce" ? ["gateway"] : [], edges: [], deny: null };
  const from = step.who === "attacker" ? "attacker" : "client";
  const lane = step.who === "attacker" ? "attack" : "legit";
  if (step.captured) return { nodes: ["client", "attacker"], edges: ["steal"], deny: null };
  const api = stepApi(step, cast) === "b" ? "b" : "a";
  const refused = step.status >= 400;
  return {
    nodes: refused ? [from, "gateway"] : [from, "gateway", `api_${api}`],
    edges: refused ? [lane] : [lane, `to_${api}`],
    deny: refused ? "gateway" : null,
  };
}
