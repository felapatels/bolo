import { createHmac } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  friendshipsTable,
  friendInvitesTable,
  friendCodeAttemptsTable,
  userTokenStateTable,
  xpLedgerTable,
  activityEventsTable,
} from "@workspace/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ne,
  or,
  inArray,
  isNotNull,
  sql,
  sum,
} from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { loadStreakLadder } from "../lib/streakDays";
import { createRateLimit } from "../middlewares/rateLimit";
import { sendFriendInviteEmail } from "../lib/inviteEmail";
import { findFriendshipBetween } from "../lib/friendship";
import { normalizeReferralCode, REFERRAL_COPY } from "../lib/referral";

const router: IRouter = Router();

// Rate limit for the invite endpoint: max 20 invites per 15 minutes per caller,
// as a coarse per-user guard against rapid-fire bursts to many different
// addresses. The per-(caller, recipient) 24-hour cooldown is enforced
// separately at the DB level inside the handler.
// In test mode (SKIP_INVITE_EMAIL=1) the limit is raised so the sliding-window
// state accumulated across sequential test runs does not interfere.
const inviteRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.SKIP_INVITE_EMAIL === "1" ? 10_000 : 20,
  message: "You're sending invites too quickly. Please wait a moment.",
});

// The user id is derived server-side from the verified Clerk session by the
// requireAuth middleware — never from client-supplied input.
function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

interface UserSummary {
  id: string;
  displayName: string | null;
  // IANA zone this learner's days are bucketed in. Carried here so the
  // leaderboard's per-member streak read does not fetch the users row a second
  // time; null means UTC, which is what streakDays already assumes.
  timezone: string | null;
  // What this learner's Bolo is wearing, so a friend row can render their
  // mascot dressed. An outfit is bought with Chai and was previously visible
  // only to its owner (the self-only GET /tokens); friend and leaderboard rows
  // are the one place anybody else sees it. Null in either slot means the
  // canonical undressed bird — never a blank or a fallback initial.
  equippedOutfit: string | null;
  equippedAccessory: string | null;
  /**
   * The PUBLIC name, or null for a learner who has never set one.
   *
   * Carried separately from displayName and never conflated with it.
   * displayName is the private nickname Bolo calls them by; username is what
   * strangers may see. A global payload sends the username and NEVER the
   * displayName, which is the whole reason there are two fields here rather
   * than one that changes meaning by scope.
   */
  username: string | null;
  /** False when the learner has opted out of every global surface. */
  shareStats: boolean;
  // Whether this learner's First Class window is open RIGHT NOW. A boolean,
  // never the expiry timestamp: when somebody else's status runs out is not
  // the reader's business, and a countdown on a friend's row is noise on a
  // screen that exists to compare progress.
  firstClassActive: boolean;
}

// The equipped slots are optional here so callers that already hold a plain
// users row (the code lookup, which answers with a just-created *pending*
// request) can build a summary without a second query. A pending request row
// shows no mascot, so undressed is the honest answer there.
function toSummary(u: {
  id: string;
  displayName: string | null;
  username?: string | null;
  shareStats?: boolean | null;
  timezone?: string | null;
  equippedOutfit?: string | null;
  equippedAccessory?: string | null;
  firstClassExpiresAt?: Date | null;
}): UserSummary {
  return {
    id: u.id,
    displayName: u.displayName,
    username: u.username ?? null,
    // Defaults TRUE to match the column, but a caller that did not select it
    // is not evidence of consent: every global query filters on the column
    // itself, never on this field.
    shareStats: u.shareStats ?? true,
    timezone: u.timezone ?? null,
    equippedOutfit: u.equippedOutfit ?? null,
    equippedAccessory: u.equippedAccessory ?? null,
    // Resolved here, server-side, from the absolute deadline the spend wrote.
    // A learner with no token state row at all (never opened the stall) has no
    // deadline and so is not First Class.
    firstClassActive: u.firstClassExpiresAt
      ? u.firstClassExpiresAt.getTime() > Date.now()
      : false,
  };
}

