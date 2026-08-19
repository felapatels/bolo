import { randomInt } from "node:crypto";
import {
  db,
  usersTable,
  referralRedemptionsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { grantTokens } from "./tokenService";
import { ensureAcceptedFriendship } from "./friendship";
import {
  REFERRAL_REWARD_REFERRER_CHAI,
  REFERRAL_REWARD_REFEREE_CHAI,
} from "./tokenEconomy";

// Referral R1, server only. Attribution at redeem time, grants at activation
// time, everything through the existing Chai ledger. No parallel bookkeeping:
// "total Chai earned from referrals" is derived from token_ledger rows.

// Unambiguous alphabet per owner spec: uppercase, no 0/O/1/I.
// 32 symbols × 6 places = 32^6 ≈ 1.07e9 codes.
//
// SAFETY NOTE, this same code is the learner's FRIEND code. It is deliberately
// reused rather than minting a second one, and that reuse is only safe because
// every code-initiated add lands as a *pending* friend request the recipient
// must accept (POST /friends/requests/by-code → status "pending"; see the
// accept handler in routes/friends.ts). Referral codes are meant to be
// broadcast, flyers, WhatsApp groups, events, so if the accept step is ever
// removed, every place a learner has posted their code silently becomes an
// open friend list. The ONE exception is referral redemption below, which
// auto-friends with no accept step because redeeming someone's link is already
// an explicit act by both parties.
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;

// Owner-ruled copy, US English, exact strings (route layer serves these).
export const REFERRAL_COPY = {
  alreadyRedeemed: "You have already used a referral code.",
  selfReferral: "You cannot use your own code.",
  unknownCode: "That code did not match. Check it and try again.",
} as const;

export function generateReferralCode(): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return out;
}

// Codes are stored uppercase; redemption input is normalized the same way so
// hand-typed lowercase codes still match.
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

// Lazy mint on first fetch (JIT provisioning, matching how the users row
// itself appears on the first authenticated request). Collision-safe: the
// users_referral_code_idx unique index arbitrates, and a losing generation
// retries with a fresh candidate. A concurrent request that minted first
// wins via the read-back.
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const [existing] = await db
    .select({ code: usersTable.referralCode })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateReferralCode();
    try {
      const updated = await db
        .update(usersTable)
        .set({ referralCode: candidate })
        .where(and(eq(usersTable.id, userId), isNull(usersTable.referralCode)))
        .returning({ code: usersTable.referralCode });
      if (updated.length > 0 && updated[0]!.code) return updated[0]!.code!;
      // Zero rows updated: either a concurrent request minted first, or the
      // user row does not exist. Read back to distinguish.
      const [readBack] = await db
        .select({ code: usersTable.referralCode })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      if (readBack?.code) return readBack.code;
      throw new Error(`referral code mint: no users row for ${userId}`);
    } catch (err) {
      if (isUniqueViolation(err)) continue; // candidate collided; try another
      throw err;
    }
  }
  throw new Error("referral code mint: exhausted retries");
}

export type RedeemResult =
  | { kind: "ok" }
  | { kind: "already_redeemed" }
  | { kind: "self_referral" }
  | { kind: "unknown_code" };

// Attribution ONLY. Grants nothing at redeem time; activation pays both sides
// later. Order matters: the already-redeemed check runs before the code
// lookup so a repeat attempt always gets the friendly 409, and never leaks
// whether some other code exists.
export async function redeemReferralCode(
  refereeUserId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = normalizeReferralCode(rawCode);

  const [existing] = await db
    .select({ id: referralRedemptionsTable.id })
    .from(referralRedemptionsTable)
    .where(eq(referralRedemptionsTable.refereeUserId, refereeUserId));
  if (existing) return { kind: "already_redeemed" };

  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.referralCode, code));
  if (!owner) return { kind: "unknown_code" };
  if (owner.id === refereeUserId) return { kind: "self_referral" };

  const inserted = await db
    .insert(referralRedemptionsTable)
    .values({ referrerUserId: owner.id, refereeUserId, code })
    .onConflictDoNothing({ target: referralRedemptionsTable.refereeUserId })
    .returning({ id: referralRedemptionsTable.id });
  // Zero rows means a concurrent redeem won the unique index race.
  if (inserted.length === 0) return { kind: "already_redeemed" };

  // Auto-friend: redeeming a link makes the two learners friends immediately,
  // with no accept step (the single exception to the accept gate, see the
  // note on REFERRAL_CODE_ALPHABET above). Idempotent and direction-safe via
  // ensureAcceptedFriendship, because the friendships unique index only covers
  // one ordered pair and would not stop a reverse duplicate.
  //
  // Best-effort on purpose: attribution is already committed at this point and
  // the Chai grant/timing must not change, so a social-graph failure is logged
  // rather than turned into a failed redemption.
  try {
    await ensureAcceptedFriendship(owner.id, refereeUserId);
  } catch (err) {
    console.error("[referral] auto-friend after redeem failed", err);
  }

  return { kind: "ok" };
}

// Activation hook, called from POST /attempts (the session-complete flow the
// Chai receipt rides; see the route comment there). Idempotent twice over:
// the granted_at guard is the fast skip, and both ledger grants carry the
// house unique (user, reason, ref) key. Grants run BEFORE the claim update so
// a crash between the two is healed by the next call re-running grants that
// no-op against the ledger index.
export async function activateReferralIfPending(
  refereeUserId: string,
): Promise<boolean> {
  const [pending] = await db
    .select({
      id: referralRedemptionsTable.id,
      referrerUserId: referralRedemptionsTable.referrerUserId,
    })
    .from(referralRedemptionsTable)
    .where(
      and(
        eq(referralRedemptionsTable.refereeUserId, refereeUserId),
        isNull(referralRedemptionsTable.grantedAt),
      ),
    );
  if (!pending) return false;

  const refId = `referral:${pending.id}`;
  await grantTokens(
    refereeUserId,
    "earn_referral_referee",
    refId,
    REFERRAL_REWARD_REFEREE_CHAI,
  );
  await grantTokens(
    pending.referrerUserId,
    "earn_referral_referrer",
    refId,
    REFERRAL_REWARD_REFERRER_CHAI,
  );

  const now = new Date();
  const claimed = await db
    .update(referralRedemptionsTable)
    .set({ activatedAt: now, grantedAt: now })
    .where(
      and(
        eq(referralRedemptionsTable.id, pending.id),
        isNull(referralRedemptionsTable.grantedAt),
      ),
    )
    .returning({ id: referralRedemptionsTable.id });
  return claimed.length > 0;
}
