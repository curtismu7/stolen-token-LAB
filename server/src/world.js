// One lab world: virtual clock, mock AS, mock gateway (with its toggles), the tokens and captured requests of a run.
// exec(step) runs one validated step. Steps are data (see data/scenarios.json); nothing here evals or reaches the network.
import { randomBytes } from 'node:crypto';
import { createAs, HOLDERS, KINDS } from './as.js';
import { createGateway, CERT_HEADER, NONCE_HEADER, allOn, CONTROL_IDS } from './gateway.js';
import { fixtureKey, signJwt, sha256b64u, certThumbprint, parseJwt } from './jose.js';
import { childTraceparent, envelope, rawRequest, rawResponse, newTraceparent } from './trace.js';
import { cleanText } from './safety.js';

export const START_MS = Date.parse('2026-10-21T12:00:00.000Z');
export const MAX_STEPS = 40;
const OPS = ['issue', 'call', 'advance', 'rotate-nonce'];
const SCHEMES = ['Bearer', 'DPoP', 'none'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const WHO = ['client', 'attacker'];
const KEYS = ['client', 'attacker', 'other'];
const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const PATH = /^\/[A-Za-z0-9._~\/-]{0,200}$/;
const NONCES = ['current', 'none', 'stale', 'learned'];
const ATHS = ['auto', 'missing', 'wrong'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o, allowed) => Object.keys(o).find((k) => !allowed.includes(k));

// Returns a problem string or null. Strict: unknown fields, prototype-pollution names and wrong types are all refused.
export function stepProblem(s) {
  if (!isObj(s)) return 'step must be an object';
  if (!OPS.includes(s.op)) return `op must be one of ${OPS.join(', ')}`;
  if (s.id !== undefined && (typeof s.id !== 'string' || !ID.test(s.id))) return 'id must match [a-z][a-z0-9_-]{0,31}';
  const bad = (allowed) => { const k = onlyKeys(s, ['op', 'id', 'say', 'expect', ...allowed]); return k ? `unknown field ${cleanText(k, 30)}` : null; };
  if (s.say !== undefined && typeof s.say !== 'string') return 'say must be text';
  if (s.expect !== undefined && (!isObj(s.expect) || onlyKeys(s.expect, ['status', 'error']) || !Number.isInteger(s.expect.status))) return 'expect must be { status, error? }';
  if (s.op === 'advance') {
    const b = bad(['seconds']); if (b) return b;
    if (!Number.isFinite(s.seconds) || s.seconds < 0 || s.seconds > 86400) return 'seconds must be 0..86400';
    return null;
  }
  if (s.op === 'rotate-nonce') return bad([]);
  if (s.op === 'issue') {
    const b = bad(['kind', 'holder', 'api', 'scope', 'ttl']); if (b) return b;
    if (!s.id) return 'issue needs an id';
    if (!KINDS.includes(s.kind)) return `kind must be one of ${KINDS.join(', ')}`;
    if (!HOLDERS.includes(s.holder ?? 'client')) return 'unknown holder';
    if (!['a', 'b'].includes(s.api ?? 'a')) return 'api must be a or b';
    if (s.scope !== undefined && (typeof s.scope !== 'string' || !/^[a-z:._ -]{1,60}$/.test(s.scope))) return 'bad scope';
    if (s.ttl !== undefined && (!Number.isInteger(s.ttl) || s.ttl < 1 || s.ttl > 86400)) return 'ttl must be 1..86400';
    return null;
  }
  // call
  const b = bad(['who', 'token', 'api', 'method', 'path', 'scheme', 'proof', 'cert', 'send', 'replay']); if (b) return b;
  if (!s.id) return 'call needs an id';
  if (!WHO.includes(s.who)) return 'who must be client or attacker';
  if (s.replay !== undefined && (typeof s.replay !== 'string' || !ID.test(s.replay))) return 'replay must be a step id';
  if (s.replay === undefined && (typeof s.token !== 'string' || !ID.test(s.token))) return 'token must be an issued token id';
  if (s.token !== undefined && (typeof s.token !== 'string' || !ID.test(s.token))) return 'token must be an issued token id';
  if (s.api !== undefined && !['a', 'b'].includes(s.api)) return 'api must be a or b';
  if (s.method !== undefined && !METHODS.includes(s.method)) return 'bad method';
  if (s.path !== undefined && (typeof s.path !== 'string' || !PATH.test(s.path))) return 'bad path';
  if (s.scheme !== undefined && !SCHEMES.includes(s.scheme)) return 'bad scheme';
  if (s.cert !== undefined && ![...KEYS, 'none'].includes(s.cert)) return 'bad cert';
  if (s.send !== undefined && typeof s.send !== 'boolean') return 'send must be boolean';
  if (s.proof !== undefined) {
    const p = s.proof;
    if (!isObj(p) || onlyKeys(p, ['key', 'signWith', 'ath', 'nonce', 'iat'])) return 'bad proof spec';
    if (!KEYS.includes(p.key)) return 'proof.key must be a holder';
    if (p.signWith !== undefined && !KEYS.includes(p.signWith)) return 'proof.signWith must be a holder';
    if (p.ath !== undefined && !ATHS.includes(p.ath)) return 'bad proof.ath';
    if (p.nonce !== undefined && !NONCES.includes(p.nonce)) return 'bad proof.nonce';
    if (p.iat !== undefined && (!Number.isInteger(p.iat) || Math.abs(p.iat) > 86400 * 7)) return 'bad proof.iat offset';
  }
  return null;
}

export function createWorld({ vertical, start = START_MS } = {}) {
  let t = start;
  const clock = { now: () => t, advance(s) { t += s * 1000; } };
  const as = createAs({ clock });
  const cast = vertical.cast;
  const apis = { a: { host: cast.host_a, resource: `https://${cast.host_a}`, name: cast.api_a }, b: { host: cast.host_b, resource: `https://${cast.host_b}`, name: cast.api_b } };
  const gateway = createGateway({ clock, as, apis });
  const tokens = new Map(); // id -> { token, claims, token_type }
  const sent = new Map();   // id -> the request as sent or captured: { method, url, headers }
  let learnedNonce = null;
  const results = [];

  function buildProof(p, { method, url, tokenText }) {
    const key = fixtureKey(`holder-${p.key}`);
    const signer = fixtureKey(`holder-${p.signWith || p.key}`);
    const claims = { jti: randomBytes(9).toString('base64url'), htm: method, htu: url, iat: Math.floor(clock.now() / 1000) + (p.iat || 0) };
    const nonce = { current: gateway.currentNonce(), stale: 'mock-nonce-0', learned: learnedNonce }[p.nonce ?? 'current'];
    if (nonce) claims.nonce = nonce;
    const ath = p.ath ?? 'auto';
    if (ath === 'auto') claims.ath = sha256b64u(tokenText);
    if (ath === 'wrong') claims.ath = sha256b64u('a different access token');
    return signJwt({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk }, claims, signer.privateKey);
  }

  function exec(s) {
    const problem = stepProblem(s);
    if (problem) throw new Error(problem);
    if (s.op === 'advance') { clock.advance(s.seconds); return record(s, { note: `virtual clock +${s.seconds}s` }); }
    if (s.op === 'rotate-nonce') { return record(s, { note: `server nonce is now ${gateway.rotateNonce()}` }); }
    if (s.op === 'issue') {
      const api = apis[s.api ?? 'a'];
      const holder = s.holder ?? 'client';
      const out = as.issue({ kind: s.kind, holder, sub: `mock-user-${cleanText(cast.user, 20).toLowerCase()}`, clientId: `mock-agent-${holder}`, audience: api.resource, scope: s.scope, ttl: s.ttl });
      tokens.set(s.id, out);
      const traceparent = childTraceparent(null);
      const trace = envelope({ traceparent, request: rawRequest({ method: 'POST', host: 'as.example', path: '/mock/token', headers: { traceparent, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=client_credentials&resource=${api.resource}` }), response: rawResponse({ status: 200, headers: { 'Content-Type': 'application/json' }, body: { access_token: out.token, token_type: out.token_type } }), log: [], notes: ['mock authorization server; no gateway involved'] });
      return record(s, { note: `mock AS issued a ${s.kind} token for ${api.name}`, tokenId: s.id, claims: out.claims, tokenType: out.token_type, trace });
    }
    // call
    const base = s.replay ? sent.get(s.replay) : null;
    if (s.replay && !base) throw new Error(`replay: no step ${cleanText(s.replay, 30)} was sent or captured`);
    const tokenId = s.token ?? base?.tokenId;
    const issued = tokens.get(tokenId);
    if (!issued) throw new Error(`no token ${cleanText(tokenId, 30)} has been issued`);
    const api = apis[s.api ?? base?.api ?? 'a'];
    const method = s.method ?? base?.method ?? 'GET';
    const path = s.path ?? base?.path ?? '/';
    const url = `https://${api.host}${path}`;
    const headers = {};
    let proofJwt;
    if (base && s.token === undefined && s.method === undefined && s.path === undefined && s.api === undefined && s.scheme === undefined && s.proof === undefined && s.cert === undefined) {
      Object.assign(headers, base.headers); // byte-for-byte replay
      proofJwt = base.headers.dpop;
    } else {
      const scheme = s.scheme ?? base?.scheme ?? (issued.token_type === 'DPoP' ? 'DPoP' : 'Bearer');
      if (scheme !== 'none') headers.authorization = `${scheme} ${issued.token}`;
      if (s.proof) { proofJwt = buildProof(s.proof, { method, url, tokenText: issued.token }); headers.dpop = proofJwt; }
      else if (base?.headers.dpop) { proofJwt = base.headers.dpop; headers.dpop = proofJwt; }
      const cert = s.cert ?? base?.cert;
      if (cert && cert !== 'none') headers[CERT_HEADER] = certThumbprint(cert);
    }
    const spec = { method, url, headers, tokenId, api: s.api ?? base?.api ?? 'a', path, scheme: s.scheme ?? base?.scheme, cert: s.cert ?? base?.cert };
    sent.set(s.id, spec);
    if (s.send === false) return record(s, { note: 'captured in flight; never delivered to the gateway', captured: true, request: rawRequest({ method, host: api.host, path, headers: wire(headers) }), proof: decodeProof(proofJwt) });
    const traceparent = childTraceparent(null);
    const out = gateway.evaluate({ method, url, headers });
    if (out.status === 401 && out.headers['DPoP-Nonce']) learnedNonce = out.headers['DPoP-Nonce'];
    const request = rawRequest({ method, host: api.host, path, headers: { traceparent, ...wire(headers) } });
    const response = rawResponse({ status: out.status, headers: out.headers, body: out.body });
    return record(s, { status: out.status, error: out.body?.error, allowed: out.allowed, trace: envelope({ traceparent, request, response, log: out.log, notes: [] }), proof: decodeProof(proofJwt), claims: issued.claims });
  }
  const wire = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k === 'authorization' ? 'Authorization' : k === 'dpop' ? 'DPoP' : k, v]));
  function decodeProof(j) { try { const p = parseJwt(j); return { header: p.header, claims: p.payload }; } catch { return null; } }
  function record(s, extra) {
    const r = { n: results.length + 1, op: s.op, id: s.id, who: s.who, say: s.say, ...extra };
    if (s.expect) { r.expected = s.expect; r.pass = r.status === s.expect.status && (s.expect.error === undefined || r.error === s.expect.error); }
    results.push(r);
    return r;
  }
  return { clock, as, gateway, exec, results, setControls: (c) => gateway.setControls(c), apis };
}

export { allOn, CONTROL_IDS, newTraceparent };
