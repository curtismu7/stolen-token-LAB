import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCatalog, getDiagram, getInfo, requestMode, resetServer, runScenario } from "./lib/api.js";
import { fill } from "./lib/fill.js";
import { startBoxes } from "./lib/diagram.js";
import ModeToggle from "./components/ModeToggle.jsx";
import AttackTab from "./tabs/AttackTab.jsx";
import GatewayTab from "./tabs/GatewayTab.jsx";
import TokenTab from "./tabs/TokenTab.jsx";
import DiagramTab from "./tabs/DiagramTab.jsx";
import RawTab from "./tabs/RawTab.jsx";

export const TABS = [["attack", "Attack"], ["gateway", "Gateway"], ["token", "Token"], ["diagram", "Diagram"], ["raw", "Raw"]];
// The banner is never blank and always names the mode: this is the text used until the server answers (the server's own banner replaces it).
export const FALLBACK_BANNER = "MOCK mode. SIMULATED: mock gateway, mock authorization server and mock tokens. No tenant, no outbound network. The mTLS defence is a simulation (no real TLS).";
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } };
const tabFromHash = () => { const id = window.location.hash.replace(/^#\/?/, "").split("?")[0]; return TABS.some(([t]) => t === id) ? id : "attack"; };
const typing = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

export default function App() {
  const [data, setData] = useState(null); // { catalog, diagram, epoch }
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState(tabFromHash);
  const [theme, setTheme] = useState(() => (["light", "dark"].includes(read("stl.theme", "")) ? read("stl.theme", "") : "system"));
  const [present, setPresent] = useState(() => read("stl.present", "0") === "1");

  useEffect(() => { Promise.all([getCatalog(), getDiagram(), getInfo()]).then(([catalog, diagram, info]) => setData({ catalog, diagram, epoch: info.epoch })).catch((e) => setLoadError(e.message)); }, []);
  useEffect(() => { const on = () => setTab(tabFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => { if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (present) document.documentElement.dataset.present = "1"; else delete document.documentElement.dataset.present; }, [present]);
  // Presenter mode: P toggles, Esc leaves. Ignored while typing and with a modifier key held, so Cmd+P (print) and the like are left alone.
  useEffect(() => {
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "p" || e.key === "P") setPresent((v) => { write("stl.present", v ? "0" : "1"); return !v; });
      else if (e.key === "Escape") setPresent((v) => { if (v) write("stl.present", "0"); return false; });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // The banner is on every screen, loading and error states and presenter mode included.
  if (loadError || !data) {
    return (
      <>
        <SkipLink />
        <header><Banner text={FALLBACK_BANNER} /></header>
        <main className="page" id="main" tabIndex={-1}>
          {loadError ? <p className="alert" role="alert">Could not reach the mock server: {loadError}</p> : <p className="muted" role="status">Loading the mock gateway...</p>}
        </main>
      </>
    );
  }
  return <Shell data={data} setData={setData} tab={tab} theme={theme} setTheme={setTheme} present={present} setPresent={setPresent} />;
}

const SkipLink = () => <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>;
const Banner = ({ text }) => <p className="banner" role="note" data-state="mock" data-testid="banner">{text}</p>;

function Shell({ data, setData, tab, theme, setTheme, present, setPresent }) {
  const { catalog, diagram } = data;
  const [run, setRun] = useState(null);
  const [scenarioId, setScenarioId] = useState(catalog.scenarios[0].id);
  const [off, setOff] = useState([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const [boxes, setBoxes] = useState(() => startBoxes(diagram));
  const [resetNote, setResetNote] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [modeNote, setModeNote] = useState("");
  const tabRefs = useRef({});
  const seq = useRef(0);
  const epoch = useRef(data.epoch);

  const cast = useMemo(() => catalog.verticals.find((v) => v.id === catalog.vertical)?.cast || {}, [catalog]);
  const resetPositions = useCallback(() => setBoxes(startBoxes(diagram)), [diagram]);

  // Any change to scenario, persona or switches re-runs the story on a fresh mock world; only the newest answer is kept.
  const doRun = useCallback(async () => {
    const mine = ++seq.current;
    setRunning(true); setRunError(null);
    try { const r = await runScenario(scenarioId, catalog.vertical, off); if (mine === seq.current) { setRun(r); setCursor(-1); } }
    catch (e) { if (mine === seq.current) setRunError(e.message); } finally { if (mine === seq.current) setRunning(false); }
  }, [scenarioId, catalog.vertical, off]);
  useEffect(() => { doRun(); }, [doRun]);

  const pickVertical = useCallback(async (id) => {
    const [c, d] = await Promise.all([getCatalog(id), getDiagram(id)]);
    setData((cur) => ({ ...cur, catalog: c, diagram: d }));
    setBoxes(startBoxes(d));
  }, [setData]);

  const resetLocal = useCallback(() => { setOff([]); setCursor(-1); resetPositions(); setResetCount((n) => n + 1); }, [resetPositions]);
  const resetAll = useCallback(async () => {
    try {
      const r = await resetServer(); epoch.current = r.epoch; resetLocal();
      setResetNote("Reset: all defences on, mock worlds cleared, diagram positions restored.");
    } catch (e) { setResetNote(`Reset failed: ${e.message}`); }
  }, [resetLocal]);
  // A reset made through the API or `npm run reset` raises the server's epoch; the page notices when it regains focus and resets itself too.
  useEffect(() => {
    const on = () => getInfo().then((i) => { if (i.epoch !== epoch.current) { epoch.current = i.epoch; resetLocal(); setResetNote("Reset from outside the page (API or script): all defences on, diagram positions restored."); } }, () => {});
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [resetLocal]);

  // Mock | Live: ask the server. Live is refused with its message and the page stays in Mock.
  const askMode = useCallback(async (m) => {
    if (m === "mock") { setModeNote(""); return; }
    try { const r = await requestMode(m); setModeNote(r.accepted ? "" : r.message); }
    catch (e) { setModeNote(`Could not ask the server about Live mode (${e.message}). The page stays in Mock mode.`); }
  }, []);

  const cycle = () => { const next = { system: "light", light: "dark", dark: "system" }[theme]; setTheme(next); write("stl.theme", next); };
  const togglePresent = () => { write("stl.present", present ? "0" : "1"); setPresent(!present); };
  const go = (id) => { window.location.hash = `#/${id}`; };
  const onTabKey = (e) => {
    const focused = e.target.closest?.('[role="tab"]')?.id?.replace(/^tab-/, '');
    const i = TABS.findIndex(([id]) => id === (focused || tab));
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const [id] = TABS[(to + TABS.length) % TABS.length];
    go(id); tabRefs.current[id]?.focus();
  };

  const picked = catalog.scenarios.find((s) => s.id === scenarioId);
  const app = { catalog, cast, run, off, setOff, scenarioId, setScenarioId, doRun, running, runError, cursor, setCursor, diagram, boxes, setBoxes, resetPositions, resetEpoch: resetCount, present, theme };
  const Panel = { attack: AttackTab, gateway: GatewayTab, token: TokenTab, diagram: DiagramTab, raw: RawTab }[tab];

  return (
    <>
      <SkipLink />
      <header>
        <Banner text={catalog.banner || FALLBACK_BANNER} />
        <div className="head">
        <h1 className="head__title"><span className="head__mark" aria-hidden="true">JKT</span> Stolen-token LAB</h1>
        <div className="head__tools">
          <ModeToggle mode="mock" onAsk={askMode} />
          <label className="inline">Persona
            <select value={catalog.vertical} onChange={(e) => pickVertical(e.target.value)} aria-label="Persona and vertical">
              {catalog.verticals.map((v) => <option key={v.id} value={v.id}>{v.name}: {v.cast.user} and {v.cast.agent}</option>)}
            </select>
          </label>
          <button type="button" onClick={resetAll}>Reset lab</button>
          <button type="button" aria-pressed={present} onClick={togglePresent}>{present ? "Exit presenter (Esc)" : "Presenter (P)"}</button>
          <button type="button" onClick={cycle} title="Theme: system, light, dark">Theme: {theme}</button>
        </div>
        </div>
      </header>
      {modeNote && <p className="alert page" role="status" data-testid="mode-note">{modeNote}</p>}
      <main className="page" id="main" tabIndex={-1}>
        <p className="muted" role="status" data-testid="reset-note">{resetNote}</p>
        {present && picked?.talk && (
          <aside className="presenter-say" aria-label="Talk track" data-testid="presenter-say"><strong>{picked.id}.</strong> <span>{fill(picked.talk, cast)}</span></aside>
        )}
        <div className="tabs" role="tablist" aria-label="Lab sections" onKeyDown={onTabKey}>
          {TABS.map(([id, label]) => (
            <button key={id} id={`tab-${id}`} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" aria-selected={id === tab} aria-controls="panel" tabIndex={id === tab ? 0 : -1} onClick={() => go(id)}>{label}</button>
          ))}
        </div>
        <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <p className="lede" data-admin-only>{fill("What stops {{user}}'s token being replayed by someone else? Nothing, unless the gateway binds it to something the thief does not have.", cast)}</p>
          <Panel app={app} />
        </div>
      </main>
    </>
  );
}
