import { Router, type IRouter, type Request, type Response } from "express";
import { db, ttsCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { synthesizeChachaLine } from "../lib/ttsPrewarm";
import { romanizeTranscript } from "../lib/romanizeTranscript";
import { CHACHA_AUDIO_FORMAT } from "../lib/chachaStrings";
import {
  CALL_BEATS,
  CALL_CANNED_LINES,
  CALL_NOTHING_HEARD,
  LEARNER_TURNS,
  beatAt,
  callLineCacheKey,
  isFinalBeat,
} from "../lib/chachaCallScript";
import {
  callIsOver,
  createCallSession,
  endCallSession,
  getCallSession,
  recordCallTurn,
} from "../lib/chachaCallSessions";
import { runLiveTurn, type LiveTurnResult } from "../lib/chachaCallTurn";
import {
  appendChatAudioChunk,
  completeChatAudioStream,
  createChatAudioStream,
  failChatAudioStream,
} from "../lib/chatAudioStreams";

/**
 * Chacha-ji's phone call. THE SERVER HALF ONLY.
 *
 * There is no call UI behind this yet and that is deliberate: the client half
 * sits behind a held mobile build, the server half does not, so this ships and
 * waits. Every route here is exercisable by curl.
 *
 * THE SHAPE OF A CALL
 *   POST /openai/chacha-call/start          he says hello, from a fixed clip
 *   POST /openai/chacha-call/:id/turn       the learner speaks, he answers
 *   POST /openai/chacha-call/:id/end        hang up
 *
 * NO SCORE ANYWHERE IN HERE, and the absence is structural. A call is an event,
 * not a lesson: there is no band, no rubric, no correction and no field for one
 * to travel in. Do not add one.
 *
 * THE CANNED LADDER, which is what keeps the call fast and keeps it standing up
 * when the model does not. The first and last beats are fixed clips served from
 * tts_cache, so the learner hears his voice instantly at the moment a call is
 * most fragile. Every live beat carries its own fixed line too, and falls back
 * to it whenever gpt-audio gives us nothing usable. A call that degrades to its
 * script is still a call; a call that errors is a hang-up.
 *
 * AUDIO DELIVERY REUSES THE CHAT REGISTRY. `X-Audio-Stream: url` mints a
 * chatAudioStreams entry and returns its URL, served progressively by the
 * existing GET /openai/chat/audio/:streamId. Nothing new was built for this:
 * the native players behind expo-audio already consume that endpoint, and a
 * second implementation of progressive audio would have been the defect.
 * Without the header the route answers with plain JSON and the whole clip
 * base64'd, which is the shape curl and the tests want.
 */

/**
 * A CALL IS NOT GATED AND DOES NOT SPEND THE WEEKLY CHAT ALLOWANCE. Owner
 * ruling, 2026-08-28, and it reverses the shape this route shipped with.
 *
 * Two reasons, and the second is the load-bearing one:
 *
 *   1. The game is gated by All-Access at the feature level, so a second,
 *      per-turn meter underneath it charges twice for one decision.
 *   2. HE RINGS THE LEARNER. A journey-stop interruption is not something they
 *      chose to spend their practice minutes on, and billing someone for an
 *      incoming call is exactly the wrong shape. It follows the rule
 *      `capstoneExemptFromWeeklyCap` already sets for the zone capstone: part
 *      of the journey is not free chat.
 *
 * What still bounds the cost is the AGENDA. A call is four beats with at most
 * two live model turns, fixed before it starts, which is a bound the open-ended
 * chat route does not have and the reason it needs a meter and this does not.
 */
export interface ChachaCallDeps {
  /** Fixed clip for a line, from tts_cache, synthesized on a miss. */
  cannedAudio: (
    lineKey: string,
    text: string,
  ) => Promise<{ audioBase64: string; format: string } | null>;
  /** One live beat through gpt-audio. */
  liveTurn: typeof runLiveTurn;
  /** Opens the TLS connection early so the first live turn is not the cold one. */
  warmConnection: () => void;
}

/**
 * Reads a canned line from tts_cache and synthesizes it on a miss, exactly as
 * GET /openai/chacha-lines does for the stall lines. A miss is survivable: a
 * line that will not synthesize costs that line its voice, not the call.
 */
async function cannedAudioFromCache(
  lineKey: string,
  text: string,
): Promise<{ audioBase64: string; format: string } | null> {
  const cacheKey = callLineCacheKey(lineKey);
  try {
    const hit = await db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, cacheKey),
      columns: { audioBase64: true, format: true },
    });
    if (hit) return { audioBase64: hit.audioBase64, format: hit.format };
  } catch {
    // Cache unavailable is not fatal; fall through and synthesize.
  }

  try {
    const buffer = await synthesizeChachaLine(text);
    if (buffer.length === 0) return null;
    const audioBase64 = buffer.toString("base64");
    db.insert(ttsCacheTable)
      .values({ cacheKey, audioBase64, format: CHACHA_AUDIO_FORMAT })
      .onConflictDoNothing()
      .execute()
      .catch(() => {});
    return { audioBase64, format: CHACHA_AUDIO_FORMAT };
  } catch {
    return null;
  }
}

