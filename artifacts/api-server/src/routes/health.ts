import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  deepHealthAuthorised,
  summarise,
  statusFor,
  type DeepCheck,
} from "../lib/deepHealth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * The tables this app cannot run without, plus the one that has actually gone
 * missing. Existence probes, not aggregates: this runs every minute forever.
 *
 * ORDERED CHEAPEST FIRST so a dead pool fails on `select 1` rather than after
 * four table probes have each waited for a connection.
 */
const DEEP_CHECKS: { name: string; run: () => Promise<unknown> }[] = [
  { name: "db", run: () => db.execute(sql`select 1`) },
  { name: "users", run: () => db.execute(sql`select 1 from users limit 1`) },
  { name: "attempts", run: () => db.execute(sql`select 1 from attempts limit 1`) },
  { name: "phrases", run: () => db.execute(sql`select 1 from phrases limit 1`) },
  // THE ONE NOTHING ELSE WOULD NOTICE. blockedUserIdsFor fails open since the
  // 2026-08-26 outage, so a missing user_blocks no longer breaks the feed: it
  // silently stops blocking working while every surface stays green.
  { name: "user_blocks", run: () => db.execute(sql`select 1 from user_blocks limit 1`) },
];

/**
 * GET /api/healthz/deep
 *
 * For an EXTERNAL monitor. See lib/deepHealth for why /healthz cannot answer
 * this and why an alerter inside the process never could.
 */
router.get("/healthz/deep", async (req: Request, res: Response): Promise<void> => {
  if (!deepHealthAuthorised(req.headers["x-cron-secret"])) {
    // 401 and not 503: a misconfigured secret must not look like an outage, or
    // the first page at 3am sends somebody hunting a fault that is not there.
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const results: DeepCheck[] = await Promise.all(
    DEEP_CHECKS.map(async (check) => {
      try {
        await check.run();
        return { name: check.name, ok: true };
      } catch {
        // The error is NOT returned. Whatever polls this is outside the trust
        // boundary, and a Postgres error carries schema detail.
        return { name: check.name, ok: false };
      }
    }),
  );

  const health = summarise(results, new Date());
  if (!health.ok) {
    req.log.error({ failing: health.failing }, "deep health check failed");
  }
  res.status(statusFor(health)).json(health);
});

export default router;
