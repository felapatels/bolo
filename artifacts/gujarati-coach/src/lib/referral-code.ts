// Referral R2, web slice. Everything about carrying a referral code from a
// shared link, across the Clerk signup round trip, to the single
// POST /referral/redeem call that records attribution.
//
// Why localStorage and not sessionStorage (which is what the language-step
// skip marker uses): the code has to survive signup, and signup is not
// guaranteed to stay in one tab. A social sign-up leaves the origin and comes
// back, and an emailed verification can open a fresh tab, either of which
// drops sessionStorage on the floor. The cost of the durable slot is a code
// that can outlive the visit, so every read is TTL-bounded and every redeem
// attempt clears the slot whatever the outcome (see referral-redeemer).

const STORAGE_KEY = "bolo.referralCode";

// Long enough that someone can sit on a link for a few weeks, short enough
// that a forgotten code does not follow a shared browser around forever.
export const REFERRAL_CODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Mirrors REFERRAL_REWARD_REFERRER_CHAI / REFERRAL_REWARD_REFEREE_CHAI in
// artifacts/api-server/src/lib/tokenEconomy.ts, which grants both sides the
// same amount. Copy quoting the reward reads this, so there is one literal on
// the web side to change if the server number ever moves.
export const REFERRAL_REWARD_CHAI = 25;

// `attemptedAt` is what makes redemption single-flight across a reload or a
// second tab. localStorage is shared and its writes are synchronous, so the
// marker lands before the POST does and any later reader can tell that THIS
// browser has already fired a redeem for this code. Without it, a reload
// mid-flight (or the link opened twice) sends a second redeem, the server
// correctly gives the loser a 409, and a first-time referee gets told they
// already used a code for the redemption that just succeeded on their behalf.
type StoredCode = { code: string; savedAt: number; attemptedAt?: number };

// Codes are stored uppercase server-side and redemption input is normalized
// the same way, so a hand-typed or hand-edited link still matches.
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The shareable link for a code. Includes the artifact base path. */
export function referralLink(code: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}join/${encodeURIComponent(
    normalizeReferralCode(code),
  )}`;
}

/** The in-app path a referral link lands on, for wouter navigation. */
export function referralLandingPath(code: string): string {
  return `/join/${encodeURIComponent(normalizeReferralCode(code))}`;
}

export function rememberReferralCode(raw: string): void {
  const code = normalizeReferralCode(raw);
  if (!code) return;
  try {
    // Storing the SAME code again must not erase an in-flight attempt marker,
    // or a second tab landing on the link would re-arm a redeem that is
    // already on the wire.
    const existing = readStored();
    const payload: StoredCode =
      existing && existing.code === code
        ? existing
        : { code, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode or a full quota. A visitor who is already signed in still
    // redeems from the page's own copy of the code; only the carry-through
    // signup path is lost, and that is better than a crash on a landing page.
  }
}

function readStored(): StoredCode | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCode> | null;
    const code = typeof parsed?.code === "string" ? parsed.code : null;
    const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : 0;
    if (!code) return null;
    if (Date.now() - savedAt > REFERRAL_CODE_MAX_AGE_MS) {
      clearPendingReferralCode();
      return null;
    }
    return {
      code,
      savedAt,
      attemptedAt:
        typeof parsed?.attemptedAt === "number" ? parsed.attemptedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function readPendingReferralCode(): string | null {
  return readStored()?.code ?? null;
}

export type ReferralClaim = {
  code: string;
  /** False when this browser already fired a redeem for this same code. */
  firstAttempt: boolean;
};

/**
 * Takes the pending code for one redeem call, recording the attempt so a
 * reload or a second tab can tell it is looking at its own earlier request
 * rather than a genuine refusal.
 */
export function claimPendingReferralCode(): ReferralClaim | null {
  const stored = readStored();
  if (!stored) return null;
  const firstAttempt = stored.attemptedAt === undefined;
  if (firstAttempt) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...stored, attemptedAt: Date.now() } as StoredCode),
      );
    } catch {
      // Unwritable storage just means the single-flight guard is unavailable;
      // the redeem itself still goes ahead.
    }
  }
  return { code: stored.code, firstAttempt };
}

export function clearPendingReferralCode(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; a stale slot expires on its own via the TTL.
  }
}
