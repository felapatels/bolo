// The ONE place a referral link is built.
//
// Task #1049 put a referral card on home on both platforms. Before it, the
// `/join/<code>` URL was assembled inside the web app (src/lib/referral-code.ts)
// and mobile had no referral surface at all. Rather than let a second builder
// appear, the path, the code normalization and the reward amount live here and
// both clients call in — the same precedent as bolo-mobile's lib/legal.ts,
// where the caller supplies the origin and the module owns the path.
//
// This package intentionally ships its TypeScript source (see package.json
// exports) so Vite and Metro both resolve it with no build step and there is
// no stale `dist` to fall out of step with the source.

/**
 * Chai granted to BOTH sides when a referred learner finishes their first
 * practice.
 *
 * Mirrors REFERRAL_REWARD_REFERRER_CHAI / REFERRAL_REWARD_REFEREE_CHAI in
 * artifacts/api-server/src/lib/tokenEconomy.ts, which grants each side the
 * same amount. The ledger is authoritative — this constant exists so no client
 * surface can advertise a number the system does not actually pay, and a
 * contract test (artifacts/gujarati-coach/src/test/sharedConstants.contract.test.ts)
 * fails the moment the server constants move without this one following.
 */
export const REFERRAL_REWARD_CHAI = 25;

/**
 * Codes are stored uppercase server-side and redemption input is normalized
 * the same way, so a hand-typed or hand-edited link still matches.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The in-app path a referral link lands on, relative to the app root (no base
 * path, no origin) — what a client router navigates to.
 */
export function referralJoinPath(code: string): string {
  return `/join/${encodeURIComponent(normalizeReferralCode(code))}`;
}

/**
 * The shareable absolute link for a code.
 *
 * @param origin  Scheme + host of the web app, no trailing slash
 *                (`window.location.origin` on web, `https://${EXPO_PUBLIC_DOMAIN}`
 *                on mobile).
 * @param code    The learner's referral code, in any casing.
 * @param basePath The web artifact's base path, which the web bundle knows as
 *                `import.meta.env.BASE_URL` and which is "/" everywhere else.
 */
export function buildReferralLink(
  origin: string,
  code: string,
  basePath = "/",
): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  // referralJoinPath owns the "/join/<code>" shape; the base path already ends
  // in a slash, so drop the path's leading one rather than building it twice.
  return `${trimmedOrigin}${base}${referralJoinPath(code).slice(1)}`;
}