// Loads the identity + equipped mascot state for a set of user ids in ONE
// query, keyed by id. The outfit joins here rather than being fetched per row:
// a leaderboard of twenty friends must still cost one round trip, and a
// learner who has never opened the Chai stall has no user_token_state row at
// all, so the join is a LEFT join and both slots come back null for them.
async function loadUserSummaries(
  ids: string[],
): Promise<Map<string, UserSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      shareStats: usersTable.shareStats,
      timezone: usersTable.timezone,
      equippedOutfit: userTokenStateTable.equippedOutfit,
      equippedAccessory: userTokenStateTable.equippedAccessory,
      firstClassExpiresAt: userTokenStateTable.firstClassExpiresAt,
    })
    .from(usersTable)
    .leftJoin(userTokenStateTable, eq(userTokenStateTable.userId, usersTable.id))
    .where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
}

/** The summary for a user we could not load — identity unknown, bird undressed. */
function unknownSummary(id: string): UserSummary {
  return {
    id,
    displayName: null,
    username: null,
    shareStats: false,
    timezone: null,
    equippedOutfit: null,
    equippedAccessory: null,
    firstClassActive: false,
  };
}

// ---------------------------------------------------------------------------
// Add a friend by their friend code
//
// There is deliberately NO lookup by email, name, or partial match anywhere in
// this router any more. The only way to find another learner is to already hold
// their exact friend code, which is their referral code (see the safety note on
// REFERRAL_CODE_ALPHABET in lib/referral.ts).
// ---------------------------------------------------------------------------

// Friend-code guessing budget. The code space is 32^6 ≈ 1.07e9, so these caps
// keep a brute-force search astronomically out of reach while leaving a
// hand-typing learner (and their typos) far more room than they will ever use.
//
// Two axes, because a per-account cap alone bounds nothing: an attacker who can
// mint accounts simply spreads their guesses. The per-IP cap is the one that
// actually bounds them, and it is set at 3× the per-account cap so a NAT'd
// household, classroom or café can all add each other on the same evening.
//
// DB-backed on purpose (the friend_code_attempts log), not the in-memory
// middleware in middlewares/rateLimit.ts: an in-memory window resets on every
// deploy and is per-instance, which is far too weak for a guessing surface.
const FRIEND_CODE_WINDOW_MS = 60 * 60 * 1000;
const FRIEND_CODE_MAX_PER_USER = 10;
const FRIEND_CODE_MAX_PER_IP = 30;

// Salted hash of the caller's IP. Only equality between two requests matters,
// so the raw address is never stored. Keyed with SESSION_SECRET when present so
// the digests are not reversible from a stolen table alone.
function hashIp(ip: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "bolo-friend-code")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

function retryAfterSeconds(oldest: Date): number {
  return Math.max(
    1,
    Math.ceil((oldest.getTime() + FRIEND_CODE_WINDOW_MS - Date.now()) / 1000),
  );
}

const FRIEND_CODE_RATE_LIMIT_MESSAGE =
  "Too many code attempts. Please try again later.";

