# Stolen-token LAB

Replay a captured access token against a mock API, through a mock gateway, and see what stops it: nothing (bearer), audience binding, DPoP, or a certificate binding.

Tier: Tester
Repo: https://github.com/ping-sandbox/stolen-token-LAB
Catalog: C22 (a row in the demo-shelf catalog, which lists it as kind Demo; this README declares Tester, as the rulebook does)

Every defence is a switch on the gateway: turn one off and exactly the attack it was stopping gets through.

## What is simulated

**Everything here is SIMULATED.** The lab runs in Mock mode only: a mock authorization server, a mock gateway, two mock APIs and mock tokens (labelled `mock: true`, signed with throwaway fixture keys), all in one process. There is no tenant, no real credential and no outbound network (a netguard refuses it and a test proves it). The mTLS defence is a simulation: there is no real TLS, a header stands in for the client certificate. The banner on every page says so, also in presenter mode.

**Live mode: none.** The header has a Mock | Live toggle on every page, but this lab has no live engine. Live is refused with a message and the page stays in Mock. (The `/api/live` routes are the hand-stepped mock world of the gateway; they are not Live mode.)

| Defence | Stops | Does not stop |
|---|---|---|
| none (plain bearer) | nothing: replay works (the lesson) | everything |
| Audience binding (RFC 8707 `resource`, `aud`) | the token being used at another API | use at the intended API |
| DPoP (RFC 9449): `cnf.jkt` plus a per-request proof | the stolen token without the key, replayed proofs, a proof for another URL or method, a proof for another token, stale proofs | an attacker who also has the private key (S13, the honest limit) |
| mTLS-bound token (RFC 8705, simulated) | the token without the matching certificate | an attacker who also has the certificate and key |

Fourteen scenarios (S01 to S14) as data in `server/data/scenarios.json`, in three vertical packs (travel, banking, retail) with `{{cast}}` tokens. Each scenario states what the attacker stole (token only, token plus proof, token plus key). `docs/references.md` lists every RFC and whether it was read. Product claims are labelled UNVERIFIED in `docs/safety.md`.

## Run from a clone

Prerequisites: Node 26 or newer (`.nvmrc` says 26). Docker only if you use the Docker form. You need access to the `ping-sandbox` organisation (the repo is internal).

```
git clone https://github.com/ping-sandbox/stolen-token-LAB.git
cd stolen-token-LAB
npm ci
npm run build
npm start
```

Then open http://localhost:4950/ . Everything works in Mock mode with no setup at all: no settings file, no tenant, no network. `./scripts/run.sh` does install, build, doctor and start in one go.

The pages: Attack (pick a scenario, see what was stolen and the verdict), Gateway (the ten defence switches and the mutation proof), Token (claims and the DPoP proof), Diagram (ReactFlow: movable boxes, Simulate, Reset, speed) and Raw (request, response, gateway log). Presenter mode: press `P` (or the Presenter button), `Esc` to leave; the banner and the mode stay on screen.

## Settings file

This lab reads **no settings file**. It needs no tenant and holds no credentials, so nothing from the shared `~/Development/.env` (or `STANDALONE_ENV`) ever enters its environment. There is no per-app `.env` loader. The only settings are shell variables, all optional:

- `PORT`: the port the server listens on (see Ports below).
- `STLAB_BIND`: the bind address. Loopback (`127.0.0.1`) unless you set this on purpose; the Docker image sets it, and compose publishes on `127.0.0.1` only.
- `HOST_PORT`: Docker only, the host port compose publishes on `127.0.0.1`.
- `VITE_PORT`: the Vite dev server port (development only).

## Ports, and what to do if the port is taken

Ports: stolen-token-LAB listens on 4950 (set with `PORT`, default 4950). Vite dev server: 4951 (`VITE_PORT`). Docker host port: 4950 (`HOST_PORT`).
Port range for this app: 4950-4999. A `PORT` outside it is refused.

If the port is taken:
1. Find what is using it:
   `lsof -iTCP:4950 -sTCP:LISTEN -n -P`
