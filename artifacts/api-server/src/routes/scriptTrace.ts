import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  db,
  scriptTraceContributionsTable,
  voiceContributionsTable,
  passageFeedbackTable,
} from "@workspace/db";
import {
  mergeTracePayloads,
  parseTracePayload,
  TracePayloadError,
} from "@workspace/script-trace";
import { createRateLimit } from "../middlewares/rateLimit";
import { checkContributionKey, type ContributionLinkMode } from "../lib/contributionLinks";
import { reviewerSeesClip, sameSpeaker } from "../lib/referenceClips";
import {
  PHRASE_PROMPT_PREFIX,
  findZonePhrase,
  loadClipAudio,
  loadClipsForPhrases,
  loadZonePhrases,
  storePhraseClip,
  storeVerdict,
} from "../lib/phraseVoices";

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
//   4. There is no OPEN read. The letter and passage routes serve nothing back
//      out, so their worst case is rows nobody asked for, not a leak. The
//      lesson phrase routes at the bottom of this file DO read (the app's
//      phrases, and clips played back to a second speaker), and every one of
//      them demands a key for one language, minted on the owner-only Nest.
//      See lib/contributionLinks.ts for why.
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

    // MERGE rather than replace, in a transaction that locks the row first.
    //
    // The page keeps only the session id in localStorage and has no way to read
    // a submission back, so reopening it starts from a blank canvas with the
    // SAME session id. Replacing wholesale meant somebody who traced the
    // alphabet, closed the tab, and came back to add two letters would have
    // replaced forty-five with two. Found 2026-08-23 before anyone hit it.
    //
    // FOR UPDATE is load-bearing, not caution. The page autosaves after every
    // letter, so two saves overlapping on a slow connection is the normal case
    // rather than the rare one, and a read-modify-write without the lock would
    // drop whichever letter lost the race.
    const stored = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ payload: scriptTraceContributionsTable.payload })
        .from(scriptTraceContributionsTable)
        .where(eq(scriptTraceContributionsTable.sessionId, body.data.sessionId))
        .for("update");

      let payload = body.data.payload;
      if (existing?.payload) {
        try {
          payload = mergeTracePayloads(existing.payload, body.data.payload);
        } catch {
          // A stored payload that no longer parses must not block somebody
          // who is sitting there tracing right now. Take the new one whole.
          payload = body.data.payload;
        }
      }

      // Re-parsed because the merge is what actually gets stored, so the glyph
      // count has to describe it rather than describing the submission.
      const merged = parseTracePayload(payload);
      if (merged.glyphs.length > MAX_GLYPHS) {
        // Only reachable by merging past the cap one letter at a time. Keep
        // the newer submission, which is the half the contributor can see.
        payload = body.data.payload;
      }
      const final = parseTracePayload(payload);

      await tx
        .insert(scriptTraceContributionsTable)
        .values({
          sessionId: body.data.sessionId,
          script: final.script,
          contributor: final.contributor,
          isPractice: final.isPractice,
          glyphCount: final.glyphs.length,
          payload,
        })
        .onConflictDoUpdate({
          target: scriptTraceContributionsTable.sessionId,
          set: {
            script: final.script,
            contributor: final.contributor,
            isPractice: final.isPractice,
            glyphCount: final.glyphs.length,
            payload,
            updatedAt: sql`now()`,
          },
        });

      return final;
    });

    res.status(200).json({ stored: stored.glyphs.length, script: stored.script });
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
    // A lesson phrase take lives in this same table under the same upsert key,
    // and its verdicts belong to its exact bytes. This route is unkeyed and
    // does not clear verdicts, so it must never be a second door onto a phrase
    // take (2026-09-15). The page never sends such an id; only a crafted
    // request would.
    if (v.promptId.startsWith(PHRASE_PROMPT_PREFIX)) {
      res.status(400).json({ error: "That prompt belongs to the lesson phrase recorder." });
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

// ── LESSON PHRASES: one clip per phrase, and a second speaker's verdict ──────
//
// Owner-approved 2026-09-15, starting with Bodo zone 1. The languages the
// recogniser cannot hear are scored against reference audio of every phrase in
// the lesson (lib/referenceScoring.ts), and that reference is the app's own
// synthetic voice until native speakers record the lessons. These routes are
// how they do: aksharmala.html?phrases=<code> records, ?review=<code> checks.
//
// NOT WIRED INTO SCORING. Nothing here touches referenceAudio.ts; an approved
// clip is stored and counted, and that is all, until the wire-up lands.
//
// PLAIN ROUTES OUTSIDE lib/api-spec/openapi.yaml, like every route above: the
// only client is the static page, not orval.
//
// THE KEY TRAVELS IN A HEADER, never the query string, so it stays out of
// every access log between the phone and this handler. The page reads it from
// its own address bar and sends it with each request.

const CONTRIBUTION_KEY_HEADER = "X-Contribution-Key";

/**
 * One phrase is a few seconds of speech: tens of kilobytes as opus, a few
 * hundred as Safari's mp4. The page stops a take at 20 seconds, so these are
 * several times the longest honest clip and far below the passage cap.
 */
const MAX_PHRASE_AUDIO_BASE64_BYTES = 1024 * 1024;
const MAX_PHRASE_DURATION_MS = 60 * 1000;

// Its own budget, separate from autosave: the review page fetches each clip's
// audio once per visit, and a reviewer going back and forth through a zone of
// forty-eight phrases must never hit a limit meant for a runaway loop.
const phraseReadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 600,
  message: "That is a lot of listening. Please try again in a little while.",
});

