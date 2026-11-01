// Mock authorization server: mints labelled MOCK access tokens (JWT, ES256, typ at+jwt). In-process; nothing leaves the machine.
// kind: bearer (no binding), dpop (cnf.jkt = RFC 7638 thumbprint of the holder's key), mtls (cnf x5t#S256, SIMULATED cert).
import { randomBytes } from 'node:crypto';
import { fixtureKey, certThumbprint, signJwt } from './jose.js';

export const ISSUER = 'https://as.example/mock';
export const HOLDERS = ['client', 'attacker', 'other'];
export const KINDS = ['bearer', 'dpop', 'mtls'];

export function createAs({ clock }) {
  const key = fixtureKey('mock-authorization-server');
  return {
    publicJwk: key.publicJwk,
    issue({ kind = 'bearer', holder = 'client', sub, clientId, audience, scope = 'read', ttl = 3600 }) {
      if (!KINDS.includes(kind)) throw new Error('unknown token kind');
      if (!HOLDERS.includes(holder)) throw new Error('unknown holder');
      const now = Math.floor(clock.now() / 1000);
      const payload = { iss: ISSUER, sub, client_id: clientId, aud: audience, scope, iat: now, exp: now + ttl, jti: randomBytes(9).toString('base64url'), mock: true };
      if (kind === 'dpop') payload.cnf = { jkt: fixtureKey(`holder-${holder}`).jkt };
      if (kind === 'mtls') payload.cnf = { 'x5t#S256': certThumbprint(holder) };
      return { token: signJwt({ alg: 'ES256', typ: 'at+jwt', kid: 'mock-as-1' }, payload, key.privateKey), claims: payload, token_type: kind === 'dpop' ? 'DPoP' : 'Bearer' };
    },
  };
}
