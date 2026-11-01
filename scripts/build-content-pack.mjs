// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the scenarios.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenarios = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/scenarios.json'), 'utf8'));
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const story = (id) => scenarios.find((s) => s.id === id);
  const tryCard = (id, cardId, label) => ({ id: cardId, label, description: story(id).takeaway, group: 'try-it', action: { type: 'route', href: `/#scenario-${id}` }, story: id });
  const src = (id, title, use, status = 'read') => ({ id, title, url: `https://www.rfc-editor.org/rfc/${id}`, kind: 'standard', use, status, checked: '2026-10-21' });
  return {
    schema: 'demo-content-pack/1',
    id: 'stolen-token-lab',
    title: 'Stolen-token LAB',
    version,
    demo: { id: 'stolen-token-lab', name: 'Stolen-token LAB', catalog: 'C22', baseUrl: 'http://localhost:4950', doctor: '/api/health', tags: ['token-theft', 'bearer', 'dpop', 'mtls', 'audience', 'sender-constrained', 'mock'] },
    glossary: [
      { id: 'bearer', term: 'Bearer token', definition: 'A token that works for whoever holds it. No proof of possession is required, so a copied token is as good as the original until it expires.', aliases: ['plain bearer'] },
      { id: 'audience', term: 'Audience binding', definition: 'The token names the API it is for (aud, requested with the RFC 8707 resource parameter). A different API refuses it. This stops redirect to another API, not use at the intended API.', aliases: ['aud', 'resource indicator'] },
      { id: 'dpop', term: 'DPoP', definition: 'RFC 9449. The token carries cnf.jkt, the thumbprint of the client key. Every request adds a signed proof (htm, htu, iat, jti, ath, optional server nonce). A stolen token without the key is useless. In the Ping stack only PingFederate supports DPoP (owner-stated; UNVERIFIED here).', aliases: ['demonstrating proof of possession'] },
      { id: 'jkt', term: 'JWK thumbprint (jkt)', definition: 'RFC 7638: base64url SHA-256 of the key\'s required members in sorted order. The token stores it; the gateway recomputes it from the proof key.' },
      { id: 'ath', term: 'Access token hash (ath)', definition: 'base64url SHA-256 of the access token, inside the proof. It ties a proof to one token.' },
      { id: 'jti-replay', term: 'Proof replay', definition: 'Resending a captured proof. The gateway keeps recently seen jti values and refuses a repeat inside the iat window.' },
      { id: 'mtls', term: 'Certificate-bound token', definition: 'RFC 8705. The token carries cnf x5t#S256, the thumbprint of the client certificate used at the token endpoint; the API requires the same certificate. SIMULATED in this lab: a header stands in for the TLS layer.' },
      { id: 'full-compromise', term: 'Full compromise', definition: 'If the attacker steals the token and the private key, sender-constraining no longer helps. Keep keys non-extractable and tokens short-lived.' },
    ],
    sources: [
      src('rfc9449', 'RFC 9449: OAuth 2.0 Demonstrating Proof of Possession (DPoP)', 'proof claims, server checks, cnf.jkt, nonce'),
      src('rfc8705', 'RFC 8705: OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens', 'cnf x5t#S256 and the resource-server check'),
      src('rfc8707', 'RFC 8707: Resource Indicators for OAuth 2.0', 'resource parameter and audience restriction'),
      src('rfc6750', 'RFC 6750: The OAuth 2.0 Bearer Token Usage', 'bearer semantics, theft and replay threats, error codes'),
      src('rfc9700', 'RFC 9700: Best Current Practice for OAuth 2.0 Security', 'sender-constraining and audience restriction guidance (first part of the document read)'),
      src('rfc7638', 'RFC 7638: JSON Web Key (JWK) Thumbprint', 'jkt computation'),
    ],
    cards: [
      tryCard('S01', 'try-bearer', 'Replay a stolen bearer token'),
      tryCard('S02', 'try-audience', 'Audience binding at another API'),
      tryCard('S03', 'try-dpop-nokey', 'DPoP: token without the key'),
      tryCard('S05', 'try-proof-replay', 'DPoP: replay a captured proof'),
      tryCard('S10', 'try-stale', 'DPoP: a stale proof'),
      tryCard('S11', 'try-nonce', 'DPoP: server nonce'),
      tryCard('S13', 'try-full', 'Token and key both stolen'),
      tryCard('S14', 'try-mtls', 'mTLS-bound token (simulated)'),
      { id: 'concept-what-stops-replay', label: 'What stops a replay', description: 'Nothing for bearer, audience for the wrong API, a key or certificate for sender-constrained tokens.', group: 'concept', action: { type: 'route', href: '/#concept-what-stops-replay' }, terms: ['bearer', 'audience', 'dpop', 'mtls', 'full-compromise'] },
      { id: 'concept-proof-checks', label: 'The DPoP proof checks', description: 'htm, htu, iat, jti, ath, nonce, signature and key binding.', group: 'concept', action: { type: 'route', href: '/#concept-proof-checks' }, terms: ['dpop', 'jkt', 'ath', 'jti-replay'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    stories: scenarios.map((s) => ({ id: s.id, title: s.title, say: s.takeaway })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}
