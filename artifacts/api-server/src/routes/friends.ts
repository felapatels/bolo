import { createHmac } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  attemptsTable,
  friendshipsTable,
  friendInvitesTable,
  friendCodeAttemptsTable,
  gameSessionsTable,
} from "@workspace/db";
import { and, asc, eq, gte, or, inArray, sql, sum } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { sumAttemptXp } from "../lib/progressMetrics";
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
  email: string | null;
}

function toSummary(u: {
  id: string;
  displayName: string | null;
  email: string | null;
}): UserSummary {
  return { id: u.id, displayName: u.displayName, email: u.email };
}

// Loads the id/displayName/email for a set of user ids in one query, keyed by id.
async function loadUserSummaries(
  ids: string[],
): Promise<Map<string, UserSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
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
        email: usersTable.email,
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
        user: summaries.get(r.requesterId) ?? {
          id: r.requesterId,
          displayName: null,
          email: null,
        },
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
        user: summaries.get(r.addresseeId) ?? {
          id: r.addresseeId,
          displayName: null,
          email: null,
        },
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
      friend: summaries.get(updated.requesterId) ?? {
        id: updated.requesterId,
        displayName: null,
        email: null,
      },
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
      const summary = summaries.get(friendId) ?? {
        id: friendId,
        displayName: null,
        email: null,
      };
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

    // Resolve the caller's display name for the email body.
    const [callerRow] = await db
      .select({ displayName: usersTable.displayName, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const inviterName =
      callerRow?.displayName?.trim() ||
      callerRow?.email?.split("@")[0] ||
      "A friend";

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

// GET /friends/leaderboard — the caller plus their accepted friends, ranked by
// total XP (summed across every language), highest first. XP reuses the same
// progress math as the progress summary: a learner's XP is the sum of all their
// attempt scores. The caller's own entry is flagged with `isSelf` so clients can
// highlight their rank.
router.get(
  "/friends/leaderboard",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);

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
    const memberIds = new Set<string>([userId]);
    for (const f of friendships) {
      memberIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
    }
    const ids = [...memberIds];

    const [summaries, attempts, gameSessions] = await Promise.all([
      loadUserSummaries(ids),
      db
        .select({
          userId: attemptsTable.userId,
          phraseId: attemptsTable.phraseId,
          score: attemptsTable.score,
          createdAt: attemptsTable.createdAt,
        })
        .from(attemptsTable)
        .where(inArray(attemptsTable.userId, ids)),
      db
        .select({
          userId: gameSessionsTable.userId,
          totalXp: sql<number>`COALESCE(SUM(${gameSessionsTable.xpAwarded}), 0)`,
        })
        .from(gameSessionsTable)
        .where(inArray(gameSessionsTable.userId, ids))
        .groupBy(gameSessionsTable.userId),
    ]);

    // Build a per-user map of total XP earned through game sessions.
    const gameXpByUser = new Map<string, number>();
    for (const g of gameSessions) {
      gameXpByUser.set(g.userId, Number(g.totalXp));
    }

    // Group each member's attempts (across all languages) and run them through
    // the shared progress math so XP is computed identically to /progress.
    const byUser = new Map<
      string,
      { phraseId: number | null; score: number; createdAt: Date }[]
    >();
    for (const id of ids) byUser.set(id, []);
    for (const a of attempts) {
      byUser.get(a.userId)?.push({
        phraseId: a.phraseId,
        score: a.score,
        createdAt: a.createdAt,
      });
    }

    const entries = ids.map((id) => {
      const summary = summaries.get(id) ?? {
        id,
        displayName: null,
        email: null,
      };
      const practiceXp = sumAttemptXp(byUser.get(id) ?? []);
      const xp = practiceXp + (gameXpByUser.get(id) ?? 0);
      return {
        userId: id,
        displayName: summary.displayName,
        email: summary.email,
        xp,
        isSelf: id === userId,
      };
    });

    // Rank highest XP first; break ties deterministically by user id so ordering
    // (and ranks) are stable across requests.
    entries.sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));

    res.json(entries.map((e, i) => ({ ...e, rank: i + 1 })));
  },
);

export default router;