// POST /friends/requests/by-code — send a friend request to the learner who
// owns the given friend code.
//
// This ALWAYS creates a *pending* request, never an instant friendship, and
// that is the property the whole design rests on: friend codes are referral
// codes, and referral codes are broadcast on flyers and in group chats. The
// accept step is what stops a broadcast code from becoming an open friend list.
//
// Rejection wording is uniform on purpose. An unknown code, a near-miss of a
// real code, and a code belonging to someone the caller already has a
// relationship with all return the SAME 404 and the SAME sentence, so probing
// the endpoint reveals nothing about which codes exist. Only the self-add case
// answers differently, since the caller already knows their own code.
router.post(
  "/friends/requests/by-code",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const code = normalizeReferralCode(String(req.body?.code ?? ""));
    const ipHash = hashIp(req.ip ?? "unknown");

    if (!code || code.length > 32) {
      res.status(400).json({ error: "Enter a friend code." });
      return;
    }

    const windowStart = new Date(Date.now() - FRIEND_CODE_WINDOW_MS);

    // Cheap non-authoritative fast path (same shape as the zone test-out
    // throttle): reject an obviously over-budget caller before doing any work.
    const priorAttempts = await db
      .select({
        createdAt: friendCodeAttemptsTable.createdAt,
        mine: sql<boolean>`${friendCodeAttemptsTable.userId} = ${userId}`,
      })
      .from(friendCodeAttemptsTable)
      .where(
        and(
          gte(friendCodeAttemptsTable.createdAt, windowStart),
          or(
            eq(friendCodeAttemptsTable.userId, userId),
            eq(friendCodeAttemptsTable.ipHash, ipHash),
          ),
        ),
      )
      .orderBy(asc(friendCodeAttemptsTable.createdAt));
    const overBudget = (rows: { createdAt: Date; mine: boolean }[]) => {
      const mine = rows.filter((r) => r.mine);
      if (mine.length >= FRIEND_CODE_MAX_PER_USER) return mine[0]!.createdAt;
      if (rows.length >= FRIEND_CODE_MAX_PER_IP) return rows[0]!.createdAt;
      return null;
    };
    const fastOldest = overBudget(priorAttempts);
    if (fastOldest) {
      const seconds = retryAfterSeconds(fastOldest);
      res.status(429).set("Retry-After", String(seconds)).json({
        error: FRIEND_CODE_RATE_LIMIT_MESSAGE,
        retryAfterSeconds: seconds,
      });
      return;
    }

    // Authoritative recheck + log insert inside a transaction, serialised by
    // two advisory locks (account axis, then IP axis — always in that order, so
    // concurrent callers can never deadlock against each other). Without this,
    // a burst of parallel guesses would all pass the SELECT above.
    let limited: number | null = null;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('friend_code:user'), hashtext(${userId}))`,
      );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('friend_code:ip'), hashtext(${ipHash}))`,
      );
      const fresh = await tx
        .select({
          createdAt: friendCodeAttemptsTable.createdAt,
          mine: sql<boolean>`${friendCodeAttemptsTable.userId} = ${userId}`,
        })
        .from(friendCodeAttemptsTable)
        .where(
          and(
            gte(friendCodeAttemptsTable.createdAt, windowStart),
            or(
              eq(friendCodeAttemptsTable.userId, userId),
              eq(friendCodeAttemptsTable.ipHash, ipHash),
            ),
          ),
        )
        .orderBy(asc(friendCodeAttemptsTable.createdAt));
      const oldest = overBudget(fresh);
      if (oldest) {
        limited = retryAfterSeconds(oldest);
        return; // commit releases the locks; nothing logged
      }
      // Logged before the lookup, and logged whether the code hits or misses.
      // Counting only misses would let a guesser refill their budget by
      // interleaving a code they already know is good.
      await tx.insert(friendCodeAttemptsTable).values({ userId, ipHash });
    });
    if (limited !== null) {
      res.status(429).set("Retry-After", String(limited)).json({
        error: FRIEND_CODE_RATE_LIMIT_MESSAGE,
        retryAfterSeconds: limited,
      });
      return;
    }

    // Exact match only — no prefix, fuzzy or "did you mean" matching, ever.
    const [owner] = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
      })
      .from(usersTable)
      .where(eq(usersTable.referralCode, code))
      .limit(1);

    if (owner && owner.id === userId) {
      res.status(400).json({ error: "That's your own friend code." });
      return;
    }

    // Unknown code and existing-relationship share one response. Splitting them
    // would turn this endpoint into an oracle for "is this code real?".
    const existing = owner ? await findFriendshipBetween(userId, owner.id) : null;
    if (!owner || existing) {
      res.status(404).json({ error: REFERRAL_COPY.unknownCode });
      return;
    }

    const [created] = await db
      .insert(friendshipsTable)
      .values({ requesterId: userId, addresseeId: owner.id, status: "pending" })
      .returning();

    res.status(201).json({
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
      user: toSummary(owner),
    });
  },
);

// GET /friends/requests/incoming — pending requests awaiting the caller's
// response, each annotated with the requester's identity.
router.get(
  "/friends/requests/incoming",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const rows = await db
      .select()
      .from(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.addresseeId, userId),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    const summaries = await loadUserSummaries(rows.map((r) => r.requesterId));
    res.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        user: summaries.get(r.requesterId) ?? unknownSummary(r.requesterId),
      })),
    );
  },
);

// GET /friends/requests/outgoing — the caller's pending requests still waiting
// on the other learner, each annotated with the addressee's identity.
router.get(
  "/friends/requests/outgoing",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const rows = await db
      .select()
      .from(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.requesterId, userId),
          eq(friendshipsTable.status, "pending"),
        ),
      );
    const summaries = await loadUserSummaries(rows.map((r) => r.addresseeId));
    res.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        user: summaries.get(r.addresseeId) ?? unknownSummary(r.addresseeId),
      })),
    );
  },
);

