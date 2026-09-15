import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * THE LINKS THAT OPEN THE CONTRIBUTION PAGE'S PHRASE MODES (2026-09-15).
 *
 * The contribution page at /aksharmala.html is public and needs no account,
 * because the people it exists for are relatives who have never opened the
 * app. Its letter and passage modes write and never read anything back, which
 * is what kept an open endpoint boring (routes/scriptTrace.ts, point 4).
 *
 * THE PHRASE MODES CANNOT KEEP THAT PROMISE, so they are keyed instead:
 *
 *   record  serves the app's lesson phrases for one language, premium rows
 *           included, and stores clips that become candidate references.
 *   review  plays those clips BACK to a second speaker, which is the first
 *           thing on this page that reads a contributor's voice out again.
 *
 * An open review endpoint would replay every speaker's recordings to anyone
 * who guessed the URL, and an open record endpoint would let anyone fill the
 * review queue a volunteer has to listen through. So each mode needs a key for
 * one language, minted on the owner-only Nest and sent with the link.
 *
 * STATELESS, deliberately: an HMAC of the mode, the language and the expiry
 * under SESSION_SECRET, which already signs every pronunciation evaluation
 * (lib/evaluationToken.ts). No table of keys, no secret to add to Replit.
 * The input is domain-separated so a link signature can never be replayed as
 * any other signature this secret makes.
 *
 * THERE IS NO PER-LINK REVOCATION. A key works until it expires, which is why
 * the expiry is short. Rotating SESSION_SECRET would kill every link, but it is
 * not a revocation tool: it also voids every pronunciation evaluation in flight
 * and is the fallback secret for the push and games crons, deep health and the
 * TTS audit wherever their own secrets are unset. A link that must die early
 * needs a stored link version, which does not exist yet.
 *
 * NO SECRET, NO LINKS. Minting returns null and every check answers invalid,
 * the fail-closed direction.
 */

export type ContributionLinkMode = "record" | "review";

export type LinkCheck = "ok" | "expired" | "invalid";

/**
 * How long a freshly minted link works, in whole days. Long enough for a
 * relative to get round to it; short enough that a forwarded link dies.
 */
export const CONTRIBUTION_LINK_DAYS = 30;

const DAY_MS = 86_400_000;

/** 16 bytes of HMAC, base64url without padding. */
const SIGNATURE_CHARS = 22;

function signingSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function sign(
  secret: string,
  mode: ContributionLinkMode,
  language: string,
  expSeconds: number,
): string {
  return createHmac("sha256", secret)
    .update(`bolo-contribution-link/v1\n${mode}\n${language}\n${expSeconds}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

/**
 * A key for one mode and one language.
 *
 * THE EXPIRY IS PINNED TO A UTC DAY BOUNDARY, so every key minted on one day
 * is the same string. The Nest re-renders every thirty seconds, and a link
 * that changed under the cursor while the owner copied it would read as
 * broken. It always runs at least CONTRIBUTION_LINK_DAYS full days.
 */
export function mintContributionKey(
  mode: ContributionLinkMode,
  language: string,
  nowMs: number = Date.now(),
): { key: string; expiresAt: Date } | null {
  const secret = signingSecret();
  if (!secret) return null;
  const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const expMs = dayStart + (CONTRIBUTION_LINK_DAYS + 1) * DAY_MS;
  const exp = Math.floor(expMs / 1000);
  return {
    key: `${exp.toString(36)}.${sign(secret, mode, language, exp)}`,
    expiresAt: new Date(expMs),
  };
}

/**
 * Whether a key opens this mode for this language right now.
 *
 * The signature is checked BEFORE the expiry, so "expired" is only ever said
 * about a key this server really minted. A forged key with a past date gets
 * "invalid" and learns nothing.
 */
export function checkContributionKey(
  mode: ContributionLinkMode,
  language: string,
  key: unknown,
  nowMs: number = Date.now(),
): LinkCheck {
  const secret = signingSecret();
  if (!secret) return "invalid";
  if (typeof key !== "string" || key.length > 64) return "invalid";
  const match = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]+)$/.exec(key);
  if (!match || match[2]!.length !== SIGNATURE_CHARS) return "invalid";
  const exp = parseInt(match[1]!, 36);
  if (!Number.isSafeInteger(exp)) return "invalid";
  const expected = Buffer.from(sign(secret, mode, language, exp));
  const actual = Buffer.from(match[2]!);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return "invalid";
  }
  return exp * 1000 > nowMs ? "ok" : "expired";
}
