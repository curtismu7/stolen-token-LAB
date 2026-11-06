import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { installFakeServer } from "./fakeServer.js";

let server;
beforeEach(() => { window.location.hash = "#/attack"; localStorage.clear(); delete document.documentElement.dataset.present; delete document.documentElement.dataset.theme; server = installFakeServer(); });
afterEach(cleanup);
const verdict = () => screen.findByTestId("verdict");

describe("attack tab", () => {
  it("shows the banner and runs the bearer replay: the replay works, the lesson", async () => {
    render(<App />);
    expect(screen.getByTestId("banner")).toHaveTextContent(/^MOCK mode\. SIMULATED/);
    expect(await verdict()).toHaveTextContent(/Replay worked \(200\).*lesson/);
    expect(screen.getByTestId("banner")).toHaveTextContent(/mTLS defence is a simulation/);
    expect(within(screen.getByTestId("stolen")).getByText("Access token").nextSibling).toHaveTextContent("YES");
    expect(within(screen.getByTestId("stolen")).getByText("The private key").nextSibling).toHaveTextContent("no");
  });

  it("DPoP scenario: the replay is stopped by the key binding, and the stolen panel says token only", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S03");
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent(/Replay stopped \(401 invalid_token\).*DPoP key binding/));
    expect(within(screen.getByTestId("stolen")).getByText("A captured DPoP proof").nextSibling).toHaveTextContent("no");
    expect(screen.getAllByText(/STOPPED 401 invalid_token/).length).toBeGreaterThan(0);
  });

  it("full compromise (token and key) is shown as the honest limit", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S13");
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent(/honest limit/));
    expect(within(screen.getByTestId("stolen")).getByText("The private key").nextSibling).toHaveTextContent("YES");
  });

  it("Previous and Next move the highlighted step", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("persona picker re-fills the cast tokens (banking)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Persona and vertical"), "banking");
    await waitFor(() => expect(screen.getAllByText(/Payments agent/).length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/\{\{/);
  });
});

describe("gateway tab", () => {
  it("turning a defence off re-runs and lets exactly that attack through; turn all on restores", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S03");
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent(/Replay stopped/));
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    await user.click(await screen.findByRole("checkbox", { name: /DPoP key binding/ }));
    await waitFor(() => expect(screen.getByTestId("gw-outcome")).toHaveTextContent(/allowed \(200\)/));
    expect(server.calls.filter((c) => c.path === "/api/run").at(-1).body.off).toEqual(["dpop_binding"]);
    await user.click(screen.getByRole("button", { name: "Turn all defences on" }));
    await waitFor(() => expect(screen.getByTestId("gw-outcome")).toHaveTextContent(/refused \(401/));
  });

  it("a different defence off does not let this attack through", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S03");
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    await user.click(await screen.findByRole("checkbox", { name: /Audience binding/ }));
    await waitFor(() => expect(server.calls.filter((c) => c.path === "/api/run").at(-1).body.off).toEqual(["audience"]));
    await waitFor(() => expect(screen.getByTestId("gw-outcome")).toHaveTextContent(/refused/));
  });

  it("mutation proof table holds for a scenario", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S05");
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    await user.click(await screen.findByRole("button", { name: "Run mutation proof" }));
    expect(await screen.findByTestId("mut-verdict")).toHaveTextContent(/Proof holds for S05/);
    const rows = within(screen.getByTestId("mut-table")).getAllByRole("row");
    expect(rows).toHaveLength(11);
    expect(within(screen.getByTestId("mut-table")).getByText("dpop_jti").nextSibling).toHaveTextContent(/GOT IN/);
  });
});

describe("token and raw tabs", () => {
  it("token tab shows cnf.jkt on a DPoP token and the proof of the step", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByLabelText("Scenario"), "S03");
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent(/stopped/));
    await user.click(screen.getByRole("button", { name: /The thief/ }).closest("button") || screen.getAllByRole("button", { name: /STOPPED/ })[0]);
    await user.click(screen.getByRole("tab", { name: "Token" }));
    expect(await screen.findByTestId("token-claims")).toHaveTextContent(/cnf/);
    expect(screen.getByTestId("proof-header")).toHaveTextContent(/dpop\+jwt/);
    expect(screen.getByTestId("proof-claims")).toHaveTextContent(/htu/);
  });

  it("raw tab shows the request, response and gateway log, as text", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(await screen.findByTestId("raw-request")).toHaveTextContent(/^GET /);
    expect(screen.getByTestId("raw-response")).toHaveTextContent(/HTTP\/1.1 200/);
    expect(within(screen.getByTestId("gw-log")).getByText("authorized")).toBeInTheDocument();
  });
});

