# stolen-token-LAB (catalog C22, Tester tier)

Replays a captured access token against a mock gateway and shows which defence (audience binding, DPoP, simulated mTLS) stops it. Everything is simulated, in-process, Mock mode only: Live is refused (no live engine). No outbound network (netguard refuses and self-tests, UDP connect included).

## Run and test
- `./scripts/run.sh` install, build, doctor, start (app on 4950; use only ports 4950-4999). `npm run doctor`, `npm run reset`.
- `npm test` runs server, web and `scripts/*.test.mjs`. Use globs (`node --test test/*.test.js`), never a directory. Node 26 only.
- `npm run content-pack` builds and validates the Learning Hub pack. `npm run talk-track` regenerates `docs/talk-track.md` from the scenario data (a test fails on drift). `npm run mutation-check` runs the mutation proof.

## Rules that bite
- Tokens are shown raw (owner rule 4); they are fixture-signed mock tokens labelled `mock: true`. No real secrets exist here.
- Never `crypto.generateKeyPairSync('ec')` or async EC `generateKeyPair`. Build P-256 keys with `createECDH` + `createPrivateKey` (`server/src/jose.js`).
- No identifiers from other projects: only `.example`/`.invalid` hosts. The forbidden-identifier history gate runs in CI from a repo secret; never read or embed the list here.
- Loopback-only bind, Host check, same-origin writes; compose publishes `127.0.0.1:` only (pinned by a test).
- Settings: the lab reads no settings file and has no per-app `.env` loader; no bare `MODE` variable (Mock | Live is a header toggle, Live refused).
- The diagram is `diagram-studio/1` data (`server/diagrams/replay.json`, loaded by name); edge `id` values are the keys the page lights. ReactFlow only: movable boxes, Simulate, Reset (restores positions), speed control.
- CSS: the vendored `web/src/styles/standalone-ui.css` must stay byte-identical to the canonical copy; app CSS uses tokens only (`check-css.sh`). Run buttons use `aria-disabled`, never `disabled`.
- No AI attribution anywhere (owner, 2026-11-07): no Co-Authored-By trailer and no "Generated with" line in commits, PR bodies or files; CI runs `scripts/check-no-ai-attribution.sh`; one writer per repo; PR + merge on green; hosted CI only.
