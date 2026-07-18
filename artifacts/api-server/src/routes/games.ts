import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, scriptTraceProgressTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { denyLockedFeature } from "../lib/gating";

const router: IRouter = Router();

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

const VALID_CHAPTERS = [
  "gujarati-vowels",
  "gujarati-consonants",
  "hindi-vowels",
  "hindi-consonants",
] as const;
type Chapter = (typeof VALID_CHAPTERS)[number];

const progressBodySchema = z.object({
  chapter: z.enum(VALID_CHAPTERS),
  characterId: z.string().min(1).max(30),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
});

// GET /games/script-trace/progress?chapter=<chapter>
// Returns the caller's per-character progress for the requested chapter.
// Plus-only — non-Plus callers get a 402.
router.get(
  "/games/script-trace/progress",
  async (req: Request, res: Response): Promise<void> => {
    if (
      denyLockedFeature(
        req,
        res,
        "scriptTrace",
        "Script Trace is a Bolo! Plus feature. Upgrade to unlock character tracing.",
      )
    )
      return;

    const chapter = String(req.query.chapter ?? "");
    if (!VALID_CHAPTERS.includes(chapter as Chapter)) {
      res.status(400).json({ error: "Invalid or missing chapter" });
      return;
    }

    const userId = getUserId(req);
    const rows = await db
      .select()
      .from(scriptTraceProgressTable)
      .where(
        and(
          eq(scriptTraceProgressTable.userId, userId),
          eq(scriptTraceProgressTable.chapter, chapter),
        ),
      );

    res.json(
      rows.map((r) => ({
        characterId: r.characterId,
        passed: r.passed,
        bestScore: r.bestScore,
        attemptCount: r.attemptCount,
        updatedAt: r.updatedAt,
      })),
    );
  },
);

// POST /games/script-trace/progress
// Records a tracing attempt result. Upserts so the best score is always kept
// and the `passed` flag is sticky (never reverted to false once true).
// Plus-only — non-Plus callers get a 402.
router.post(
  "/games/script-trace/progress",
  async (req: Request, res: Response): Promise<void> => {
    if (
      denyLockedFeature(
        req,
        res,
        "scriptTrace",
        "Script Trace is a Bolo! Plus feature. Upgrade to unlock character tracing.",
      )
    )
      return;

    const parsed = progressBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError =
        parsed.error.errors[0]?.message ?? "Invalid request";
      res.status(400).json({ error: firstError });
      return;
    }

    const { chapter, characterId, passed, score } = parsed.data;
    const userId = getUserId(req);

    // Upsert: on conflict keep the best score and stick the passed flag to true
    // once earned. attempt_count is incremented each time.
    const [row] = await db
      .insert(scriptTraceProgressTable)
      .values({
        userId,
        chapter,
        characterId,
        passed,
        bestScore: score,
        attemptCount: 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          scriptTraceProgressTable.userId,
          scriptTraceProgressTable.chapter,
          scriptTraceProgressTable.characterId,
        ],
        set: {
          // Sticky true: once passed it never reverts.
          passed: sql`GREATEST(${scriptTraceProgressTable.passed}::int, ${passed ? 1 : 0}::int)::boolean`,
          // Keep the best score seen across all traces.
          bestScore: sql`GREATEST(COALESCE(${scriptTraceProgressTable.bestScore}, 0), ${score})`,
          attemptCount: sql`${scriptTraceProgressTable.attemptCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.status(201).json({
      characterId: row.characterId,
      passed: row.passed,
      bestScore: row.bestScore,
      attemptCount: row.attemptCount,
      updatedAt: row.updatedAt,
    });
  },
);

export default router;
