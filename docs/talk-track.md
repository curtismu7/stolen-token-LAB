# Talk track

One line per scenario; the lab says the rest. The banner (everything simulated, mTLS especially, and the Mock mode) stays on screen, also in presenter mode.

- **S01 Bearer replay works.** "Whoever holds this token is the agent. The thief is no different to the gateway." This is the lesson; do not skip it.
- **S02 Audience binding stops replay at another API.** "Good against the wrong API. Useless against the right one."
- **S03 DPoP: the stolen token is useless without the key.** "Same token, valid proof, wrong key: the thumbprint in the token does not match."
- **S04 DPoP: no downgrade to Bearer.** "Drop the proof, say Bearer. A gateway must honour `cnf`, or DPoP is decoration."
- **S05 DPoP: a replayed proof (same jti) is refused.** "Right key, right URL, same jti. Only the replay cache stops it."
- **S06 DPoP: a proof for another URL is refused (htu).** "A proof is for one URL."
- **S07 DPoP: a proof for another method is refused (htm).** "A proof is for one method: a GET proof cannot become a write."
- **S08 DPoP: a proof for a different token is refused (ath).** "A proof is for one token."
- **S09 DPoP: a proof without ath is refused.** "A client that leaves ath out binds the proof to nothing."
- **S10 DPoP: a stale proof is refused (iat).** "Ten minutes later, the same proof is dead."
- **S11 DPoP: server nonce required, then accepted.** "The server chooses a nonce: 401, header, retry."
- **S12 DPoP: a proof signed by the wrong key is refused.** "Victim's public key in the header, attacker's signature."
- **S13 Honest limit: token and key stolen together.** "Token and key together: it works. Say so plainly. Non-extractable keys, short lifetimes."
- **S14 mTLS-bound token without the certificate (simulated).** "Token without the certificate. Remember: a header stands in for TLS here."

Toggle the defence off on the Gateway tab and show exactly that attack get through: that is the mutation proof, shown to people.