// Loads a pending request the caller is allowed to respond to (they must be its
// addressee). Returns null if it doesn't exist / isn't theirs to answer.
async function loadIncomingPending(requestId: number, userId: string) {
  if (!Number.isInteger(requestId)) return null;
  const [row] = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.id, requestId),
        eq(friendshipsTable.addresseeId, userId),
        eq(friendshipsTable.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// POST /friends/requests/:id/accept — the addressee accepts a pending request,
// turning it into a mutual accepted friendship.
//
// LOAD-BEARING. Do not remove this step, and do not add a path that creates an
// "accepted" friendship straight from a code. A learner's friend code IS their
// referral code, and referral codes are designed to be broadcast — printed on
// flyers, pasted into WhatsApp groups, read out at events. Reusing one code for
// both jobs is only safe because everything a code can do on its own is put a
// *pending* request in front of the recipient, who decides. Delete this gate
// and every place anyone has ever posted their code silently becomes an open
// friend list.
//
// The single exception is referral redemption (lib/referral.ts →
// ensureAcceptedFriendship), which friends both sides instantly because
// redeeming someone's link is already an explicit act by both parties.
router.post(
  "/friends/requests/:id/accept",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const requestId = Number(req.params.id);
    const pending = await loadIncomingPending(requestId, userId);
    if (!pending) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    const [updated] = await db
      .update(friendshipsTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(friendshipsTable.id, requestId))
      .returning();
    const summaries = await loadUserSummaries([updated.requesterId]);
    res.json({
      id: updated.id,
      status: updated.status,
      friend:
        summaries.get(updated.requesterId) ?? unknownSummary(updated.requesterId),
    });
  },
);

// POST /friends/requests/:id/decline — the addressee declines a pending
// request, removing it entirely so it can be re-sent later.
router.post(
  "/friends/requests/:id/decline",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const requestId = Number(req.params.id);
    const pending = await loadIncomingPending(requestId, userId);
    if (!pending) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    await db.delete(friendshipsTable).where(eq(friendshipsTable.id, requestId));
    res.status(204).end();
  },
);

// GET /friends — the caller's accepted friends (read from both sides of the
// stored directional row), each with their identity.
router.get("/friends", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.requesterId, userId),
          eq(friendshipsTable.addresseeId, userId),
        ),
      ),
    );
  const friendIds = rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );
  const summaries = await loadUserSummaries(friendIds);
  res.json(
    rows.map((r) => {
      const friendId = r.requesterId === userId ? r.addresseeId : r.requesterId;
      const summary = summaries.get(friendId) ?? unknownSummary(friendId);
      return { friendshipId: r.id, since: r.respondedAt, ...summary };
    }),
  );
});

// DELETE /friends/:userId — remove an accepted friendship (from either side).
router.delete("/friends/:userId", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const friendId = String(req.params.userId);
  const existing = await findFriendshipBetween(userId, friendId);
  if (!existing || existing.status !== "accepted") {
    res.status(404).json({ error: "Friendship not found" });
    return;
  }
  await db.delete(friendshipsTable).where(eq(friendshipsTable.id, existing.id));
  res.status(204).end();
});

