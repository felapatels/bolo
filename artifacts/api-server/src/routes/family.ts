// Family plan management: the owner's seat/invite surface and the member join
// flow. Billing itself stays on Stripe (checkout + webhook); these routes only
// manage the group, who owns it, the join code, and who occupies the seats.
//
// Capacity invariant: a family covers 4 people, the owner plus at most 3 seat
// rows (pending invites count against capacity so an invite can never be
// stranded without a seat). Enforced inside a transaction with a row lock on
// the plan so two simultaneous joins can't oversubscribe.
//
// Built as a factory (like createAccountRouter) so tests can inject a fake
// Stripe canceller and a fake email sender, the real Stripe key is LIVE.

import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  familyPlansTable,
  familySeatsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { resolvePlan } from "../lib/entitlements";
import { generateJoinCode, generateInviteToken } from "../lib/familyAccess";
import { sendFamilyInviteEmail } from "../lib/familyInviteEmail";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";

// The number of people one family subscription covers, owner included.
export const FAMILY_CAPACITY = 4;
const MAX_SEATS = FAMILY_CAPACITY - 1;

export interface FamilyRouterDeps {
  // Cancels a member's individual Stripe subscription with proration credit
  // when they accept a family invite. Injectable so tests never hit Stripe.
  cancelStripeSubscription: (subscriptionId: string) => Promise<void>;
  sendInviteEmail: typeof sendFamilyInviteEmail;
}

const defaultDeps: FamilyRouterDeps = {
  cancelStripeSubscription: async (subscriptionId) => {
    const stripe = await getUncachableStripeClient();
    // invoice_now + prorate credits the unused remainder of their period.
    await stripe.subscriptions.cancel(subscriptionId, {
      invoice_now: true,
      prorate: true,
    });
  },
  sendInviteEmail: sendFamilyInviteEmail,
};

