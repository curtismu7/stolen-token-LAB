# Safety

## Simulated vs real

| Thing | Real or simulated |
|---|---|
| Authorization server, gateway, APIs | Simulated: in-process mocks |
| Access tokens | Real ES256 JWTs, minted by the mock AS, labelled `mock: true`, signed with fixture keys. Worthless anywhere else |
| DPoP proofs | Real ES256 JWTs verified by real code in the mock gateway (RFC 9449 checks) |
| `jkt`, `ath`, certificate thumbprint | Computed by code (RFC 7638 / SHA-256 base64url) |
| mTLS | **Simulated.** No TLS. A request header (`X-Simulated-Client-Cert-SHA256`) carries the thumbprint of a labelled fake certificate |
| Tenant, credentials, network | None. Hosts are `.example` only |
| Live mode | **None.** The header has a Mock and a Live button; Live is refused with a message and the page stays in Mock. There is no live engine behind it |

## Rules this repo enforces (and tests pin)

1. Loopback bind unless `STLAB_BIND` is set on purpose. Host header must be a loopback name. Writes must be same-origin.
2. Zero outbound network: a netguard refuses non-loopback sockets, DNS, fetch, UDP send and UDP connect and records the attempt; the doctor self-tests it; a test proves serving the API makes none.
3. Ports 4950 to 4999 only, never a reserved one.
4. No literal JWT, `sk-` key or real hostname in shipped data (`GET /api/safety-scan`, the doctor and a repo test scan for it). Tokens are minted at run time.
5. No `crypto.generateKeyPairSync` anywhere (a repo test enforces it).
6. Free text is carried as data and rendered inert by the UI. Request bodies are capped at 16 kB. JWT parsing is size-limited; walkers are iterative or depth-limited.
7. The lab reads no settings file: it needs no tenant, so nothing from the shared `~/Development/.env` ever enters its environment. `PORT`, `STLAB_BIND` and `HOST_PORT` come from the shell.
8. gitleaks pre-commit hook and CI; forbidden-identifier history gate in CI (the list lives on the runner, never in the repo).

## UNVERIFIED

- **PingOne and DPoP.** Owner-stated rule for this family: in the Ping stack only PingFederate supports DPoP and ID-JAG. This lab does not say anything about what PingOne supports and does not use PingOne. Not re-verified here against product documentation.
- Whether any real gateway answers a wrong audience with 401 or 403, and which error text it uses. This lab's choices (401 `invalid_token`) are plausible, not measured.
- The `jti` replay cache holds at most 10000 entries (`JTI_CACHE_MAX`). When full it refuses new proofs (fail closed) instead of forgetting; while the DPoP signature and key binding checks are on, only a key holder can fill it, because they run first. With both switched off, anyone holding the stolen token can fill it (the `ath` value is computable from the token) and refuse other DPoP proofs for the 120 second memory window.
- A token carrying both `cnf.jkt` and `cnf` `x5t#S256` must satisfy both bindings. The mock AS never mints one; the gateway behaviour is pinned by a test.
- The 60 second `iat` window and 120 second `jti` memory are this lab's policy; RFC 9449 leaves the window to the server.
- RFC 9700 was read only up to roughly four fifths of its text (sections 2 to 4.10 were covered); later sections were not read.
- All RFCs were read through a summarising fetch tool, not word by word. See `docs/references.md`.
- Real-world behaviour of any specific product with a stolen token (not exercised: no real products are involved).