// Lower-case letters, digits and underscores: every real code (brx, mni) and
// the api suites' __test_lang_<suite> rows, which /languages hides if a crashed
// run leaves one behind. Nothing here can put a newline into the signed input.
const languageCodeSchema = z.string().regex(/^[a-z_][a-z0-9_]{1,39}$/, "Invalid language");
const zoneSchema = z.coerce.number().int().positive().max(99).default(1);

/** Answers for the page and returns false unless the key opens this language. */
function allowLink(
  req: Request,
  res: Response,
  mode: ContributionLinkMode,
  language: string,
): boolean {
  const check = checkContributionKey(mode, language, req.get(CONTRIBUTION_KEY_HEADER));
  if (check === "ok") return true;
  if (check === "expired") {
    res.status(410).json({ code: "link_expired", error: "This link has run out." });
  } else {
    res.status(403).json({ code: "link_invalid", error: "This link does not open this page." });
  }
  return false;
}

const lessonPhrasesQuerySchema = z.object({
  language: languageCodeSchema,
  zone: zoneSchema,
});

// The phrases a speaker is asked to record, in the order a learner meets them.
router.get(
  "/script-trace/lesson-phrases",
  phraseReadRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const q = lessonPhrasesQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    // The key before any lookup, so a caller without one learns nothing about
    // which languages have content.
    if (!allowLink(req, res, "record", q.data.language)) return;

    const set = await loadZonePhrases(q.data.language, q.data.zone);
    if (!set) {
      res.status(404).json({ code: "no_phrases", error: "There are no lesson phrases here yet." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      language: set.language,
      zone: set.zone,
      phrases: set.phrases.map((p) => ({
        id: p.id,
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
        stop: p.stop,
        stage: p.stage,
      })),
    });
  },
);

const phraseVoiceBodySchema = z.object({
  sessionId: sessionIdSchema,
  contributor: z.string().min(1).max(32),
  isPractice: z.boolean().optional().default(false),
  language: languageCodeSchema,
  zone: z.number().int().positive().max(99).optional().default(1),
  phraseId: z.number().int().positive(),
  audioBase64: z
    .string()
    .min(1, "No audio was recorded")
    .max(MAX_PHRASE_AUDIO_BASE64_BYTES, "That recording is too long for one phrase"),
  mimeType: z.string().min(1).max(128),
  durationMs: z.number().int().positive().max(MAX_PHRASE_DURATION_MS).optional(),
});

