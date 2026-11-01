#!/usr/bin/env node
// Mutation pinning: break each real-behaviour rule in a throwaway copy of server/ and require the server tests to FAIL.
// A mutation that the tests survive means a rule is not pinned. Exits 1 if any mutant survives, does not apply or does not parse.
// "killed" means the server tests exited non-zero on a mutant that parses (a crash or hang also counts, as the rulebook allows).
//   node scripts/mutation-check.mjs [--only <label-substring>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MUTATIONS = [
  ['audience: aud not checked', 'gateway.js', "if (!aud(t.aud).includes(api.resource))", "if (false)"],
  ['dpop_binding: DPoP-bound token accepted as Bearer', 'gateway.js', "if (bind && scheme !== 'DPoP')", "if (false)"],
  ['dpop_binding: missing proof accepted', 'gateway.js', "if (bind && !proofPresent)", "if (false)"],
  ['dpop_binding: proof key not compared to cnf.jkt', 'gateway.js', "if (jwkThumbprint(p.header.jwk) !== boundJkt)", "if (false)"],
  ['dpop_signature: proof signature not verified', 'gateway.js', "if (!verifyJwtSig(p, p.header.jwk))", "if (false)"],
  ['dpop_htm: method not compared', 'gateway.js', "if (c.htm !== htmReq)", "if (false)"],
  ['dpop_htu: URI not compared', 'gateway.js', "if (have !== want)", "if (false)"],
  ['dpop_nonce: nonce not required', 'gateway.js', "if (c.nonce !== currentNonce())", "if (false)"],
  ['dpop_iat: window not enforced', 'gateway.js', "Math.abs(nowS - c.iat) > IAT_WINDOW_S", "false"],
  ['dpop_iat: future proofs accepted', 'gateway.js', "Math.abs(nowS - c.iat) > IAT_WINDOW_S", "nowS - c.iat > IAT_WINDOW_S"],
  ['dpop_ath: ath not compared', 'gateway.js', "if (c.ath !== sha256b64u(tt))", "if (false)"],
  ['dpop_jti: replay cache not consulted', 'gateway.js', "if (seen.has(c.jti))", "if (false)"],
  ['dpop_jti: accepted jti not remembered', 'gateway.js', "seen.set(c.jti, now + 2 * IAT_WINDOW_S * 1000);", ""],
  ['dpop_jti: remembered jti expires almost at once', 'gateway.js', "now + 2 * IAT_WINDOW_S * 1000", "now + 1"],
  ['dpop_jti: full cache forgets (fail open)', 'gateway.js', "if (seen.size >= jtiMax)", "if (false)"],
  ['world: rotate-nonce does nothing', 'world.js', "gateway.rotateNonce()", "gateway.currentNonce()"],
  ['mtls_binding: certificate thumbprint not compared', 'gateway.js', "presented !== x5t", "false"],
  ['controls: toggles ignored (always on)', 'gateway.js', "const gate = (control) => { if (controls[control]) return true;", "const gate = (control) => { if (true) return true;"],
  ['dpop proof: typ not checked', 'gateway.js', "if (p.header.typ !== 'dpop+jwt')", "if (false)"],
  ['dpop proof: alg none / HMAC allowed', 'gateway.js', "if (p.header.alg !== 'ES256')", "if (false)"],
  ['dpop proof: jwk with private key allowed', 'jose.js', "for (const m of PRIVATE_MEMBERS) if (Object.hasOwn(jwk, m)) return 'jwk contains private key material';", ""],
  ['dpop proof: duplicate DPoP header allowed', 'gateway.js', "if (Array.isArray(raw))", "if (false)"],
  ['access token: signature not verified', 'gateway.js', "if (!verifyJwtSig(tok, as.publicJwk))", "if (false)"],
  ['access token: expiry not enforced', 'gateway.js', "t.exp <= nowS", "false"],
  ['access token: issuer not checked', 'gateway.js', "if (t.iss !== ISSUER)", "if (false)"],
  ['jkt: thumbprint member order wrong', 'jose.js', "{ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }", "{ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }"],
  ['jwt: size limit removed', 'jose.js', "if (token.length > LIMITS.token) throw new JoseError('token too large');", ""],
  ['safety: cross-site writes allowed', 'safety.js', "if (site && site !== 'same-origin' && site !== 'none')", 'if (false)'],
  ['safety: Host check removed', 'safety.js', "if (!isLoopbackHost(host)) return res.status(403).json({ error: 'bad_host'", "if (false) return res.status(403).json({ error: 'bad_host'"],
  ['safety: port range widened', 'safety.js', 'port < PORT_MIN || port > PORT_MAX', 'false'],
  ['netguard: fetch not guarded', 'netguard.js', "if (!isLoopbackHost(url.hostname)) { attempts.push(`fetch:", "if (false) { attempts.push(`fetch:"],
  ['netguard: udp connect not guarded', 'netguard.js', "if (!ok) { attempts.push(`udp-connect:", "if (false) { attempts.push(`udp-connect:"],
  ['mode: Live accepted on a write', 'app.js', "if (asked === 'live') return res.status(409)", "if (false) return res.status(409)"],
  ['mode: the toggle accepts Live', 'app.js', "accepted: requested === 'mock'", "accepted: true"],
  ['world: unknown step fields accepted', 'world.js', "const k = onlyKeys(s, ['op', 'id', 'say', 'expect', ...allowed]); return k ?", "const k = null; return k ?"],
  ['runner: attack outcome read from the wrong step', 'runner.js', "const attack = steps.find((s) => s.id === r.attackStep);", "const attack = steps[0];"],
];

function run(label, file, from, to, only) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlab-mut-'));
  try {
    fs.cpSync(path.join(ROOT, 'server'), path.join(dir, 'server'), { recursive: true, filter: (s) => !s.includes('node_modules') });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    const target = path.join(dir, 'server/src', file);
    const src = fs.readFileSync(target, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) return { label, status: 'NOT-APPLIED', detail: `pattern occurs ${n} times in ${file}` };
    fs.writeFileSync(target, src.replace(from, () => to));
    // A mutant that does not parse would "fail" the tests for the wrong reason: refuse it.
    const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    if (syntax.status !== 0) return { label, status: 'INVALID', detail: 'mutant has a syntax error' };
    const r =spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(dir, 'server/test')).filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`)], { cwd: path.join(dir, 'server'), encoding: 'utf8', timeout: 120000 });
    return { label, status: r.status === 0 ? 'SURVIVED' : 'killed', detail: '' };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  const only = i > 0 ? process.argv[i + 1] : '';
  const results = MUTATIONS.filter(([l]) => l.includes(only)).map(([l, f, a, b]) => run(l, f, a, b));
  for (const r of results) console.log(`${r.status.padEnd(11)} ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
  const bad = results.filter((r) => r.status !== 'killed');
  console.log(`\n${results.length - bad.length}/${results.length} mutants killed`);
  process.exit(bad.length ? 1 : 0);
}
