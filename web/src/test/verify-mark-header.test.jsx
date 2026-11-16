import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import App from "../App.jsx";
import { installFakeServer } from "./fakeServer.js";

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (through the lab-proxy
// that call reaches the shelf, whose payload lists every demo with its mark). The lab's own /api/shelf has no demos, so there is no mark then.
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); });

const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });
function withShelf(payload) {
  installFakeServer();
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (url === "/api/shelf" ? Promise.resolve(new Response(JSON.stringify(payload))) : real(url, init));
}
const header = async () => within(await screen.findByTestId("top-menu"));

describe("verification mark in the header", () => {
  it("shows this lab's own mark beside the Shelf link, and no other lab's", async () => {
    withShelf({ shelfUrl: "http://shelf.example", demos: [
      { id: "other-lab", verification: mark("in-progress", "In progress") },
      { id: "stolen-token-lab", verification: mark("verified", "Verified", { note: "Every defence run on the mock" }) },
    ] });
    render(<App />);
    const bar = await header();
    expect(await bar.findByText("Verified")).toBeInTheDocument();
    expect(bar.getByRole("link", { name: /Shelf/ })).toBeInTheDocument();
    expect(bar.queryByText("In progress")).toBeNull();
    expect(bar.getAllByText("Verified")).toHaveLength(1);
    expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Every defence run on the mock"));
  });

  it("shows nothing when the lab is opened on its own port (its /api/shelf has no demos) or the shelf has no mark for it", async () => {
    for (const payload of [{ shelfUrl: "http://shelf.example" }, { shelfUrl: "http://shelf.example", demos: [{ id: "stolen-token-lab", verification: null }] }, { shelfUrl: "http://shelf.example", demos: [{ id: "stolen-token-lab", verification: mark("none", "None") }] }]) {
      withShelf(payload);
      const { unmount } = render(<App />);
      const bar = await header();
      expect(await bar.findByRole("link", { name: /Shelf/ })).toBeInTheDocument(); // the shelf answered, and still no badge
      expect(document.querySelector(".verify")).toBeNull();
      unmount();
    }
  });
});