// Mirrors returnUrl in routes/stripe.ts: same-origin only, client-sent base
// path validated down to a plain path segment.
function joinUrl(req: Request, rawBasePath: unknown, token: string): string {
  const domains = [
    ...new Set(
      [
        ...(process.env.REPLIT_DOMAINS ?? "").split(","),
        process.env.REPLIT_DEV_DOMAIN ?? "",
      ]
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const requestHost = (() => {
    for (const header of [req.headers.origin, req.headers.referer]) {
      if (typeof header !== "string") continue;
      try {
        return new URL(header).hostname;
      } catch {
        /* ignore malformed */
      }
    }
    return undefined;
  })();
  const domain =
    (requestHost && domains.find((d) => d === requestHost)) || domains[0] || "";
  let base = typeof rawBasePath === "string" ? rawBasePath.trim() : "/";
  if (!/^\/[A-Za-z0-9._~\/-]*$/.test(base)) base = "/";
  if (!base.endsWith("/")) base += "/";
  return `https://${domain}${base}family/join?invite=${encodeURIComponent(token)}`;
}

// Whether an owner row currently grants the family Plus access (mirrors the
// entitlement cascade in familyAccess.ts).
function ownerGrantsPlus(owner: typeof usersTable.$inferSelect): boolean {
  if (owner.tier !== "family") return false;
  return resolvePlan(owner).plan === "plus";
}

async function loadUser(id: string) {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
}

// Never falls back to the address: this name is shown to other people (the
// member's plan view, and the invite email's "from" line).
function displayName(u: { displayName: string | null } | undefined | null): string {
  return u?.displayName || "Fellow learner";
}

export function createFamilyRouter(
  deps: FamilyRouterDeps = defaultDeps,
): IRouter {
  const router: IRouter = Router();

  // GET /family, the caller's family status: owner (full management view),
  // member (who's plan they're on), or none.
  router.get("/family", async (req: Request, res: Response): Promise<void> => {
    const { userId } = req as AuthedRequest;

    const plan = await db.query.familyPlansTable.findFirst({
      where: eq(familyPlansTable.ownerUserId, userId),
    });
    if (plan) {
      const owner = await loadUser(userId);
      const seats = await db
        .select({
          id: familySeatsTable.id,
          status: familySeatsTable.status,
          invitedEmail: familySeatsTable.invitedEmail,
          memberUserId: familySeatsTable.memberUserId,
          joinedAt: familySeatsTable.joinedAt,
          memberDisplayName: usersTable.displayName,
          memberEmail: usersTable.email,
        })
        .from(familySeatsTable)
        .leftJoin(usersTable, eq(familySeatsTable.memberUserId, usersTable.id))
        .where(eq(familySeatsTable.planId, plan.id));
      res.json({
        role: "owner",
        active: owner ? ownerGrantsPlus(owner) : false,
        joinCode: plan.joinCode,
        capacity: FAMILY_CAPACITY,
        seats: seats.map((s) => ({
          id: s.id,
          status: s.status,
          email: s.invitedEmail ?? s.memberEmail ?? null,
          memberUserId: s.memberUserId,
          displayName: s.memberUserId
            ? s.memberDisplayName || "Member"
            : null,
          joinedAt: s.joinedAt ? s.joinedAt.toISOString() : null,
        })),
      });
      return;
    }

    const seatRows = await db
      .select({ seat: familySeatsTable, plan: familyPlansTable, owner: usersTable })
      .from(familySeatsTable)
      .innerJoin(familyPlansTable, eq(familySeatsTable.planId, familyPlansTable.id))
      .innerJoin(usersTable, eq(familyPlansTable.ownerUserId, usersTable.id))
      .where(
        and(
          eq(familySeatsTable.memberUserId, userId),
          eq(familySeatsTable.status, "active"),
        ),
      )
      .limit(1);
    const row = seatRows[0];
    if (row) {
      res.json({
        role: "member",
        active: ownerGrantsPlus(row.owner),
        ownerName: displayName(row.owner),
        joinedAt: row.seat.joinedAt ? row.seat.joinedAt.toISOString() : null,
      });
      return;
    }

    res.json({ role: "none" });
  });

  // Loads the caller's plan or 404s, every management route below is
  // owner-only.
  async function requireOwnedPlan(req: Request, res: Response) {
    const { userId } = req as AuthedRequest;
    const plan = await db.query.familyPlansTable.findFirst({
      where: eq(familyPlansTable.ownerUserId, userId),
    });
    if (!plan) {
      res.status(404).json({ error: "You don't have a family plan." });
      return null;
    }
    return plan;
  }

  // POST /family/invites { email, basePath? }, invite someone by email.
  // Consumes a seat (pending) so the invite can never oversubscribe the plan.
  router.post(
    "/family/invites",
    async (req: Request, res: Response): Promise<void> => {
      const { userId } = req as AuthedRequest;
      const plan = await requireOwnedPlan(req, res);
      if (!plan) return;

      const rawEmail = req.body?.email;
      const email =
        typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Enter a valid email address." });
        return;
      }

      const owner = await loadUser(userId);
      if ((owner?.email ?? "").toLowerCase() === email) {
        res.status(409).json({
          error: "That's your own email, you already have the owner's seat.",
        });
        return;
      }

      const token = generateInviteToken();
      const outcome = await db.transaction(async (tx) => {
        // Lock the plan row so concurrent invites/joins serialize on capacity.
        await tx.execute(
          sql`SELECT id FROM family_plans WHERE id = ${plan.id} FOR UPDATE`,
        );
        const seats = await tx
          .select({
            invitedEmail: familySeatsTable.invitedEmail,
            memberUserId: familySeatsTable.memberUserId,
            memberEmail: usersTable.email,
          })
          .from(familySeatsTable)
          .leftJoin(usersTable, eq(familySeatsTable.memberUserId, usersTable.id))
          .where(eq(familySeatsTable.planId, plan.id));

        const alreadyThere = seats.some(
          (s) =>
            (s.invitedEmail ?? "").toLowerCase() === email ||
            (s.memberEmail ?? "").toLowerCase() === email,
        );
        // A duplicate must NOT consume a seat.
        if (alreadyThere) return "duplicate" as const;
        if (seats.length >= MAX_SEATS) return "full" as const;

        const [seat] = await tx
          .insert(familySeatsTable)
          .values({
            planId: plan.id,
            status: "pending",
            invitedEmail: email,
            inviteToken: token,
          })
          .returning();
        return seat;
      });

      if (outcome === "duplicate") {
        res.status(409).json({
          error: "That person already has a seat or a pending invite.",
        });
        return;
      }
      if (outcome === "full") {
        res.status(409).json({
          error:
            "Your family plan is full, all 4 seats are taken (including pending invites).",
        });
        return;
      }

      // Send the email after the seat is committed; a failed send keeps the
      // pending seat (owner can revoke and retry) but is surfaced.
      try {
        await deps.sendInviteEmail({
          inviterName: displayName(owner),
          toEmail: email,
          joinUrl: joinUrl(req, req.body?.basePath, token),
        });
      } catch (err) {
        logger.error({ err }, "Failed to send family invite email");
        res.status(502).json({
          error:
            "The seat was reserved but the invite email couldn't be sent. Revoke the invite and try again, or share your join code instead.",
        });
        return;
      }

      res.status(201).json({
        id: outcome.id,
        status: outcome.status,
        email,
      });
    },
  );

  // DELETE /family/invites/:seatId, revoke a pending invite, freeing its seat
  // and invalidating the emailed link.
  router.delete(
    "/family/invites/:seatId",
    async (req: Request, res: Response): Promise<void> => {
      const plan = await requireOwnedPlan(req, res);
      if (!plan) return;
      const seatId = Number(req.params.seatId);
      if (!Number.isInteger(seatId)) {
        res.status(400).json({ error: "Invalid invite id." });
        return;
      }
      const deleted = await db
        .delete(familySeatsTable)
        .where(
          and(
            eq(familySeatsTable.id, seatId),
            eq(familySeatsTable.planId, plan.id),
            eq(familySeatsTable.status, "pending"),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "No pending invite with that id." });
        return;
      }
      res.json({ ok: true });
    },
  );

  // DELETE /family/members/:memberUserId, remove a member. Their seat frees
  // immediately and they drop to Free on their next request; none of their
  // learning data is touched.
  router.delete(
    "/family/members/:memberUserId",
    async (req: Request, res: Response): Promise<void> => {
      const plan = await requireOwnedPlan(req, res);
      if (!plan) return;
      const memberUserId = String(req.params.memberUserId);
      const deleted = await db
        .delete(familySeatsTable)
        .where(
          and(
            eq(familySeatsTable.planId, plan.id),
            eq(familySeatsTable.memberUserId, memberUserId),
            eq(familySeatsTable.status, "active"),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "That person isn't on your family plan." });
        return;
      }
      res.json({ ok: true });
    },
  );

  // POST /family/leave, a member gives up their own seat voluntarily.
  router.post(
    "/family/leave",
    async (req: Request, res: Response): Promise<void> => {
      const { userId } = req as AuthedRequest;
      const deleted = await db
        .delete(familySeatsTable)
        .where(
          and(
            eq(familySeatsTable.memberUserId, userId),
            eq(familySeatsTable.status, "active"),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "You're not on a family plan." });
        return;
      }
      res.json({ ok: true });
    },
  );

  // POST /family/code/regenerate, replace the join code; the old one stops
  // working immediately.
  router.post(
    "/family/code/regenerate",
    async (req: Request, res: Response): Promise<void> => {
      const plan = await requireOwnedPlan(req, res);
      if (!plan) return;
      const [updated] = await db
        .update(familyPlansTable)
        .set({ joinCode: generateJoinCode() })
        .where(eq(familyPlansTable.id, plan.id))
        .returning();
      res.json({ joinCode: updated.joinCode });
    },
  );

  // POST /family/join { code? , inviteToken? }, claim a seat, either via the
  // shareable join code (occupies a fresh seat) or an emailed invite link
  // (claims that reserved pending seat). If the joiner has their own active
  // Stripe subscription it is canceled with proration credit, one family,
  // one subscription.
  router.post(
    "/family/join",
    async (req: Request, res: Response): Promise<void> => {
      const { userId } = req as AuthedRequest;
      const code =
        typeof req.body?.code === "string"
          ? req.body.code.trim().toUpperCase()
          : null;
      const inviteToken =
        typeof req.body?.inviteToken === "string"
          ? req.body.inviteToken.trim()
          : null;
      if (!code && !inviteToken) {
        res.status(400).json({ error: "Provide a join code or invite link." });
        return;
      }

      // Resolve the target plan outside the transaction (cheap lookups).
      let plan = null;
      let invitedSeatId: number | null = null;
      if (inviteToken) {
        const seat = await db.query.familySeatsTable.findFirst({
          where: eq(familySeatsTable.inviteToken, inviteToken),
        });
        if (!seat || seat.status !== "pending") {
          res.status(404).json({
            error:
              "This invite link is no longer valid, ask for a new invite or use the join code.",
          });
          return;
        }
        invitedSeatId = seat.id;
        plan =
          (await db.query.familyPlansTable.findFirst({
            where: eq(familyPlansTable.id, seat.planId),
          })) ?? null;
      } else if (code) {
        plan =
          (await db.query.familyPlansTable.findFirst({
            where: eq(familyPlansTable.joinCode, code),
          })) ?? null;
      }
      if (!plan) {
        res.status(404).json({ error: "That join code isn't valid." });
        return;
      }
      if (plan.ownerUserId === userId) {
        res.status(409).json({ error: "You own this family plan, you already have full access." });
        return;
      }

      const user = await loadUser(userId);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      // Someone who owns their own family plan can't also take a seat.
      const ownPlan = await db.query.familyPlansTable.findFirst({
        where: eq(familyPlansTable.ownerUserId, userId),
      });
      if (ownPlan) {
        res.status(409).json({
          error: "You own your own family plan and can't join another.",
        });
        return;
      }

      const existingSeat = await db.query.familySeatsTable.findFirst({
        where: and(
          eq(familySeatsTable.memberUserId, userId),
          eq(familySeatsTable.status, "active"),
        ),
      });
      if (existingSeat) {
        res.status(409).json({ error: "You're already on a family plan." });
        return;
      }

      // Whether the joiner pays for their own Plus via Stripe. If so it gets
      // canceled with proration credit as part of the join, one plan, one
      // bill. The cancel runs INSIDE the seat-claim transaction, after the
      // plan row is locked and the seat is confirmed available, so:
      //  - a full plan / dead invite never cancels anything, and
      //  - a Stripe failure rolls back the whole join (no seat, no downgrade).
      const ownResolved = resolvePlan(user);
      const mustCancelOwnStripe =
        ownResolved.plan !== "free" &&
        user.subscriptionProvider === "stripe" &&
        user.subscriptionProviderId != null &&
        user.subscriptionStatus !== "expired";
      let previousSubscriptionCanceled = false;

      class StripeCancelFailed extends Error {}

      let outcome: "joined" | "gone" | "full";
      try {
        outcome = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM family_plans WHERE id = ${plan.id} FOR UPDATE`,
          );

          // Confirm the seat is still claimable while holding the lock, before touching Stripe.
          if (invitedSeatId != null) {
            const [claimed] = await tx
              .update(familySeatsTable)
              .set({
                status: "active",
                memberUserId: userId,
                inviteToken: null,
                joinedAt: new Date(),
              })
              .where(
                and(
                  eq(familySeatsTable.id, invitedSeatId),
                  eq(familySeatsTable.status, "pending"),
                ),
              )
              .returning();
            if (!claimed) return "gone" as const;
          } else {
            const seats = await tx
              .select({ id: familySeatsTable.id })
              .from(familySeatsTable)
              .where(eq(familySeatsTable.planId, plan.id));
            if (seats.length >= MAX_SEATS) return "full" as const;
            await tx.insert(familySeatsTable).values({
              planId: plan.id,
              status: "active",
              memberUserId: userId,
              joinedAt: new Date(),
            });
          }

          if (mustCancelOwnStripe) {
            try {
              await deps.cancelStripeSubscription(user.subscriptionProviderId!);
            } catch (err) {
              logger.error(
                { err },
                "Failed to cancel member's Plus during family join",
              );
              throw new StripeCancelFailed();
            }
            // Reflect it locally right away (the deletion webhook confirms).
            await tx
              .update(usersTable)
              .set({
                tier: "free",
                subscriptionStatus: "canceled",
                trialEndsAt: null,
                currentPeriodEnd: null,
              })
              .where(eq(usersTable.id, userId));
            previousSubscriptionCanceled = true;
          }

          return "joined" as const;
        });
      } catch (err) {
        if (err instanceof StripeCancelFailed) {
          res.status(502).json({
            error:
              "We couldn't close out your existing subscription. Nothing was changed, please try again.",
          });
          return;
        }
        throw err;
      }

      if (outcome === "full") {
        res.status(409).json({
          error: "This family plan is full, all 4 seats are taken.",
        });
        return;
      }
      if (outcome === "gone") {
        res.status(409).json({
          error: "This invite was already used or revoked.",
        });
        return;
      }

      const owner = await loadUser(plan.ownerUserId);
      res.json({
        ok: true,
        ownerName: displayName(owner),
        previousSubscriptionCanceled,
        // Whether the seat grants Plus right now (owner's subscription live).
        active: owner ? ownerGrantsPlus(owner) : false,
      });
    },
  );

  return router;
}

export default createFamilyRouter();
