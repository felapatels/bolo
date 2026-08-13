#!/usr/bin/env node
/**
 * Which Clerk instance does a deployed API actually verify against?
 *
 * Task #1089 (App Review rejected build 34 on a Settings error) needed proof
 * that the production API verifies sessions minted by the SAME live Clerk
 * instance the store build signs into — an instance mismatch would 401 every
 * authenticated request from a fresh account, which is exactly the observed
 * shape.
 *
 * The probe is deliberately UNAUTHENTICATED and NON-INVASIVE: it creates no
 * user, needs no secret, and sends a syntactically valid but unsigned JWT.
 * Clerk rejects it and, in doing so, names the key ids it WOULD have accepted
 * in the `x-clerk-auth-message` header. Comparing those ids with the JWKS of
 * the Frontend API host encoded inside the client's publishable key settles
 * the question from the outside.
 *
 * Usage:
 *   node qa/clerk-instance-probe.mjs [apiHost] [publishableKey]
 *   node qa/clerk-instance-probe.mjs bolo-india.app pk_live_...
 *
 * Defaults to production (bolo-india.app) and the publishable key the store
 * build ships with. Exits non-zero when the ids do not intersect.
 */

const apiHost = process.argv[2] ?? 'bolo-india.app';
const publishableKey =
  process.argv[3] ?? 'pk_live_Y2xlcmsuYm9sby1pbmRpYS5hcHAk';

/** `pk_live_<base64 of "clerk.example.com$">` → `clerk.example.com`. */
function frontendApiHost(pk) {
  const encoded = pk.replace(/^pk_(live|test)_/, '');
  return Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
}

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

async function main() {
  const fapi = frontendApiHost(publishableKey);
  console.log(`publishable key → frontend API: ${fapi}`);

  const jwks = await fetch(`https://${fapi}/.well-known/jwks.json`).then((r) =>
    r.json(),
  );
  const clientKids = (jwks.keys ?? []).map((k) => k.kid);
  console.log(`client instance JWKS kids: ${clientKids.join(', ') || '(none)'}`);

  // Well-formed, correctly-issued-looking, but unsigned. Clerk gets far enough
  // to look for the signing key and reports which ones it has.
  const now = Math.floor(Date.now() / 1000);
  const token = [
    b64url({ alg: 'RS256', typ: 'JWT', kid: 'probe-not-a-real-kid' }),
    b64url({
      iss: `https://${fapi}`,
      sub: 'user_probe',
      sid: 'sess_probe',
      iat: now,
      nbf: now - 5,
      exp: now + 600,
    }),
    'not-a-signature',
  ].join('.');

  const res = await fetch(`https://${apiHost}/api/account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reason = res.headers.get('x-clerk-auth-reason');
  const message = res.headers.get('x-clerk-auth-message') ?? '';
  console.log(`API ${apiHost} → HTTP ${res.status}`);
  console.log(`  x-clerk-auth-reason:  ${reason}`);
  console.log(`  x-clerk-auth-message: ${message}`);

  const serverKids = [...message.matchAll(/ins_[A-Za-z0-9]+/g)].map((m) => m[0]);
  console.log(`server-side available kids: ${serverKids.join(', ') || '(none reported)'}`);

  const shared = serverKids.filter((k) => clientKids.includes(k));
  if (shared.length > 0) {
    console.log(
      `\nMATCH: the API verifies against the same instance the client signs into (${shared.join(', ')}).`,
    );
    return;
  }
  console.log(
    '\nNO MATCH: the API does not hold the signing key of the instance this publishable key points at.',
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
