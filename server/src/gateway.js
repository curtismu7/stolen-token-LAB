// Mock gateway in front of two mock APIs. Each defence is a toggle (CONTROLS); a toggled-off control is skipped and logged as such.
// evaluate({ method, url, headers }) -> { status, headers, body, log }. Pure given its state (clock, jti cache, nonce).
import { parseJwt, verifyJwtSig, jwkProblem, jwkThumbprint, sha256b64u, JoseError } from './jose.js';
import { ISSUER } from './as.js';

export const CONTROLS = [
  { id: 'audience', label: 'Audience binding', rfc: 'RFC 8707 / RFC 9700 2.3', text: 'Reject a token whose aud is not this API.' },
  { id: 'dpop_binding', label: 'DPoP key binding', rfc: 'RFC 9449 6, 7', text: 'A token with cnf.jkt must arrive as Authorization: DPoP with a proof signed by that key.' },
  { id: 'dpop_signature', label: 'DPoP proof signature', rfc: 'RFC 9449 4.3 item 6', text: 'The proof must verify under the public key in its own jwk header.' },
  { id: 'dpop_htm', label: 'DPoP htm check', rfc: 'RFC 9449 4.3 item 8', text: 'The proof htm must equal the request method.' },
  { id: 'dpop_htu', label: 'DPoP htu check', rfc: 'RFC 9449 4.3 item 9', text: 'The proof htu must equal the request URI without query and fragment.' },
  { id: 'dpop_nonce', label: 'DPoP server nonce', rfc: 'RFC 9449 8, 9', text: 'The proof must carry the nonce the server issued, else 401 use_dpop_nonce.' },
  { id: 'dpop_iat', label: 'DPoP iat window', rfc: 'RFC 9449 4.3 item 11', text: 'The proof iat must be inside the local acceptance window (60 s here: local policy, not an RFC number).' },
  { id: 'dpop_ath', label: 'DPoP ath check', rfc: 'RFC 9449 4.2, 4.3 item 12', text: 'The proof ath must equal base64url(SHA-256(access token)).' },
  { id: 'dpop_jti', label: 'DPoP jti replay cache', rfc: 'RFC 9449 11.1', text: 'A proof jti already seen inside the window is refused.' },
  { id: 'mtls_binding', label: 'mTLS certificate binding (simulated)', rfc: 'RFC 8705 3', text: 'A token with cnf x5t#S256 must arrive with the matching client-certificate thumbprint (simulated header, no real TLS).' },
];
export const CONTROL_IDS = CONTROLS.map((c) => c.id);
export const allOn = () => Object.fromEntries(CONTROL_IDS.map((id) => [id, true]));

export const IAT_WINDOW_S = 60;
export const JTI_CACHE_MAX = 10000;
export const CERT_HEADER = 'x-simulated-client-cert-sha256';
export const NONCE_HEADER = 'dpop-nonce';

const aud = (a) => (Array.isArray(a) ? a : [a]);

