// Turns a server run into what the screens need: per-step labels, which API a call hit, and the one-line verdict.
export const WHO_LABEL = { client: "Agent", attacker: "Attacker" };

/** Which mock API a call step hit, read from the Host line of the raw request the server recorded. */
export function stepApi(step, cast) {
  const host = /^Host: (\S+)/m.exec(step?.trace?.request || "")?.[1];
  if (!host) return null;
  return host === cast.host_a ? "a" : host === cast.host_b ? "b" : null;
}

/** Plain-words verdict for the attack step. tone: ok (the defence held), deny (the replay worked), hold (the lesson or honest limit). */
export function verdictOf(run, controls) {
  const { attackOutcome: o, blockedBy } = run;
  const label = controls.find((c) => c.id === blockedBy)?.label;
  if (!o.allowed) return { tone: "ok", text: `Replay stopped (${o.status} ${o.error || ""}). Defence that did it: ${label || "none"}.` };
  if (!blockedBy) return { tone: "hold", text: `Replay worked (${o.status}). ${run.kind === "limit" ? "This is the honest limit of sender-constraining." : "That is the lesson: a bearer token is a key to the door."}` };
  return { tone: "deny", text: `Replay got through (${o.status}) because ${label} is switched off.` };
}

export function stepTag(s) {
  if (s.status == null) return null;
  if (s.status >= 400) return { refused: true, text: `${s.who === "attacker" ? "STOPPED" : "REFUSED"} ${s.status}${s.error ? ` ${s.error}` : ""}` };
  return { refused: false, text: `${s.who === "attacker" ? "GOT IN" : "OK"} ${s.status}` };
}

export const stepText = (s) => s.say || s.note || (s.op === "advance" ? "Time passes on the mock clock." : s.op === "rotate-nonce" ? "The gateway rotates its nonce." : "");
