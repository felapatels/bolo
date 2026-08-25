import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  usernameReportsTable,
  USERNAME_REPORT_REASONS,
} from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Username reports. Shaped on phrase reports deliberately, because the two
// problems are the same problem: a learner has seen something wrong and the
// app needs to hear about it without turning the learner into a moderator.
//
// WHY THIS EXISTS AT ALL. Usernames became visible to strangers on 2026-08-25.
// The write-time profanity screen in lib/usernamePolicy.ts catches the obvious
// and nothing else: it cannot read intent, it does not know every language's
// slang, and it will never catch a name that is only offensive in context or
// only offensive to the person being impersonated. Bolo teaches children. The
// screen and this route are two halves of one thing and neither is sufficient
// alone.
//
// Rolling-hour cap counted across ALL of a reporter's reports. At or over it,
// the response is a SILENT success with no row written: the reporter is not an
// adversary worth signalling to, and the client treats every outcome the same.
const REPORT_MAX_PER_WINDOW = 20;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

const reportBodySchema = z.object({
  reason: z.enum(USERNAME_REPORT_REASONS),
  /** Optional free text, never required. Capped server-side regardless of the client. */
  note: z.string().trim().max(280).optional(),
});

// POST /users/:id/report-username — flag another learner's public name.
//
// NOTHING HERE HIDES A NAME. A report is an inbox, not an enforcement action:
// auto-hiding on a report count is a griefing tool with extra steps, and one
// report from one account should never be able to take a name off a board.
// Removal is a human decision made against the queue.
router.post(
  "/users/:id/report-username",
  async (req: Request, res: Response): Promise<void> => {
    const reporterId = (req as AuthedRequest).userId;
    const reportedUserId = String(req.params.id ?? "");
    if (!reportedUserId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (reportedUserId === reporterId) {
      // Not an error worth a code: reporting yourself is a misclick, and the
      // useful response is to do nothing quietly.
      res.json({ success: true });
      return;
    }

    const parsed = reportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid report" });
      return;
    }

    // The reported account must actually have a public name. Reporting someone
    // who has none is reporting something nobody can see.
    const [target] = await db
      .select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(and(eq(usersTable.id, reportedUserId), isNotNull(usersTable.username)))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No such learner" });
      return;
    }

    const note = parsed.data.note;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`username_report:${reporterId}`}))`,
      );
      const windowStart = new Date(Date.now() - REPORT_WINDOW_MS);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(usernameReportsTable)
        .where(
          and(
            eq(usernameReportsTable.reporterId, reporterId),
            gte(usernameReportsTable.createdAt, windowStart),
          ),
        );
      if (count >= REPORT_MAX_PER_WINDOW) {
        return; // silent drop, identical response either way
      }
      await tx.insert(usernameReportsTable).values({
        reporterId,
        reportedUserId,
        // COPIED, NOT JOINED. The point of a report is the string that was on
        // screen when it was made; reading it back through the user row later
        // would show whatever they have renamed themselves to since, which is
        // exactly the evidence a reviewer does not want.
        reportedUsername: target.username!,
        reason: parsed.data.reason,
        note: note && note.length > 0 ? note : null,
      });
    });

    res.json({ success: true });
  },
);

export default router;