// One take of one phrase. Saying it again in the same sitting replaces the
// take and clears any verdict on the old one (lib/phraseVoices.ts).
router.post(
  "/script-trace/phrase-voice",
  autosaveRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const body = phraseVoiceBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const v = body.data;
    if (!/^audio\//.test(v.mimeType)) {
      res.status(400).json({ error: "That is not an audio recording." });
      return;
    }
    if (!allowLink(req, res, "record", v.language)) return;

    // Stored only against a phrase this page could have shown: the language's
    // own row, inside the zone. The text comes from the database, never from
    // the body, so a clip always names the words the app really teaches.
    const phrase = await findZonePhrase(v.language, v.zone, v.phraseId);
    if (!phrase) {
      res.status(404).json({ code: "unknown_phrase", error: "That phrase is not part of this lesson." });
      return;
    }

    await storePhraseClip({
      sessionId: v.sessionId,
      contributor: v.contributor,
      isPractice: v.isPractice,
      languageCode: v.language,
      phrase,
      audioBase64: v.audioBase64,
      mimeType: v.mimeType,
      durationMs: v.durationMs ?? null,
    });
    // No name in the log line, the same as the passage route above.
    req.log?.info(
      { language: v.language, phraseId: phrase.id, isPractice: v.isPractice },
      "Stored a lesson phrase clip",
    );
    res.status(200).json({ stored: true, phraseId: phrase.id });
  },
);

const phraseClipsQuerySchema = z.object({
  language: languageCodeSchema,
  zone: zoneSchema,
  sessionId: sessionIdSchema,
  reviewer: z.string().min(1).max(32),
});

// The review queue: every phrase in the zone that has a clip worth judging,
// with this reviewer's own earlier verdicts so coming back is not starting over.
//
// NO NAMES LEAVE THE SERVER. The reviewer is judging a recording, not a
// person, and the one thing a name is needed for, refusing a self-review, is
// decided here. Takes are numbered instead.
router.get(
  "/script-trace/phrase-clips",
  phraseReadRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const q = phraseClipsQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    if (!allowLink(req, res, "review", q.data.language)) return;

    const set = await loadZonePhrases(q.data.language, q.data.zone);
    if (!set) {
      res.status(404).json({ code: "no_phrases", error: "There are no lesson phrases here yet." });
      return;
    }
    const { clips, verdictsByClip } = await loadClipsForPhrases(
      q.data.language,
      set.phrases.map((p) => p.id),
    );

    let ownClipsHidden = 0;
    const items = [];
    for (const p of set.phrases) {
      const forPhrase = clips.filter((c) => c.phraseId === p.id);
      ownClipsHidden += forPhrase.filter(
        (c) => !c.isPractice && sameSpeaker(q.data.reviewer, c.contributor),
      ).length;
      const visible = forPhrase.filter((c) => reviewerSeesClip(c, q.data.reviewer, p.nativeScript));
      if (visible.length === 0) continue;
      items.push({
        phraseId: p.id,
        stop: p.stop,
        stage: p.stage,
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
        clips: visible.map((c) => {
          const mine = (verdictsByClip.get(c.id) ?? []).find((x) => x.sessionId === q.data.sessionId);
          return {
            clipId: c.id,
            durationMs: c.durationMs,
            myVerdict: mine ? mine.verdict : null,
            myNote: mine ? mine.note : "",
          };
        }),
      });
    }

    res.set("Cache-Control", "no-store");
    res.status(200).json({
      language: set.language,
      zone: set.zone,
      phrasesTotal: set.phrases.length,
      ownClipsHidden,
      items,
    });
  },
);

const clipAudioQuerySchema = z.object({
  language: languageCodeSchema,
  format: z.enum(["original", "wav"]).default("original"),
});