// POST /friends/invite — send a "download Bolo!" referral email to an email
// address that doesn't belong to any existing learner. Enforces two layers of
// rate limiting:
//   1. A coarse per-user in-memory sliding window (5 invites / 15 min) — the
//      middleware above guards this.
//   2. A per-(caller, recipient) 24-hour cooldown checked against `lastSentAt`
//      in the `friend_invites` table so the guard survives a server restart.
//
// When the invited person signs up, `ensureLocalUser` in userIdentity.ts will
// find the pending invite rows and auto-create a pending friend request from
// each inviter, then delete the invite rows.
router.post(
  "/friends/invite",
  inviteRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const rawEmail = String(req.body?.email ?? "").trim();
    const email = rawEmail.toLowerCase();

    if (!email) {
      res.status(400).json({ error: "Missing email" });
      return;
    }

    // Basic format sanity check — full validation lives on the client.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    // If the email already belongs to a learner, redirect the caller to the
    // regular "add friend" flow instead. There is no email lookup any more, so
    // the only way to add them is with their friend code.
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (existing) {
      res.status(400).json({
        error:
          "That email already has a Bolo! account. Ask them for their friend code to add them.",
      });
      return;
    }

    // Per-(caller, recipient) 24-hour cooldown enforced at the DB level.
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const [prior] = await db
      .select({
        id: friendInvitesTable.id,
        sendCount: friendInvitesTable.sendCount,
        lastSentAt: friendInvitesTable.lastSentAt,
      })
      .from(friendInvitesTable)
      .where(
        and(
          eq(friendInvitesTable.inviterId, userId),
          eq(friendInvitesTable.inviteeEmail, email),
        ),
      )
      .limit(1);

    if (prior && Date.now() - prior.lastSentAt.getTime() < COOLDOWN_MS) {
      res.status(429).json({
        error:
          "You've already invited this address recently. You can send another invite after 24 hours.",
      });
      return;
    }

    // Resolve the caller's display name for the email body. Deliberately NOT
    // their email local-part: this name is read by a third party who may not
    // know the caller's address, and an address is not ours to forward.
    const [callerRow] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const inviterName = callerRow?.displayName?.trim() || "Fellow learner";

    // Send the invite email. Fail fast — the DB row is only written after a
    // successful send so stale rows never block the cooldown window.
    await sendFriendInviteEmail({ inviterName, toEmail: email });

    // Upsert the invite row: insert on first send, increment on re-send.
    let sendCount: number;
    if (prior) {
      const [updated] = await db
        .update(friendInvitesTable)
        .set({
          sendCount: prior.sendCount + 1,
          lastSentAt: new Date(),
        })
        .where(eq(friendInvitesTable.id, prior.id))
        .returning({ sendCount: friendInvitesTable.sendCount });
      sendCount = updated?.sendCount ?? prior.sendCount + 1;
    } else {
      const [inserted] = await db
        .insert(friendInvitesTable)
        .values({ inviterId: userId, inviteeEmail: email })
        .returning({ sendCount: friendInvitesTable.sendCount });
      sendCount = inserted?.sendCount ?? 1;
    }

    res.json({ sent: true, sendCount });
  },
);

// ---------------------------------------------------------------------------
// The leaderboard
// ---------------------------------------------------------------------------

/** The two windows the board asks for. */
type LeaderboardWindow = "all-time" | "week";

/**
 * The caller's ACCEPTED friends, never the caller themselves.
 *
 * One resolution shared by the board and the feed. A friendship is a single
 * directional row, so the caller can sit on either side of it and the "other
 * end" has to be picked per row; doing that twice in two handlers is how the
 * two surfaces end up disagreeing about who a friend is.
 */
async function loadAcceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.requesterId, userId),
          eq(friendshipsTable.addresseeId, userId),
        ),
      ),
    );
  const ids = new Set<string>();
  for (const f of friendships) {
    ids.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
  }
  // A self-friendship cannot be created, but if one ever existed it must not
  // put the caller's own events in their friends' feed.
  ids.delete(userId);
  return [...ids];
}

/**
 * Midnight UTC on the Monday of the week containing `now`.
 *
 * The week is a UTC week for everybody, deliberately. A leaderboard is a
 * COMPARISON, so its window has to be one window: bucketing each learner's
 * rows in their own zone would put friends on different weeks and let the
 * Sunday-evening Auckland learner and the Sunday-evening Los Angeles learner
 * be scored against different stretches of time. Per-learner zones are still
 * exactly right for streaks (a day is a day where you live), which is why
 * streakDays keeps using them and this does not.
 */
function utcWeekStart(now: Date): Date {
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // getUTCDay is Sunday-first; shift so Monday is 0.
  const daysSinceMonday = (midnight.getUTCDay() + 6) % 7;
  midnight.setUTCDate(midnight.getUTCDate() - daysSinceMonday);
  return midnight;
}

/**
 * Whose numbers a board or feed is showing.
 *
 * "friends" is the original behaviour and stays the meaning of an absent
 * parameter, so every client that predates 2026-08-25 keeps working unchanged.
 * "all" is every learner who has opted in by SETTING A USERNAME and has not
 * since opted out.
 */
export type BoardScope = "friends" | "all";