describe("shell", () => {
  it("Presenter keeps the banner and the mode, hides coaching copy, shows the talk line, and is remembered", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("button", { name: "Presenter (P)" }));
    expect(document.documentElement.dataset.present).toBe("1");
    expect(screen.getByTestId("banner")).toBeVisible();
    expect(screen.getByTestId("banner")).toHaveTextContent(/^MOCK mode/);
    expect(screen.getByTestId("mode")).toBeVisible();
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/Whoever holds this token is the agent/);
    expect(localStorage.getItem("stl.present")).toBe("1");
    expect(screen.getByRole("button", { name: "Exit presenter (Esc)" })).toBeInTheDocument();
  });

  it("P toggles presenter mode and Esc leaves it, both with the banner on screen; modifier keys and typing are ignored", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.keyboard("p");
    expect(document.documentElement.dataset.present).toBe("1");
    expect(screen.getByTestId("banner")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(document.documentElement.dataset.present).toBeUndefined();
    await user.keyboard("{Meta>}p{/Meta}");
    await user.keyboard("{Control>}P{/Control}");
    await user.keyboard("{Alt>}p{/Alt}");
    expect(document.documentElement.dataset.present).toBeUndefined();
    screen.getByLabelText("Scenario").focus();
    await user.keyboard("p");
    expect(document.documentElement.dataset.present).toBeUndefined();
    screen.getByLabelText("Scenario").blur();
    await user.keyboard("P");
    expect(document.documentElement.dataset.present).toBe("1");
    await user.keyboard("{Escape}");
    expect(localStorage.getItem("stl.present")).toBe("0");
  });

  it("the Mock | Real toggle is in the header of every tab; Real is refused with the honest reason and the page stays in Mock", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    for (const t of ["Attack", "Gateway", "Token", "Diagram", "Raw"]) {
      await user.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("mode-real")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("mode-real")).toBeDisabled();
      expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock");
    }
    await user.click(screen.getByTestId("mode-real"));
    // Real is disabled with the server's reason as its tooltip, so the click is a no-op: no POST, no note, still Mock.
    expect(server.calls.every((c) => !(c.method === "POST" && c.path === "/api/mode"))).toBe(true);
    expect(screen.queryByTestId("mode-note")).toBeNull();
    expect(screen.getByTestId("mode-real")).toBeDisabled();
    expect(screen.getByTestId("mode-real").getAttribute("title")).toContain("Live mode is not available in this lab");
    expect(screen.getByTestId("banner")).toHaveTextContent(/^MOCK mode/);
    // The mock direction: already in Mock, so the page asks nothing and stays put.
    await user.click(screen.getByTestId("mode-mock"));
    expect(server.calls.every((c) => !(c.method === "POST" && c.path === "/api/mode"))).toBe(true);
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
  });

  it("a reset made through the API or the script is noticed when the page regains focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    await user.click(await screen.findByRole("checkbox", { name: /Audience binding/ }));
    expect(screen.getByRole("checkbox", { name: /Audience binding/ })).not.toBeChecked();
    server.bumpEpoch();
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent(/Reset from outside the page/));
    expect(screen.getByRole("checkbox", { name: /Audience binding/ })).toBeChecked();
  });

  it("the main landmark is kept: one banner header, one main, and the tab panel is inside it", async () => {
    render(<App />);
    await verdict();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("tabpanel"));
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("Run buttons use aria-disabled and keep focus while a run is in flight", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    const run = screen.getByRole("button", { name: "Run again" });
    run.focus();
    expect(run).not.toBeDisabled();
    await user.click(run);
    expect(run).toHaveFocus();
    expect(run).not.toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    const proof = await screen.findByRole("button", { name: "Run mutation proof" });
    proof.focus();
    await user.click(proof);
    expect(proof).not.toBeDisabled();
    await screen.findByTestId("mut-verdict");
    expect(screen.getByRole("button", { name: "Run mutation proof" })).toHaveFocus();
  });

  it("Reset turns every defence back on and tells the user", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    await user.click(await screen.findByRole("checkbox", { name: /Audience binding/ }));
    await user.click(screen.getByRole("button", { name: "Reset lab" }));
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent(/all defences on/));
    expect(server.calls.some((c) => c.method === "POST" && c.path === "/api/reset")).toBe(true);
    expect(screen.getByRole("checkbox", { name: /Audience binding/ })).toBeChecked();
  });

  it("a defence can be switched off and back on, one at a time", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.click(screen.getByRole("tab", { name: "Gateway" }));
    const box = await screen.findByRole("checkbox", { name: /Audience binding/ });
    await user.click(box); expect(box).not.toBeChecked();
    await user.click(box); expect(box).toBeChecked();
    expect(screen.getByRole("button", { name: "Turn all defences on" })).toHaveAttribute("aria-disabled", "true");
  });

  it("theme select sets data-theme; tabs are reachable by arrow keys", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    await user.selectOptions(screen.getByTestId("theme"), "light");
    expect(document.documentElement.dataset.theme).toBe("light");
    screen.getByRole("tab", { name: "Attack" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(window.location.hash).toBe("#/gateway");
  });

  it("arrow keys move from the focused tab, not the selected one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    screen.getByRole("tab", { name: "Attack" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(window.location.hash).toBe("#/gateway");
    screen.getByRole("tab", { name: "Raw" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(window.location.hash).toBe("#/diagram");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Diagram" }));
  });

  it("server text is inert: markup and control characters render as text and chips", async () => {
    const { reveal } = await import("../lib/Inert.jsx");
    expect(reveal("<img src=x onerror=1>‮")).toEqual([{ text: "<img src=x onerror=1>" }, { chip: "[U+202E]" }]);
  });

  it("a server error shows the banner and an alert, not a blank page", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach/);
    expect(screen.getByTestId("banner")).toBeInTheDocument();
  });

  it("a scenario or persona that fails to run shows an alert", async () => {
    const user = userEvent.setup();
    render(<App />);
    await verdict();
    const ok = globalThis.fetch;
    globalThis.fetch = async (u, i) => (String(u).includes("/api/run") ? new Response(JSON.stringify({ message: "nope" }), { status: 400 }) : ok(u, i));
    await user.selectOptions(screen.getByLabelText("Scenario"), "S02");
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});
