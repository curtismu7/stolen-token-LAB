# References

Read on 2026-10-21 from the rfc-editor.org text. "read" means the relevant sections were fetched and summarised by a fetch tool and the points below were taken from that;
it does not mean word-by-word review. Anything not listed here is UNVERIFIED.

| Source | Flag | Used for |
|---|---|---|
| [RFC 9449 DPoP](https://www.rfc-editor.org/rfc/rfc9449) | verified (sections 4.2, 4.3, 5, 6.1, 7.1, 8, 9) | proof header `typ=dpop+jwt`, `alg` asymmetric, `jwk` public only; claims `jti`, `htm`, `htu`, `iat`, `ath`, `nonce`; the 12-point server checklist; `htu` without query and fragment; `cnf.jkt`; `Authorization: DPoP`; `invalid_dpop_proof`, `use_dpop_nonce`, `DPoP-Nonce`; `algs` in the challenge |
| [RFC 8705 mTLS](https://www.rfc-editor.org/rfc/rfc8705) | verified (section 3) | `cnf` with `x5t#S256` = base64url SHA-256 of the certificate DER; resource server must match the presented certificate; mismatch is 401 `invalid_token` |
| [RFC 8707 Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707) | verified (sections 1 to 2, security) | `resource` parameter; AS should audience-restrict the token to it; `invalid_target`; audience restriction stops use at other resource servers |
| [RFC 6750 Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750) | verified (1.2, 3.1, 5) | bearer = whoever holds it; token disclosure, redirect and replay threats; `invalid_token` 401, `insufficient_scope` 403; short lifetimes, audience restriction, TLS |
| [RFC 9700 OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700) | verified in part (about the first 100 000 of 124 665 characters: 2.2.1, 2.3, 4.9.3, 4.10, 4.10.1, 4.10.2) | SHOULD sender-constrain (DPoP or mTLS) and audience-restrict access tokens; attacker with token and key defeats sender-constraining |
| [RFC 7638 JWK Thumbprint](https://www.rfc-editor.org/rfc/rfc7638) | verified | required members `crv`, `kty`, `x`, `y` for EC, sorted, no whitespace, SHA-256, base64url |
| Ping product behaviour (PingFederate / PingOne and DPoP) | **UNVERIFIED** | owner-stated: only PingFederate supports DPoP and ID-JAG; not re-read in product docs this session |