/**
 * How many rows the global board returns.
 *
 * Bounded at the QUERY, never trimmed after: the streak read below is one load
 * per learner by construction, so an unbounded id list turns this route into a
 * scan of the entire user table the day the app has real numbers on it.
 */
const GLOBAL_BOARD_LIMIT = 50;

// GET /friends/leaderboard — the caller plus their accepted friends, ranked by
// XP, highest first. The caller's own entry is flagged with `isSelf` so clients
// can highlight their position.
//
// XP comes from xp_ledger, the one authority: the ledger applies difficulty
// and decay multipliers before writing, so summing attempt scores (which this
// route used to do) produced a number that disagreed with every other XP a
// learner is shown. One grouped query covers the whole board, never a scan
// per member.
//
// Two windows:
//   all-time: every ledger row, INCLUDING the 'bootstrap' backfill lump sums,
//              because those rows are how pre-ledger history exists at all and
//              dropping them would erase most of a long-standing learner.
//   week:     rows since Monday 00:00 UTC, EXCLUDING 'bootstrap', because a
//              backfill row carries the backfill's own timestamp: leave it in
//              and whichever week the backfill landed in counts a lifetime of
//              XP as seven days' work.
//
// Ties break by current streak, then by who reached the total first. There is
// deliberately no id-based fallback any more: ordering two genuinely level
// learners by the alphabet of their user ids is not a tie-break, it is a coin
// toss dressed up as one, and it silently favoured the same person forever.
router.get(
  "/friends/leaderboard",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const window: LeaderboardWindow =
      req.query.window === "week" ? "week" : "all-time";
    const scope: BoardScope = req.query.scope === "all" ? "all" : "friends";

    const windowFilters = () => {
      const f = [];
      if (window === "week") {
        f.push(gte(xpLedgerTable.createdAt, utcWeekStart(new Date())));
        f.push(ne(xpLedgerTable.source, "bootstrap"));
      }
      return f;
    };

    type XpRow = { userId: string; totalXp: number; reachedAt: string | null };
    const totalXp = sql<number>`COALESCE(SUM(${xpLedgerTable.xp}), 0)`;
    // When the learner's cumulative XP last moved, which for a total is the
    // moment they reached it. Used only as the final tie-break.
    const reachedAtCol = sql<string | null>`MAX(${xpLedgerTable.createdAt})`;

    let ids: string[];
    let xpRows: XpRow[];
    if (scope === "all") {
      // THE GLOBAL BOARD IS BOUNDED AT THE QUERY, not trimmed afterwards. The
      // per-learner streak read below is one load each by construction, so an
      // unbounded id list would turn this route into a scan of the whole user
      // table the day the app has any users. Top N by XP, then hydrate.
      //
      // ELIGIBILITY IS THE CONSENT GATE AND IT LIVES IN THE WHERE CLAUSE: a
      // username set, and share_stats still true. Never a filter applied to
      // rows already fetched, because the row that leaks is the one somebody
      // forgot to filter.
      const top = await db
        .select({ userId: xpLedgerTable.userId, totalXp, reachedAt: reachedAtCol })
        .from(xpLedgerTable)
        .innerJoin(usersTable, eq(usersTable.id, xpLedgerTable.userId))
        .where(
          and(
            isNotNull(usersTable.username),
            eq(usersTable.shareStats, true),
            ...windowFilters(),
          ),
        )
        .groupBy(xpLedgerTable.userId)
        .orderBy(desc(totalXp))
        .limit(GLOBAL_BOARD_LIMIT);
      xpRows = top.map((r) => ({ ...r, totalXp: Number(r.totalXp) }));
      ids = xpRows.map((r) => r.userId);
      // The caller sees their own row even from outside the top slice, but
      // only if they are eligible: a learner with no username is not on this
      // board, including to themselves, which is what makes the gate legible.
      if (!ids.includes(userId)) {
        const [me] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.id, userId),
              isNotNull(usersTable.username),
              eq(usersTable.shareStats, true),
            ),
          )
          .limit(1);
        if (me) {
          const [mine] = await db
            .select({ userId: xpLedgerTable.userId, totalXp, reachedAt: reachedAtCol })
            .from(xpLedgerTable)
            .where(and(eq(xpLedgerTable.userId, userId), ...windowFilters()))
            .groupBy(xpLedgerTable.userId);
          ids = [...ids, userId];
          if (mine) xpRows = [...xpRows, { ...mine, totalXp: Number(mine.totalXp) }];
        }
      }
    } else {
      const friendIds = await loadAcceptedFriendIds(userId);
      // The board is the caller AND their friends; the feed is friends only.
      ids = [userId, ...friendIds];
      const rows = await db
        .select({ userId: xpLedgerTable.userId, totalXp, reachedAt: reachedAtCol })
        .from(xpLedgerTable)
        .where(and(inArray(xpLedgerTable.userId, ids), ...windowFilters()))
        .groupBy(xpLedgerTable.userId);
      xpRows = rows.map((r) => ({ ...r, totalXp: Number(r.totalXp) }));
    }

    const summaries = await loadUserSummaries(ids);

    const xpByUser = new Map<string, number>();
    const reachedAtByUser = new Map<string, number>();
    for (const row of xpRows) {
      xpByUser.set(row.userId, Number(row.totalXp));
      if (row.reachedAt != null) {
        reachedAtByUser.set(row.userId, new Date(row.reachedAt).getTime());
      }
    }

    // Streaks are read one learner at a time, by construction: loadStreakLadder
    // resolves each learner's own plan and time zone before it can bucket a
    // single day, so there is no set-wide version of it to reach for. N loads
    // is the cost of putting a streak on a friend row, and it is paid here
    // rather than by redesigning the one streak read every other surface uses.
    const streakByUser = new Map<string, number>();
    await Promise.all(
      ids.map(async (id) => {
        const ladder = await loadStreakLadder(
          id,
          summaries.get(id)?.timezone ?? null,
        );
        streakByUser.set(id, ladder.currentStreakDays);
      }),
    );

    const entries = ids.map((id) => {
      const summary = summaries.get(id) ?? unknownSummary(id);
      return {
        userId: id,
        // A GLOBAL ROW CARRIES THE USERNAME AND NEVER THE DISPLAY NAME. The
        // display name is the private nickname collected while it was private;
        // sending it to strangers is the exact failure this whole feature is
        // shaped to avoid, and doing it in a field called displayName is how
        // it would happen without anybody noticing. On the friends board the
        // display name is right: they know each other.
        displayName: scope === "all" ? summary.username : summary.displayName,
        username: summary.username,
        // The row's mascot, carried by the leaderboard payload itself so no
        // row has to fetch anything of its own.
        equippedOutfit: summary.equippedOutfit,
        equippedAccessory: summary.equippedAccessory,
        // Status, not a countdown: the row shows a gold chip while the window
        // is open and nothing once it closes.
        firstClassActive: summary.firstClassActive,
        xp: xpByUser.get(id) ?? 0,
        currentStreakDays: streakByUser.get(id) ?? 0,
        // ISO, or null for a learner with no XP in this window; they have not
        // reached anything, so there is nothing to be earliest at.
        reachedAt: reachedAtByUser.has(id)
          ? new Date(reachedAtByUser.get(id) as number).toISOString()
          : null,
        isSelf: id === userId,
      };
    });

    entries.sort((a, b) => compareLeaderboardEntries(a, b));

    res.json(entries.map((e, i) => ({ ...e, rank: i + 1 })));
  },
);