2. If it is an old copy of this app, stop that process: `kill <PID>`.
3. If it is something else, either stop it or start this app on another port:
   `PORT=<other port> npm start`
4. Do not use 8080, 5173, 3000, 4000, 4400, 4510, 4600-4601, 18080, 19080 or 19090. Those are taken by other demos or other tools.

## Mock and live modes

The header on every page has a **Mock | Live** toggle and a chip that names the mode, and the banner starts with the same mode ("MOCK mode. SIMULATED: ..."). Mock is the default and the only mode that runs. Clicking Live asks `GET /api/mode?requested=live`; the answer is data (`accepted: false` and the message), the page shows the message under the header and stays in Mock. A write that carries `mode: "live"` is refused with 409 `live_unavailable`. A bare `MODE` environment variable is not read.

## Health, doctor and reset

```
npm run doctor   # node version, bind, port range, story data, netguard self-test (7 routes out), scenarios, diagrams, an HTTP cycle, port free
npm run reset    # POST /api/reset on a running lab (PORT=4951 npm run reset for another port); there are no saved settings to keep
```

`GET /api/health` answers `demo-health/1` (state `ready` while the doctor checks pass). The in-page **Reset lab** button does the same and also puts the defence switches and the diagram box positions back; a page that is open while `npm run reset` runs notices when it regains focus and resets itself too.

Other routes: `GET /api/info`, `GET /api/mode`, `GET /api/diagram` (the picture, as `diagram-studio/1` data), `GET /api/catalog` (scenarios, controls, verticals), `POST /api/run` `{ scenario, vertical?, off? }`, `POST /api/run-all`, `POST /api/mutation` `{ scenario }`, `GET /api/live`, `PUT /api/live/controls`, `POST /api/live/step`, `GET /api/safety-scan`. Writes must be same-origin and the Host must be a loopback name.

## Docker (optional)

```
HOST_PORT=4950 docker compose up --build -d
```

The image is `node:26-alpine`, runs as the non-root `node` user with a read-only file system and all capabilities dropped, and compose publishes `127.0.0.1` only (a test pins it). Use OrbStack, not Docker Desktop. For `npm run reset` against Docker set `PORT` to the published port.

## Tests

```
npm test
```

On Node 26, a good run is: 97 server tests, 31 web tests, 27 repo and script tests, all passing. `npm run mutation-check` breaks each gateway rule in a throwaway copy and requires the tests to fail. `npm run content-pack` builds and validates the Learning Hub pack (`content-pack.json`, `demo-content-pack/1`). `npm run talk-track` regenerates `docs/talk-track.md` from the scenario data; a test fails if the committed file has drifted. The browser logs the deliberate 4xx answers of the hostile-input tests as console messages; the pages themselves log none.

## Troubleshooting

- **Port is taken** (`EADDRINUSE`, or doctor says the port is not free): see Ports above.
- **The page says "Could not reach the mock server"**: the server is not running or is on another port. Start it with `npm start`, or set `PORT`.
- **Blank page after a fresh clone**: the web build is missing. Run `npm run build`.
- **Doctor fails on the node line**: you need Node 26 or newer (`nvm use` reads `.nvmrc`).
- **Live does nothing**: that is on purpose. This lab has no live engine; see Mock and live modes.

## Ownership

- Owner: the Ping demo family owner (see the ping-sandbox organisation).
- License: MIT (`LICENSE`).
- Found a problem? Open an issue on the repo.

---

More: `docs/architecture.md` (how it works), `docs/safety.md` (simulated vs real, the UNVERIFIED list), `docs/references.md` (RFCs, verified or not), `docs/talk-track.md`, `docs/live-checks.md` (optional owner-run steps against real products, instructions only), `docs/shelf-entry.json` (demo shelf), `content-pack.json` (Learning Hub).

Related, not duplicated: attack-gallery (named attacks across the family; this is the deep dive on token theft), token-workbench (decode and flow catalog; this lab keeps only a small token panel), intent-par-inspector, mcp-auth-conformance-lab (authorization conformance, not theft).