// apis: { a: { host, resource, name }, b: { ... } }
export function createGateway({ clock, as, apis, jtiMax = JTI_CACHE_MAX }) {
  const controls = allOn();
  const seen = new Map(); // jti -> expiry (ms)
  let nonceN = 1;
  const currentNonce = () => `mock-nonce-${nonceN}`;
  const byHost = (host) => Object.entries(apis).find(([, a]) => a.host === host)?.[0];

  function evaluate({ method, url, headers = {} }) {
    const log = [];
    const now = clock.now();
    const done = (status, extra = {}) => ({ status, headers: extra.headers || {}, body: extra.body, log, allowed: status === 200 });
    const step = (check, control, result, detail) => log.push({ check, control, result, detail });
    const deny = (check, control, status, error, desc, scheme = 'Bearer', more = {}) => {
      step(check, control, 'fail', desc);
      const headers = { 'WWW-Authenticate': `${scheme} error="${error}", error_description="${desc}"${scheme === 'DPoP' ? ', algs="ES256"' : ''}`, ...more };
      return done(status, { headers, body: { error, error_description: desc } });
    };
    const gate = (control) => { if (controls[control]) return true; step('(toggle)', control, 'skipped', 'control is off in this run'); return false; };

    let u; try { u = new URL(url); } catch { return deny('request', null, 400, 'invalid_request', 'bad request URL'); }
    const apiKey = byHost(u.host);
    if (!apiKey) return deny('route', null, 404, 'not_found', 'no such API behind this gateway');
    const api = apis[apiKey];
    const get = (n) => headers[n];

    // 1. credential
    const auth = get('authorization');
    if (typeof auth !== 'string') { step('credential', null, 'fail', 'no Authorization header'); return done(401, { headers: { 'WWW-Authenticate': 'Bearer realm="mock-gateway"' }, body: { error: 'unauthorized' } }); }
    const m = /^(Bearer|DPoP) ([A-Za-z0-9._~+/=-]+)$/i.exec(auth);
    if (!m) return deny('credential', null, 401, 'invalid_request', 'malformed Authorization header');
    const scheme = m[1].toLowerCase() === 'dpop' ? 'DPoP' : 'Bearer';
    const tokenText = m[2];
    step('credential', null, 'pass', `scheme ${scheme}`);

    // 2. the access token itself (always on: signature, typ, issuer, lifetime)
    let tok;
    try { tok = parseJwt(tokenText); } catch (e) { return deny('token', null, 401, 'invalid_token', e instanceof JoseError ? `bad token: ${e.message}` : 'bad token', scheme); }
    if (tok.header.alg !== 'ES256' || tok.header.typ !== 'at+jwt') return deny('token', null, 401, 'invalid_token', 'token header must be ES256 / at+jwt', scheme);
    if (!verifyJwtSig(tok, as.publicJwk)) return deny('token', null, 401, 'invalid_token', 'token signature does not verify', scheme);
    const t = tok.payload;
    if (t.iss !== ISSUER) return deny('token', null, 401, 'invalid_token', 'unknown issuer', scheme);
    const nowS = Math.floor(now / 1000);
    if (!Number.isInteger(t.exp) || t.exp <= nowS) return deny('token', null, 401, 'invalid_token', 'token expired', scheme);
    step('token', null, 'pass', 'signature, typ, iss and exp ok');

    // 3. audience
    if (gate('audience')) {
      if (!aud(t.aud).includes(api.resource)) return deny('audience', 'audience', 401, 'invalid_token', 'token audience is not this API', scheme);
      step('audience', 'audience', 'pass', 'aud matches this API');
    }

    // 4a. DPoP binding
    const jkt = t.cnf && typeof t.cnf === 'object' ? t.cnf.jkt : undefined;
    const x5t = t.cnf && typeof t.cnf === 'object' ? t.cnf['x5t#S256'] : undefined;
    if (typeof jkt === 'string') {
      const proofHeader = get('dpop');
      const proofPresent = proofHeader !== undefined;
      const bind = controls.dpop_binding;
      if (bind && scheme !== 'DPoP') return deny('dpop-binding', 'dpop_binding', 401, 'invalid_token', 'DPoP-bound token presented as Bearer', 'DPoP');
      if (bind && !proofPresent) return deny('dpop-binding', 'dpop_binding', 401, 'invalid_dpop_proof', 'DPoP proof header missing', 'DPoP');
      if (!bind) step('(toggle)', 'dpop_binding', 'skipped', 'control is off in this run');
      if (proofPresent) {
        const r = checkProof({ raw: proofHeader, method, u, tokenText, jkt, bind });
        if (r) return r;
      }
    }
    if (x5t !== undefined) {
      // 4b. mTLS binding (SIMULATED: the thumbprint arrives in a header; there is no real TLS here)
      if (gate('mtls_binding')) {
        const presented = get(CERT_HEADER);
        if (typeof x5t !== 'string' || presented !== x5t) return deny('mtls-binding', 'mtls_binding', 401, 'invalid_token', 'client certificate thumbprint does not match the token (simulated)', scheme);
        step('mtls-binding', 'mtls_binding', 'pass', 'thumbprint matches (simulated)');
      }
    }

    step('authorized', null, 'pass', `${method} ${u.pathname} on ${api.name}`);
    return done(200, { body: { ok: true, api: api.name, path: u.pathname, data: `mock data from ${api.name}`, sub: t.sub, client_id: t.client_id } });

    // The proof pipeline. Returns a deny() response or null.
    function checkProof({ raw, method: htmReq, u: uri, tokenText: tt, jkt: boundJkt, bind: binding }) {
      const D = (check, control, status, error, desc, more) => deny(check, control, status, error, desc, 'DPoP', more);
      if (Array.isArray(raw)) return D('dpop-format', null, 401, 'invalid_dpop_proof', 'more than one DPoP header');
      let p;
      try { p = parseJwt(raw); } catch (e) { return D('dpop-format', null, 401, 'invalid_dpop_proof', e instanceof JoseError ? `proof: ${e.message}` : 'proof unreadable'); }
      if (p.header.typ !== 'dpop+jwt') return D('dpop-format', null, 401, 'invalid_dpop_proof', 'proof typ must be dpop+jwt');
      if (p.header.alg !== 'ES256') return D('dpop-format', null, 401, 'invalid_dpop_proof', 'proof alg must be an allowed asymmetric algorithm (ES256 here), never none or HMAC');
      const jwkBad = jwkProblem(p.header.jwk);
      if (jwkBad) return D('dpop-format', null, 401, 'invalid_dpop_proof', `proof ${jwkBad}`);
      const c = p.payload;
      if (typeof c.jti !== 'string' || !c.jti || c.jti.length > 200 || typeof c.htm !== 'string' || typeof c.htu !== 'string' || !Number.isInteger(c.iat)) return D('dpop-format', null, 401, 'invalid_dpop_proof', 'proof is missing jti, htm, htu or iat');
      step('dpop-format', null, 'pass', 'typ, alg, jwk and required claims present');

      if (gate('dpop_signature')) {
        if (!verifyJwtSig(p, p.header.jwk)) return D('dpop-signature', 'dpop_signature', 401, 'invalid_dpop_proof', 'proof signature does not verify under its jwk');
        step('dpop-signature', 'dpop_signature', 'pass', 'verifies under the jwk in the header');
      }
      if (binding) {
        if (jwkThumbprint(p.header.jwk) !== boundJkt) return D('dpop-binding', 'dpop_binding', 401, 'invalid_token', 'proof key does not match the token cnf.jkt');
        step('dpop-binding', 'dpop_binding', 'pass', 'proof key thumbprint equals cnf.jkt');
      }
      if (gate('dpop_htm')) {
        if (c.htm !== htmReq) return D('dpop-htm', 'dpop_htm', 401, 'invalid_dpop_proof', 'proof htm does not match the request method');
        step('dpop-htm', 'dpop_htm', 'pass', `htm ${c.htm}`);
      }
      if (gate('dpop_htu')) {
        const want = `${uri.protocol}//${uri.host}${uri.pathname}`;
        let have; try { const h = new URL(c.htu); have = `${h.protocol}//${h.host}${h.pathname}`; } catch { have = null; }
        if (have !== want) return D('dpop-htu', 'dpop_htu', 401, 'invalid_dpop_proof', 'proof htu does not match the request URI');
        step('dpop-htu', 'dpop_htu', 'pass', 'htu matches (query and fragment ignored)');
      }
      if (gate('dpop_nonce')) {
        if (c.nonce !== currentNonce()) return D('dpop-nonce', 'dpop_nonce', 401, 'use_dpop_nonce', 'a server-issued nonce is required in the proof', { 'DPoP-Nonce': currentNonce() });
        step('dpop-nonce', 'dpop_nonce', 'pass', 'nonce matches');
      }
      if (gate('dpop_iat')) {
        if (Math.abs(nowS - c.iat) > IAT_WINDOW_S) return D('dpop-iat', 'dpop_iat', 401, 'invalid_dpop_proof', `proof iat is outside the +/-${IAT_WINDOW_S}s window`);
        step('dpop-iat', 'dpop_iat', 'pass', 'iat inside the window');
      }
      if (gate('dpop_ath')) {
        if (c.ath !== sha256b64u(tt)) return D('dpop-ath', 'dpop_ath', 401, 'invalid_dpop_proof', 'proof ath is missing or does not match this access token');
        step('dpop-ath', 'dpop_ath', 'pass', 'ath equals SHA-256 of the access token');
      }
      if (gate('dpop_jti')) {
        for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
        if (seen.has(c.jti)) return D('dpop-jti', 'dpop_jti', 401, 'invalid_dpop_proof', 'proof jti was already used');
        // Fail closed: a full cache refuses new proofs rather than forgetting jtis (which would let a replay through).
        if (seen.size >= jtiMax) return D('dpop-jti', 'dpop_jti', 401, 'invalid_dpop_proof', 'jti replay cache is full; refusing rather than forgetting');
        seen.set(c.jti, now + 2 * IAT_WINDOW_S * 1000);
        step('dpop-jti', 'dpop_jti', 'pass', 'jti is new; remembered');
      }
      return null;
    }
  }

  return {
    controls,
    setControls(next) {
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('controls must be an object');
      for (const [k, v] of Object.entries(next)) {
        if (!CONTROL_IDS.includes(k)) throw new Error(`unknown control ${k}`);
        if (typeof v !== 'boolean') throw new Error(`control ${k} must be true or false`);
        controls[k] = v;
      }
      return { ...controls };
    },
    currentNonce, rotateNonce() { nonceN += 1; return currentNonce(); }, evaluate,
  };
}