/**
 * The ranking rule, in one place: more XP first, then the longer streak, then
 * whoever got there first. A learner with no XP in the window has no
 * reached-at, and sorts behind anyone who does at the same total.
 */
function compareLeaderboardEntries(
  a: { xp: number; currentStreakDays: number; reachedAt: string | null },
  b: { xp: number; currentStreakDays: number; reachedAt: string | null },
): number {
  if (b.xp !== a.xp) return b.xp - a.xp;
  if (b.currentStreakDays !== a.currentStreakDays) {
    return b.currentStreakDays - a.currentStreakDays;
  }
  if (a.reachedAt === b.reachedAt) return 0;
  if (a.reachedAt === null) return 1;
  if (b.reachedAt === null) return -1;
  return a.reachedAt < b.reachedAt ? -1 : 1;
}

// ---------------------------------------------------------------------------
// The activity feed
// ---------------------------------------------------------------------------

/** Feed page size: the default a tab asks for, and the ceiling it may ask for. */
const FEED_DEFAULT_LIMIT = 20;
const FEED_MAX_LIMIT = 50;

/**
 * `limit`, clamped. A junk value falls back to the default rather than 400ing:
 * the feed is a read of things that already happened, and refusing to show it
 * over a malformed query string helps nobody.
 */
function parseFeedLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return FEED_DEFAULT_LIMIT;
  return Math.min(n, FEED_MAX_LIMIT);
}

