# Architecture

```
scenario data (JSON steps) --> world.exec --> mock AS (mints tokens)
                                   |
                                   +--> mock gateway (10 toggles) --> mock API a / mock API b
```

All of it runs inside one Node process. Nothing opens a socket except the loopback HTTP server for the UI and API.

- `server/src/jose.js`: ES256 only. Keys are fixture keys: private scalar = SHA-256 of a fixed label, built with `createECDH` then `createPrivateKey` (JWK form).
  Never `generateKeyPairSync` (it aborts under GC on Node 20 on this machine). `jkt` is the RFC 7638 thumbprint computed by code. Parsers have hard size limits and throw `JoseError`.
- `server/src/as.js`: mock authorization server. Mints `at+jwt` access tokens: `bearer` (no `cnf`), `dpop` (`cnf.jkt`), `mtls` (`cnf` `x5t#S256` of a labelled fake certificate).
- `server/src/gateway.js`: the checks, in order: credential, token (signature, typ, iss, exp: always on), audience, then DPoP (format always on; signature, binding, htm, htu, nonce, iat, ath, jti) or mTLS binding.
  Each toggle is skipped and logged as `skipped` when off. 401 challenges carry `error` and, for DPoP, `algs`; `use_dpop_nonce` also carries `DPoP-Nonce`.
- `server/src/world.js`: one lab world (virtual clock, AS, gateway, issued tokens, captured requests) and the step grammar (`issue`, `call`, `advance`, `rotate-nonce`),
  strictly validated (`stepProblem`: unknown fields, prototype-pollution names, wrong types all refused).
  A `call` with `send:false` captures a request in flight without delivering it (so its `jti` stays fresh); a `call` with `replay` resends a captured or earlier request, optionally with a changed path, method or token.
- `server/src/runner.js`: runs a scenario in a fresh world and the mutation proof.
- `server/src/stories.js`: scenario and vertical data, `{{cast}}` rendering.
- `server/src/trace.js`: traceparent, raw request and response, gateway log. Tokens are shown in full in raw text (mock, fixture-signed; owner rule: tokens are shown raw).
- `server/src/mode.js`: Mock | Live. The lab has no live engine, so Live is refused everywhere it is asked for (the header toggle asks `GET /api/mode?requested=live` and gets `accepted: false` with the message; a write that carries `mode: "live"` gets 409 `live_unavailable`).
- `server/diagrams/replay.json` and `server/src/diagramData.js`: the picture is `diagram-studio/1` data loaded by name and checked with a copy of the studio's validator (`diagramStudioValidate.js`); the web app draws what the data says and lights it from the scenario steps (edge `id` values are the keys it lights).
- `server/src/talkTrack.js`: `docs/talk-track.md` is generated from each scenario's `talk` line (`npm run talk-track`); a test fails if the committed file differs.
- `server/src/safety.js`, `netguard.js`, `health.js`, `doctor.js`, `app.js`: loopback bind, Host check, same-origin writes, zero outbound (self-tested), `demo-health/1`, preflight, the Express app.

## The mutation proof

Every scenario names its `attackStep` and the one control that blocks it (`blockedBy`). The runner switches each of the ten controls off alone and checks the attack step gets through
if and only if that control is the blocker (scenarios with no blocker, S01 and S13, get through every time). The doctor runs this for every scenario in every vertical at startup, and `npm run mutation-check` goes one level further: it breaks the gateway source itself and requires the test suite to fail.

## Design choices that are local policy, not RFC text

- The proof `iat` window is plus or minus 60 seconds.
- A proof `jti` is remembered for 120 seconds, and only after every other check passed (a failed proof does not burn its `jti`).
- Wrong audience is answered 401 `invalid_token`.
- The nonce is a counter (`mock-nonce-N`) that changes only on `rotate-nonce`.
