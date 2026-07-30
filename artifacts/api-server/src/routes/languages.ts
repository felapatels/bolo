import { Router, type IRouter, type Request, type Response } from "express";
import { db, languagesTable } from "@workspace/db";
import { c1RolloutLanguageCodes } from "@workspace/db/seed-data";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

// Languages whose sentence content is primarily batch-generated (the C1
// rollout set). Derived from the committed rollout data — never a hardcoded
// list — so clients can show a "community review is ongoing" note without
// shipping their own copy of the set.
const generatedContentLanguages = new Set(c1RolloutLanguageCodes());

// GET /languages — public reference data: the supported learning languages,
// used by the client language picker (no auth or user scoping needed).
router.get("/languages", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(languagesTable)
    .orderBy(asc(languagesTable.sortOrder));
  res.json(
    rows.map((row) => ({
      ...row,
      // Optional (mobile back-compat): true when this language's content is
      // AI-assisted with community review ongoing.
      communityReviewed: generatedContentLanguages.has(row.code),
    })),
  );
});

export default router;