// GET /friends/feed — what the caller's accepted friends have been doing,
// newest first.
//
// FRIENDS ONLY, and never the caller. The gate is the friend-id set resolved
// server-side (the same one the board uses); no client input selects whose
// events come back. The caller's own moments are excluded because a feed is
// for reading about other people: seeing your own equip echoed back is noise,
// and the surfaces that celebrate your own wins already did so at the moment.
//
// The actor carries a display name and a mascot and NOTHING else. Email in
// particular is never on this payload: a friend code is deliberately the only
// way to find somebody in this router, and a feed that leaked addresses would
// undo that in one response.
router.get(
  "/friends/feed",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const limit = parseFeedLimit(req.query.limit);
    const scope: BoardScope = req.query.scope === "all" ? "all" : "friends";

    const cols = {
      id: activityEventsTable.id,
      userId: activityEventsTable.userId,
      type: activityEventsTable.type,
      refId: activityEventsTable.refId,
      payload: activityEventsTable.payload,
      createdAt: activityEventsTable.createdAt,
    };

    // THE GLOBAL FEED IS A JOIN, NOT A LIST OF IDS. Eligibility (a username
    // set, share_stats still true) is a WHERE clause on the users row, so a
    // learner who has never opted in cannot appear even transiently, and a
    // learner who opts out disappears on their next read. Filtering fetched
    // rows instead would work right up until somebody forgot to.
    //
    // The caller is excluded from BOTH scopes, for the reason the friends feed
    // already gives: a feed is for reading about other people, and your own
    // equip echoed back is noise on a screen that already celebrated it.
    let rows;
    if (scope === "all") {
      rows = await db
        .select(cols)
        .from(activityEventsTable)
        .innerJoin(usersTable, eq(usersTable.id, activityEventsTable.userId))
        .where(
          and(
            isNotNull(usersTable.username),
            eq(usersTable.shareStats, true),
            ne(activityEventsTable.userId, userId),
          ),
        )
        // id breaks the tie: two events written in the same transaction share
        // a timestamp, and a feed that reorders them between reads looks
        // broken.
        .orderBy(desc(activityEventsTable.createdAt), desc(activityEventsTable.id))
        .limit(limit);
    } else {
      const friendIds = await loadAcceptedFriendIds(userId);
      // No friends, no feed. Skipping the query also keeps `inArray` off an
      // empty list, which no dialect answers usefully.
      if (friendIds.length === 0) {
        res.json([]);
        return;
      }
      rows = await db
        .select(cols)
        .from(activityEventsTable)
        .where(inArray(activityEventsTable.userId, friendIds))
        .orderBy(desc(activityEventsTable.createdAt), desc(activityEventsTable.id))
        .limit(limit);
    }

    // One summary load for the whole page, keyed by actor, so a page of twenty
    // events by the same friend still costs one query.
    const summaries = await loadUserSummaries([
      ...new Set(rows.map((r) => r.userId)),
    ]);

    res.json(
      rows.map((row) => {
        const summary = summaries.get(row.userId) ?? unknownSummary(row.userId);
        return {
          id: row.id,
          type: row.type,
          refId: row.refId,
          payload: row.payload ?? null,
          createdAt: row.createdAt.toISOString(),
          actor: {
            userId: summary.id,
            // A GLOBAL ROW CARRIES THE USERNAME AND NEVER THE DISPLAY NAME.
            // Same rule as the board, and stated twice on purpose: the display
            // name was collected while it was private, and sending it to
            // strangers in a field called displayName is how it would leak
            // without anybody noticing.
            displayName:
              scope === "all" ? summary.username : summary.displayName,
            username: summary.username,
            equippedOutfit: summary.equippedOutfit,
            equippedAccessory: summary.equippedAccessory,
            firstClassActive: summary.firstClassActive,
          },
        };
      }),
    );
  },
);

export default router;
