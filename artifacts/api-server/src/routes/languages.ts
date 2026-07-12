import { Router, type IRouter, type Request, type Response } from "express";
import { db, languagesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

// GET /languages — public reference data: the supported learning languages,
// used by the client language picker (no auth or user scoping needed).
router.get("/languages", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(languagesTable)
    .orderBy(asc(languagesTable.sortOrder));
  res.json(rows);
});

export default router;
