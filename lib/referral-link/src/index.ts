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
 * Pulls a code out of whatever a QR scan produced.
 *
 * The squares Bolo! renders encode the full `/join/<code>` link so an ordinary
 * phone camera opens the app rather than showing six letters to retype, but a
 * scanner should also cope with a hand-made QR that holds only the code. So:
 * take the last path segment of anything that parses as a join link, otherwise
 * treat the payload as a bare code — and in both cases require it to look like
 * a code before handing it on, so a scan of an unrelated QR fails here rather
 * than becoming a wasted (and rate-limited) friend-request attempt.
 *
 * Returns null when the payload is not a Bolo! code.
 */
export function parseReferralScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  let candidate = text;
  const joinMatch = text.match(/\/join\/([^/?#]+)/i);
  if (joinMatch) {
    try {
      candidate = decodeURIComponent(joinMatch[1]!);
    } catch {
      candidate = joinMatch[1]!;
    }
  } else if (/[/:?#]/.test(text)) {
    // A URL that is not a join link — someone else's QR, not ours.
    return null;
  }

  const code = normalizeReferralCode(candidate);
  // Deliberately loose on length: the server decides what exists. This only
  // rejects payloads that cannot be a code at all.
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
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
