import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShelfLink from "./components/ShelfLink.jsx";// Opened from Customer Agent LAB (UC12 routes here): strip below the banner + header Back only; nothing is preselected.
import ReturnLink from "./return-link/ReturnLink.jsx";
import { getCatalog, getDiagram, getInfo, resetServer, runScenario, setMode } from "./lib/api.js";
import { fill } from "./lib/fill.js";
import { startBoxes } from "./lib/diagram.js";
import AttackTab from "./tabs/AttackTab.jsx";
import GatewayTab from "./tabs/GatewayTab.jsx";
import TokenTab from "./tabs/TokenTab.jsx";
import DiagramTab from "./tabs/DiagramTab.jsx";
import RawTab from "./tabs/RawTab.jsx";
import TopMenu from "./top-menu/TopMenu.jsx";

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
  const [modeInfo, setModeInfo] = useState(null);
  const [tab, setTab] = useState(tabFromHash);
  const [theme, setTheme] = useState(() => (["light", "dark"].includes(read("stl.theme", "")) ? read("stl.theme", "") : "system"));
  const [present, setPresent] = useState(() => read("stl.present", "0") === "1");

  useEffect(() => { Promise.all([getCatalog(), getDiagram(), getInfo()]).then(([catalog, diagram, info]) => { setData({ catalog, diagram, epoch: info.epoch }); setModeInfo(info); }).catch((e) => setLoadError(e.message)); }, []);
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
  return <Shell data={data} setData={setData} modeInfo={modeInfo} setModeInfo={setModeInfo} tab={tab} theme={theme} setTheme={setTheme} present={present} setPresent={setPresent} />;
}

const SkipLink = () => <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>;
const Banner = ({ text }) => <p className="banner" role="note" data-state="mock" data-testid="banner">{text}</p>;

function Shell({ data, setData, modeInfo, setModeInfo, tab, theme, setTheme, present, setPresent }) {
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

  // Mock | Real (rule 19): the toggle POSTs /api/mode. Real is refused (409) with the server's reason; a
  // mock switch keeps the mode. Either way every switch reloads all the lab's data.
  const [modeNote, setModeNote] = useState("");
  const selectMode = useCallback(async (next) => {
    if (next === "mock" && modeInfo?.source === "mock") return;
    try {
      await setMode(next);
      const info = await getInfo();
      setModeInfo(info);
      const [c, d] = await Promise.all([getCatalog(catalog.vertical), getDiagram(catalog.vertical)]);
      setData((cur) => ({ ...cur, catalog: c, diagram: d }));
      setBoxes(startBoxes(d));
      setModeNote("");
    } catch (e) {
      setModeNote(e.message);
      getInfo().then(setModeInfo).catch(() => {});
    }
  }, [modeInfo, catalog, setData]);

  const setThemePersist = (v) => { setTheme(v); write("stl.theme", v); };
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
        <ReturnLink app="stolen-token-lab" />
        <div className="head">
        <h1 className="head__title"><span className="head__mark" aria-hidden="true">JKT</span> Stolen-token LAB</h1>
        <div className="head__tools">
            <ReturnLink app="stolen-token-lab" variant="header" />
            <TopMenu
              mode={{ value: modeInfo?.source === "real" ? "real" : "mock", onChange: selectMode, realAvailable: modeInfo?.realAvailable === true, realHint: modeInfo?.realAvailable !== true ? modeInfo?.realReason : undefined }}
              vertical={{ value: catalog.vertical, onChange: pickVertical, options: catalog.verticals.map((v) => v.id) }}
              theme={{ value: theme === "system" ? "auto" : theme, onChange: setThemePersist }}
              present={{ active: present, onToggle: togglePresent, label: "Presenter (P)" }}
              help={{ href: "https://github.com/curtismu7/stolen-token-LAB#readme" }}
              version={modeInfo?.version || null}
              onReset={resetAll}
            >
              <ShelfLink />
            </TopMenu>
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
