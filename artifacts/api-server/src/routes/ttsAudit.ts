/**
 * Cached phrase-audio audit endpoint (operator-triggered, not a user route).
 *
 * The audit has to run where the cache lives: a deployment's tts_cache holds
 * different takes from the development one, so the clips learners actually
 * hear can only be swept from inside that deployment. This endpoint is the
 * handle for that — a driver calls it repeatedly with a cursor until the
 * catalog is exhausted.
 *
 * Authorization follows the existing cron/internal convention (see the
 * daily-quiz generator): a shared secret in a header, checked before anything
 * expensive happens, failing closed when the secret is not configured. It is
 * mounted in the public section because an operator driving it has no user
 * session — the secret is the entire authorization story, so it must never be
 * omitted or defaulted.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { auditPhraseAudioBatch, DEFAULT_BATCH_SIZE } from "../lib/ttsCacheAudit";

const router: IRouter = Router();

/**
 * One sweep at a time, per database. Each batch spends transcription and
 * synthesis calls, and two sweeps walking the same phrases would both race on
 * the same cache rows and double the bill. A session-level advisory lock makes
 * a second caller bounce (409) instead of piling on.
 */
const AUDIT_LOCK_KEY = 0x74747361; // "ttsa"

/**
 * Constant-time secret comparison, mirroring the RevenueCat webhook guard.
 * Length is compared first because timingSafeEqual throws on a mismatch.
 */
function secretMatches(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /tts-audit/batch
 *
 * Body: { afterPhraseId?, limit?, languageCodes?, dryRun?, maxWrites? }
 * Header: X-Audit-Secret must match TTS_AUDIT_SECRET (or SESSION_SECRET).
 *
 * Audits one batch and returns counts, the findings, and the cursor to pass
 * back as `afterPhraseId`. A null `nextPhraseId` means the catalog is done.
 */
router.post("/tts-audit/batch", async (req: Request, res: Response): Promise<void> => {
  const expectedSecret = process.env.TTS_AUDIT_SECRET ?? process.env.SESSION_SECRET;
  if (!expectedSecret || !secretMatches(req.headers["x-audit-secret"], expectedSecret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as {
    afterPhraseId?: unknown;
    limit?: unknown;
    languageCodes?: unknown;
    dryRun?: unknown;
    maxWrites?: unknown;
  };

  const afterPhraseId = Number(body.afterPhraseId ?? 0);
  if (!Number.isInteger(afterPhraseId) || afterPhraseId < 0) {
    res.status(400).json({ error: "afterPhraseId must be a non-negative integer" });
    return;
  }

  const limitRaw = body.limit == null ? DEFAULT_BATCH_SIZE : Number(body.limit);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    res.status(400).json({ error: "limit must be an integer between 1 and 200" });
    return;
  }

  let languageCodes: string[] | undefined;
  if (body.languageCodes != null) {
    if (
      !Array.isArray(body.languageCodes) ||
      body.languageCodes.some((c) => typeof c !== "string" || !c.trim())
    ) {
      res.status(400).json({ error: "languageCodes must be an array of language codes" });
      return;
    }
    languageCodes = (body.languageCodes as string[]).map((c) => c.trim());
  }

  // The cap is the operator's brake on an unattended repair pass; a malformed
  // value must not silently become "no limit".
  let maxWrites: number | undefined;
  if (body.maxWrites != null) {
    maxWrites = Number(body.maxWrites);
    if (!Number.isInteger(maxWrites) || maxWrites < 0 || maxWrites > 500) {
      res.status(400).json({ error: "maxWrites must be an integer between 0 and 500" });
      return;
    }
  }

  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [AUDIT_LOCK_KEY],
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) {
      res.status(409).json({ error: "An audit batch is already running" });
      return;
    }

    const result = await auditPhraseAudioBatch({
      afterPhraseId,
      limit: limitRaw,
      languageCodes,
      dryRun: body.dryRun === true,
      ...(maxWrites == null ? {} : { maxWrites }),
      log: req.log,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "TTS cache audit batch failed");
    res.status(500).json({ error: "Audit failed" });
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [AUDIT_LOCK_KEY])
        .catch((err) => req.log.warn({ err }, "TTS audit lock release failed"));
    }
    client.release();
  }
});

export default router;
