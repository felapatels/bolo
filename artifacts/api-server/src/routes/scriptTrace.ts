import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  db,
  scriptTraceContributionsTable,
  voiceContributionsTable,
  passageFeedbackTable,
} from "@workspace/db";
import { parseTracePayload, TracePayloadError } from "@workspace/script-trace";
import { createRateLimit } from "../middlewares/rateLimit";

// Submissions from the public contribution page at /aksharmala.html.
//
// PUBLIC AND UNAUTHENTICATED, deliberately, and mounted before the barrel-wide
// requireAuth for the same reason contact.ts is: the people this exists for are
// relatives who write the script and have never opened the app. An account
// requirement would cost more contributions than it could protect.
//
// What that costs, stated plainly rather than discovered later. This is an open
// write endpoint on the production API. Four things keep it boring:
//
//   1. parseTracePayload is the gate on traces. It is the same parser that
//      reads them back, so anything unreadable is a 400 before the database.
//   2. Hard caps on size, glyph count, and audio length.
//   3. A rate limit, per IP, sized for autosave rather than for one submission.
//   4. There is no public READ. Nothing here is served back out, so the worst
//      case is rows nobody asked for, not a leak.
//
// EVERYTHING UPSERTS ON A SESSION ID. The page saves after every single letter,
// because a contributor can stop at any point and the alternative loses the
// whole sitting. Each save carries the full set so far and replaces the row, so
// somebody who traced nine letters and put the phone down has nine letters
// stored rather than none.

const router: IRouter = Router();

/**
 * Caps, from the real shape of the data rather than round numbers.
 *
 * The largest alphabet in the roster is Nastaliq at 62 letters, and a letter is
 * a handful of strokes of a handful of points after simplification, so a whole
 * set lands in the low tens of kilobytes. Audio is a passage of a few sentences:
 * tens of kilobytes as opus, a few hundred as the mp4/aac Safari produces. Both
 * caps are several times the worst legitimate submission and still far too small
 * to be worth anyone's while as somewhere to put data.
 */
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_GLYPHS = 200;
const MAX_AUDIO_BASE64_BYTES = 4 * 1024 * 1024;

/** Browser-generated, identifies one sitting and nothing else. */
const sessionIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid session id");

// Generous, because this is an AUTOSAVE endpoint: a contributor tracing 62
// Nastaliq letters legitimately saves 62 times. The cap is here to stop a loop,
// not to ration contributions.
const autosaveRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 400,
  message: "That is a lot of saving. Please try again in a little while.",
});

const traceBodySchema = z.object({
  sessionId: sessionIdSchema,
  payload: z
    .string()
    .min(1, "Nothing was submitted")
    .max(MAX_PAYLOAD_BYTES, "That submission is too large"),
});

router.post(
  "/script-trace/contributions",
  autosaveRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const body = traceBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
      return;
    }

    // Validated by the SAME parser that reads it back. A submission that cannot
    // be parsed is refused here rather than stored and discovered to be
    // unreadable when somebody finally tries to use it.
    let parsed;
    try {
      parsed = parseTracePayload(body.data.payload);
    } catch (err) {
      if (err instanceof TracePayloadError) {
        req.log?.info({ err }, "Rejected a malformed script-trace submission");
        res.status(400).json({ error: "That does not look like a set of traced letters." });
        return;
      }
      throw err;
    }

    if (parsed.glyphs.length > MAX_GLYPHS) {
      res.status(400).json({ error: "That submission covers too many letters." });
      return;
    }

    await db
      .insert(scriptTraceContributionsTable)
      .values({
        sessionId: body.data.sessionId,
        script: parsed.script,
        contributor: parsed.contributor,
        isPractice: parsed.isPractice,
        glyphCount: parsed.glyphs.length,
        payload: body.data.payload,
      })
      .onConflictDoUpdate({
        target: scriptTraceContributionsTable.sessionId,
        set: {
          script: parsed.script,
          contributor: parsed.contributor,
          isPractice: parsed.isPractice,
          glyphCount: parsed.glyphs.length,
          payload: body.data.payload,
          updatedAt: sql`now()`,
        },
      });

    res.status(200).json({ stored: parsed.glyphs.length, script: parsed.script });
  },
);

