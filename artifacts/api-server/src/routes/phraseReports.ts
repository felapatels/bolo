import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  phrasesTable,
  phraseReportsTable,
  PHRASE_REPORT_REASONS,
} from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Spec B2: phrase reports. Max stored reports per user per rolling hour, // DB-backed like the test-out throttle (counted from the phrase_reports rows
// themselves, so it holds across restarts and replicas). Unlike test-out, the
// over-limit branch is a SILENT 200 with no row written: the reporter is not
// an adversary worth signaling, and the client treats every outcome
// identically (fire-and-forget).
const REPORT_MAX_PER_WINDOW = 20;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

const reportBodySchema = z.object({
  reason: z.enum(PHRASE_REPORT_REASONS),
  // Optional free-text note, never required. 280 chars max, enforced
  // server-side regardless of client validation.
  note: z.string().trim().max(280).optional(),
});

// POST /phrases/:id/report, flag a phrase as incorrect. Authenticated
// (mounted behind requireAuth). language_code and stage are derived from the
// phrase row server-side, the client sends only reason + optional note.
// Duplicate reports (same user, same phrase) are allowed; dedup is a
// review-time concern. Success and over-limit both return { success: true }.
router.post(
  "/phrases/:id/report",
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).userId;

    const phraseId = Number(req.params.id);
    if (!Number.isInteger(phraseId) || phraseId <= 0) {
      res.status(400).json({ error: "Invalid phrase id" });
      return;
    }

    const parsed = reportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid report" });
      return;
    }

    const [phrase] = await db
      .select({
        languageCode: phrasesTable.languageCode,
        stage: phrasesTable.stage,
      })
      .from(phrasesTable)
      .where(eq(phrasesTable.id, phraseId))
      .limit(1);
    if (!phrase) {
      res.status(404).json({ error: "Phrase not found" });
      return;
    }

    // Rolling-hour cap, counted across ALL of the user's reports (not per
    // phrase). At or over the cap: acknowledge and store nothing. The
    // count+insert is serialized per user via an advisory xact lock (same
    // pattern as the teaser consumption gate) so concurrent requests cannot
    // all observe count < cap and overshoot, the cap is a hard guarantee.
    const note = parsed.data.note;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`phrase_report:${userId}`}))`,
      );
      const windowStart = new Date(Date.now() - REPORT_WINDOW_MS);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(phraseReportsTable)
        .where(
          and(
            eq(phraseReportsTable.userId, userId),
            gte(phraseReportsTable.createdAt, windowStart),
          ),
        );
      if (count >= REPORT_MAX_PER_WINDOW) {
        return; // silent drop, response is identical either way
      }
      await tx.insert(phraseReportsTable).values({
        userId,
        phraseId,
        reason: parsed.data.reason,
        note: note && note.length > 0 ? note : null,
        languageCode: phrase.languageCode,
        stage: phrase.stage,
      });
    });

    res.json({ success: true });
  },
);

export default router;
