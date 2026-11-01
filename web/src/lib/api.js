// Same origin only: every URL is a path.
export async function getJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function postJson(path, body = {}) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
  return data;
}
const q = (vertical) => (vertical ? `?vertical=${encodeURIComponent(vertical)}` : "");
export const getCatalog = (vertical) => getJson(`/api/catalog${q(vertical)}`);
export const getDiagram = (vertical, name = "replay") => getJson(`/api/diagram${q(vertical)}${vertical ? "&" : "?"}name=${encodeURIComponent(name)}`);
export const getInfo = () => getJson("/api/info");
// The header toggle asks the server for a mode. Live is answered with data ({ accepted: false, message }), never an error.
export const requestMode = (mode) => getJson(`/api/mode?requested=${encodeURIComponent(mode)}`);
export const resetServer = () => postJson("/api/reset");
export const runScenario = (scenario, vertical, off = []) => postJson("/api/run", { scenario, vertical, off });
export const getMutation = (scenario, vertical) => postJson("/api/mutation", { scenario, vertical });