// One clip's audio, as JSON base64 rather than a media URL. The page turns it
// into a data URL, the one playback path this page has proven on Safari (see
// the passage recorder in the template). format=wav is the fallback for a
// phone that cannot play what another phone recorded, typically an iPhone
// handed an Android webm.
//
// EVERY ANSWER CARRIES `take`, the hash of the stored bytes (lib/phraseVoices.ts),
// and the page sends it back with a verdict. The WAV copy carries the take of
// the recording it was made from, because that recording is what is judged.
router.get(
  "/script-trace/phrase-clips/:id/audio",
  phraseReadRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const q = clipAudioQuerySchema.safeParse(req.query);
    if (!Number.isInteger(id) || id <= 0 || !q.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (!allowLink(req, res, "review", q.data.language)) return;

    const clip = await loadClipAudio(id);
    // A clip of another language answers exactly like a missing one: a key
    // opens one language and nothing else.
    if (!clip || clip.phraseId === null || clip.languageCode !== q.data.language) {
      res.status(404).json({ code: "unknown_clip", error: "That recording is not here." });
      return;
    }
    res.set("Cache-Control", "no-store");
    if (q.data.format === "original") {
      res.status(200).json({ mimeType: clip.mimeType, audioBase64: clip.audioBase64, take: clip.take });
      return;
    }
    try {
      // LOADED ON DEMAND, on purpose. That module throws at import when
      // OPENAI_API_KEY is unset, and this public router must not need an
      // OpenAI key to accept a traced letter. In the built server openai.ts
      // has already loaded it, so this costs nothing there.
      const { convertToWav } = await import("@workspace/integrations-openai-ai-server/audio");
      const wav = await convertToWav(Buffer.from(clip.audioBase64, "base64"));
      res.status(200).json({ mimeType: "audio/wav", audioBase64: wav.toString("base64"), take: clip.take });
    } catch (err) {
      req.log?.warn({ err, clipId: id }, "Could not convert a lesson phrase clip for playback");
      res.status(422).json({ code: "undecodable", error: "That recording could not be played." });
    }
  },
);

const phraseVerdictBodySchema = z.object({
  sessionId: sessionIdSchema,
  reviewer: z.string().min(1).max(32),
  isPractice: z.boolean().optional().default(false),
  language: languageCodeSchema,
  clipId: z.number().int().positive(),
  // The take the reviewer heard, exactly as the audio route handed it out.
  // REQUIRED: a verdict that cannot say which recording it judges is not
  // stored at all (review 2026-09-15, finding 1). Nothing has published this
  // page yet, so no open review page predates the field.
  take: z.string().regex(/^[0-9a-f]{64}$/, "Invalid take"),
  verdict: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional().default(""),
});

// A second speaker's verdict on one clip. Changing their mind replaces it.
router.post(
  "/script-trace/phrase-verdict",
  autosaveRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const body = phraseVerdictBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const v = body.data;
    if (!allowLink(req, res, "review", v.language)) return;

    // The clip's language, speaker and take are read and the verdict written
    // in one transaction under a row lock, so a re-record cannot land between
    // the check and the write (lib/phraseVoices.ts, storeVerdict).
    const outcome = await storeVerdict({
      contributionId: v.clipId,
      languageCode: v.language,
      take: v.take,
      sessionId: v.sessionId,
      reviewer: v.reviewer,
      verdict: v.verdict,
      note: v.note.trim(),
      isPractice: v.isPractice,
    });
    if (outcome === "unknown_clip") {
      res.status(404).json({ code: "unknown_clip", error: "That recording is not here." });
      return;
    }
    // A SECOND speaker, which is the whole point of the check. Refused rather
    // than stored and ignored, so the reviewer is told instead of believing
    // they approved it. The page hides their own clips; this is for a name
    // that changed between the two visits.
    if (outcome === "own_recording") {
      res.status(409).json({
        code: "own_recording",
        error: "This is your own recording. A different speaker needs to check it.",
      });
      return;
    }
    // The speaker recorded this phrase again after the page loaded it. A 409
    // like own_recording, because it is the same kind of answer: the request
    // is well formed and keyed, and the clip's current state refuses it. The
    // re-record has already cleared every verdict on the old take, so the page
    // drops its copy, loads the new one, and asks again.
    if (outcome === "take_changed") {
      req.log?.info(
        { language: v.language, clipId: v.clipId },
        "Refused a lesson phrase verdict on a take that has since been replaced",
      );
      res.status(409).json({
        code: "take_changed",
        error: "This recording was replaced after you heard it. Listen to the new one, then answer.",
      });
      return;
    }
    req.log?.info(
      { language: v.language, clipId: v.clipId, verdict: v.verdict, hasNote: v.note.trim().length > 0 },
      "Stored a lesson phrase verdict",
    );
    res.status(200).json({ stored: true });
  },
);

export default router;