const defaultDeps: ChachaCallDeps = {
  cannedAudio: cannedAudioFromCache,
  liveTurn: runLiveTurn,
  warmConnection: () => {
    // A cheap GET on the same host. Measured 2026-08-28: the first request a
    // process makes costs about 1.9 s to first audio against about 1.0 s warm,
    // and that whole difference is connection setup. Firing this while the
    // learner is still listening to the canned hello means the first LIVE turn
    // is never the one that pays it. Fire and forget; a failure here must never
    // touch the call.
    void openai.models.retrieve("gpt-audio").catch(() => {});
  },
};

export function createChachaCallRouter(
  deps: ChachaCallDeps = defaultDeps,
): IRouter {
  const router: IRouter = Router();

  // POST /openai/chacha-call/start
  //
  // Opens a call and returns his hello, which is a FIXED CLIP. Nothing is
  // generated here, so the learner hears him immediately, and the model
  // connection warms up behind the greeting.
  router.post(
    "/openai/chacha-call/start",
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as AuthedRequest).userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const session = createCallSession(userId);
      deps.warmConnection();

      const hello = CALL_BEATS[0];
      const audio = await deps.cannedAudio(hello.id, hello.text);

      res.json({
        callId: session.id,
        beat: {
          id: hello.id,
          index: 0,
          text: hello.text,
          english: hello.english,
          canned: true,
          isFinal: false,
        },
        // How many times the learner will be asked to speak. Known before the
        // call starts, which is the point of a semi-scripted agenda.
        learnerTurns: LEARNER_TURNS,
        // The clip that loops behind him for this call and no other. Fixed at
        // creation; a client that reconnects gets the same one back off every
        // turn rather than picking again and changing cars mid-sentence.
        backdrop: session.backdrop,
        audioBase64: audio?.audioBase64 ?? null,
        format: audio?.format ?? null,
      });
    },
  );

  // POST /openai/chacha-call/:callId/turn
  //
  // The learner's clip in, his reply out. Body is JSON:
  //   { audioBase64: string, format?: "wav" | "mp3" }
  //
  // No languageCode: he speaks his own Hinglish to every learner regardless of
  // their journey language, and the only thing that ever read it was the weekly
  // allowance row, which a call no longer writes.
  router.post(
    "/openai/chacha-call/:callId/turn",
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as AuthedRequest).userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const session = getCallSession(String(req.params.callId));
      if (!session || session.userId !== userId) {
        res.status(404).json({ error: "Unknown call" });
        return;
      }
      if (callIsOver(session)) {
        res.status(409).json({ error: "Call is already over" });
        return;
      }

      const body = (req.body ?? {}) as {
        audioBase64?: unknown;
        format?: unknown;
      };
      const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
      if (!audioBase64) {
        res.status(400).json({ error: "audioBase64 is required" });
        return;
      }
      const format = body.format === "mp3" ? "mp3" : "wav";

      const beat = beatAt(session.beatIndex);
      if (!beat) {
        res.status(409).json({ error: "Call is already over" });
        return;
      }

      const audio = Buffer.from(audioBase64, "base64");
      const wantsStreamUrl = req.get("X-Audio-Stream") === "url";
      const stream = wantsStreamUrl ? createChatAudioStream(userId) : null;

      // The player can start pulling before the model has answered, so the
      // URL goes out first and the bytes catch up.
      if (stream) {
        res.status(202).json({
          callId: session.id,
          audioUrl: `/openai/chat/audio/${stream.id}`,
        });
      }

      let result: LiveTurnResult | null = null;
      if (beat.mode === "live") {
        try {
          result = await deps.liveTurn({
            audio,
            audioFormat: format,
            beat,
            history: session.turns,
            onAudioChunk: stream
              ? (chunk) => appendChatAudioChunk(stream, chunk)
              : undefined,
          });
        } catch {
          // Swallowed on purpose: the canned fallback below is the answer to a
          // live turn that will not run, and it is his voice either way.
          result = null;
        }
      }

      // HIS LINES ARE ROMANIZED, the same rule his chai-stall lines follow: a
      // learner reading along cannot read Devanagari yet. The prompt asks for
      // Latin letters and mostly gets it, but not reliably (measured
      // 2026-08-28: one reply in three came back in Devanagari anyway), so the
      // deterministic romanizer already built for the "We heard" line is the
      // backstop. Latin passes straight through it untouched, and a script it
      // cannot romanize cleanly returns empty, in which case his own words
      // stand rather than being blanked.
      const spoken = result?.chachaText ?? "";
      const romanized = spoken ? romanizeTranscript(spoken, "hi") : "";
      const chachaSpoken = romanized || spoken;

      const spokeLive = Boolean(result && result.mp3.length > 0 && result.chachaText);
      const learnerText = result?.learnerText ?? "";

      // The fallback line depends on WHY we are falling back. A learner who
      // said nothing gets the nothing-heard line, because he is delighted by
      // anything and that has to include nothing; a model that failed gets this
      // beat's own scripted line, so the agenda still advances.
      const fallback =
        !spokeLive && result && !learnerText
          ? { key: "nothingHeard", ...CALL_NOTHING_HEARD }
          : { key: beat.id, text: beat.text, english: beat.english };

      let chachaText: string;
      let canned: boolean;
      let audioBase64Out: string | null = null;
      let formatOut: string | null = null;

      if (spokeLive && result) {
        chachaText = chachaSpoken;
        canned = false;
        audioBase64Out = result.mp3.toString("base64");
        formatOut = "mp3";
      } else {
        chachaText = fallback.text;
        canned = true;
        const clip = await deps.cannedAudio(fallback.key, fallback.text);
        audioBase64Out = clip?.audioBase64 ?? null;
        formatOut = clip?.format ?? null;
        // The stream was promised bytes it is not going to get from the model.
        if (stream && clip) {
          appendChatAudioChunk(stream, Buffer.from(clip.audioBase64, "base64"));
        }
      }

      if (stream) {
        if (audioBase64Out) completeChatAudioStream(stream);
        else failChatAudioStream(stream);
      }

      recordCallTurn(session, {
        beatId: beat.id,
        learner: learnerText,
        chacha: chachaText,
        canned,
      });

      if (stream) return; // The 202 already went out.

      const next = beatAt(session.beatIndex);
      res.json({
        callId: session.id,
        backdrop: session.backdrop,
        beat: {
          id: beat.id,
          index: session.beatIndex - 1,
          text: chachaText,
          english: canned ? fallback.english : null,
          canned,
          isFinal: isFinalBeat(session.beatIndex - 1),
        },
        heard: learnerText,
        next: next
          ? { id: next.id, index: session.beatIndex, canned: next.mode === "canned" }
          : null,
        over: callIsOver(session),
        audioBase64: audioBase64Out,
        format: formatOut,
      });
    },
  );

  // POST /openai/chacha-call/:callId/end
  //
  // Hang up. Returns his farewell, a fixed clip, and the outcome.
  //
  // `outcome` is the seam the ring-back will read: answered when the learner
  // spoke at least once, abandoned when they did not. NOTHING PERSISTS IT YET.
  // "Ignoring a call means he calls again later" needs durable state and a push
  // channel, and both are their own decision.
  router.post(
    "/openai/chacha-call/:callId/end",
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as AuthedRequest).userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const session = getCallSession(String(req.params.callId));
      if (!session || session.userId !== userId) {
        res.status(404).json({ error: "Unknown call" });
        return;
      }

      const bye = CALL_CANNED_LINES.bye;
      const audio = await deps.cannedAudio("bye", bye.text);
      const outcome = endCallSession(session.id);

      res.json({
        callId: session.id,
        outcome,
        turns: session.turns.length,
        text: bye.text,
        english: bye.english,
        audioBase64: audio?.audioBase64 ?? null,
        format: audio?.format ?? null,
      });
    },
  );

  return router;
}

const router: IRouter = createChachaCallRouter();
export default router;
