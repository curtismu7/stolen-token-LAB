# Live checks (optional, owner only)

Nothing in this repo talks to a real authorization server, gateway or tenant, and the tests prove it (netguard). This page is for the owner who wants to compare the mock with real products. **It is instructions only: no script in this repo runs any of it, and the agent that built this repo never ran it.** Run it from your own shell. Never paste tenant ids, client ids, hostnames, keys or tokens into this repo, its issues or its commit messages.

**Read-only first.** Every check sends at most one call with a token you already own, to a test environment. Anything that creates, changes or revokes configuration is owner-only and listed last.

## What you need

- A test authorization server and a test API behind a gateway, hosts held in shell variables you set yourself (`AS`, `API`). Tokens held in a `chmod 600` file outside this repo, loaded with `TOKEN=$(cat ~/path/outside/repo)`. Never print them.

## Checks

1. **Bearer really is replayable (S01).** Call `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" https://$API/resource` from a machine other than the one that obtained the token. A 200 confirms plain bearer behaviour. Mock equivalent: S01.
2. **Audience binding (S02).** Present the same token to a second API that should not accept it. Expect 401 or 403. UNVERIFIED: the exact status and error body vary by product; the mock uses the RFC 6750 shape.
3. **Does your server issue DPoP-bound tokens? (S03 to S12).** Decode the access token payload locally (`cut -d. -f2 | base64 -d`) and look for `cnf.jkt`. Absent means the token is plain bearer whatever the client sends. Note on products: per the owner's earlier findings only PingFederate supports DPoP in the Ping stack and PingOne does not; this is UNVERIFIED for any current release, so re-check the product docs before saying it to a customer.
4. **Downgrade (S04).** If a token carries `cnf.jkt`, send it with `Authorization: Bearer` and no proof. A correct resource server refuses; an accepting one makes DPoP decoration.
5. **Proof replay (S05).** Send one valid proof twice. The second should be refused (jti cache). UNVERIFIED: whether your gateway keeps a replay cache.
6. **Nonce (S11).** If the server requires a nonce, expect 401 with a `DPoP-Nonce` header, then success on retry with the nonce in the proof.
7. **mTLS-bound tokens (S14).** Needs real TLS and a test client certificate; the lab only simulates this with a header. Compare `cnf["x5t#S256"]` in the token with the SHA-256 thumbprint of the certificate you presented.

## Not covered here (writes, owner only)

- Turning on DPoP or certificate binding for a client in your authorization server.
- Changing gateway policy to require proofs or nonces.

## Recording results

Keep a few lines in your own notes (not this repo): date, product version, which checks matched the mock, which differed. If a difference changes what an SE should say, update `docs/talk-track.md` and `docs/safety.md` in a normal commit that names no tenant details.

## After you are done

Delete any captured output and the token file if it was temporary. Do not commit them.
