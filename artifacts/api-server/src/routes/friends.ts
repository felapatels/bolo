import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, attemptsTable, friendshipsTable } from "@workspace/db";
import { and, eq, or, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { computeProgressMetrics } from "../lib/progressMetrics";

const router: IRouter = Router();

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

// GET /friends/search?email=... — find a single learner by their exact email so
// the caller can send them a friend request. Emails are matched
// case-insensitively. Never returns the caller themselves.
router.get("/friends/search", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const email = String(req.query.email ?? "").trim();
  if (!email) {
    res.status(400).json({ error: "Missing email" });
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  // Fall back to a case-insensitive match if an exact one wasn't found.
  const match =
    rows.find((r) => r.email === email) ??
    rows.find((r) => (r.email ?? "").toLowerCase() === email.toLowerCase());

  if (!match || match.id === userId) {
    res.status(404).json({ error: "No learner found with that email" });
    return;
  }

  res.json(toSummary(match));
});

// Finds any friendship row (either direction) between two learners.
async function findFriendship(a: string, b: string) {
  const [row] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(
          eq(friendshipsTable.requesterId, a),
          eq(friendshipsTable.addresseeId, b),
        ),
        and(
          eq(friendshipsTable.requesterId, b),
          eq(friendshipsTable.addresseeId, a),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

// POST /friends/requests — send a friend request to the learner with the given
// email. Guards against friending yourself, an unknown email, or a duplicate
// request/friendship in either direction.
router.post("/friends/requests", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const email = String(req.body?.email ?? "").trim();
  if (!email) {
    res.status(400).json({ error: "Missing email" });
    return;
  }

  const candidates = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  const target =
    candidates.find((r) => r.email === email) ??
    candidates.find((r) => (r.email ?? "").toLowerCase() === email.toLowerCase());

  if (!target) {
    res.status(404).json({ error: "No learner found with that email" });
    return;
  }
  if (target.id === userId) {
    res.status(400).json({ error: "You can't add yourself as a friend" });
    return;
  }

  const existing = await findFriendship(userId, target.id);
  if (existing) {
    res.status(409).json({
      error:
        existing.status === "accepted"
          ? "You're already friends with this learner"
          : "There's already a pending request between you two",
    });
    return;
  }

  const [created] = await db
    .insert(friendshipsTable)
    .values({ requesterId: userId, addresseeId: target.id, status: "pending" })
    .returning();

  const summaries = await loadUserSummaries([target.id]);
  res.status(201).json({
    id: created.id,
    status: created.status,
    createdAt: created.createdAt,
    user: summaries.get(target.id) ?? {
      id: target.id,
      displayName: null,
      email: target.email,
    },
  });
});

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
  const existing = await findFriendship(userId, friendId);
  if (!existing || existing.status !== "accepted") {
    res.status(404).json({ error: "Friendship not found" });
    return;
  }
  await db.delete(friendshipsTable).where(eq(friendshipsTable.id, existing.id));
  res.status(204).end();
});

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

    const [summaries, attempts] = await Promise.all([
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
    ]);

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
      const xp = computeProgressMetrics(byUser.get(id) ?? []).xp;
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