const voiceBodySchema = z.object({
  sessionId: sessionIdSchema,
  script: z.string().min(1).max(64),
  contributor: z.string().min(1).max(32),
  isPractice: z.boolean().optional().default(false),
  promptId: z.string().min(1).max(64),
  promptText: z.string().min(1).max(4000),
  promptLabel: z.string().max(4000).optional().default(""),
  // Base64 without the data: prefix. Following tts_cache, which stores its
  // audio the same way; these are seconds long, so object storage would be a
  // second system to run for no gain at this size.
  audioBase64: z
    .string()
    .min(1, "No audio was recorded")
    .max(MAX_AUDIO_BASE64_BYTES, "That recording is too long"),
  // Whatever the browser produced. Chrome and Android give webm/opus, Safari
  // and iOS give mp4/aac, and guessing wrong makes a file that will not play.
  mimeType: z.string().min(1).max(128),
  durationMs: z.number().int().positive().max(15 * 60 * 1000).optional(),
});

router.post(
  "/script-trace/voice",
  autosaveRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const body = voiceBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const v = body.data;

    if (!/^audio\//.test(v.mimeType)) {
      res.status(400).json({ error: "That is not an audio recording." });
      return;
    }

    await db
      .insert(voiceContributionsTable)
      .values({
        sessionId: v.sessionId,
        script: v.script,
        contributor: v.contributor,
        promptId: v.promptId,
        promptText: v.promptText,
        promptLabel: v.promptLabel,
        audioBase64: v.audioBase64,
        mimeType: v.mimeType,
        durationMs: v.durationMs ?? null,
        isPractice: v.isPractice,
      })
      .onConflictDoUpdate({
        // Re-recording the same passage in the same sitting replaces the first
        // attempt, which is what someone clearing their throat expects.
        target: [voiceContributionsTable.sessionId, voiceContributionsTable.promptId],
        set: {
          audioBase64: v.audioBase64,
          mimeType: v.mimeType,
          durationMs: v.durationMs ?? null,
          contributor: v.contributor,
          isPractice: v.isPractice,
        },
      });

    req.log?.info(
      { script: v.script, promptId: v.promptId, isPractice: v.isPractice },
      "Stored a voice contribution",
    );
    res.status(200).json({ stored: true });
  },
);

const feedbackBodySchema = z.object({
  sessionId: sessionIdSchema,
  script: z.string().min(1).max(64),
  contributor: z.string().min(1).max(32),
  isPractice: z.boolean().optional().default(false),
  passageId: z.string().min(1).max(64),
  passageText: z.string().min(1).max(4000),
  readsWell: z.boolean(),
  comment: z.string().max(2000).optional().default(""),
});

// What a speaker said about the paragraph we asked them to read.
//
// BOTH VERDICTS, not just the complaints. The twelve passages went out
// unverified, and a plain "yes that reads fine" from someone who speaks the
// language is precisely the evidence that lets one be marked verified. Storing
// only the corrections would leave every passage unverified forever.
router.post(
  "/script-trace/passage-feedback",
  autosaveRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const body = feedbackBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const f = body.data;

    await db
      .insert(passageFeedbackTable)
      .values({
        sessionId: f.sessionId,
        script: f.script,
        contributor: f.contributor,
        passageId: f.passageId,
        passageText: f.passageText,
        readsWell: f.readsWell,
        comment: f.comment,
        isPractice: f.isPractice,
      })
      .onConflictDoUpdate({
        // Changing their mind, or adding a comment after answering, replaces
        // the earlier verdict rather than filing a second one.
        target: [passageFeedbackTable.sessionId, passageFeedbackTable.passageId],
        set: { readsWell: f.readsWell, comment: f.comment, contributor: f.contributor },
      });

    req.log?.info(
      { script: f.script, passageId: f.passageId, readsWell: f.readsWell, hasComment: f.comment.length > 0 },
      "Stored passage feedback",
    );
    res.status(200).json({ stored: true });
  },
);

export default router;
