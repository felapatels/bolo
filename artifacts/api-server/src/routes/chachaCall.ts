import { Router, type IRouter, type Request, type Response } from "express";
import { db, languagesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  openai,
  speechToText,
  detectAudioFormat,
  convertToWav,
} from "@workspace/integrations-openai-ai-server/audio";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { romanizeTranscript } from "../lib/romanizeTranscript";
import { buildSttOptions, discardAnchorEcho } from "../lib/sttLanguage";
import {
  CALL_BEATS,
  type CallMode,
  CALL_CANNED_LINES,
  CALL_NOTHING_HEARD,
  learnerTurnsFor,
  beatAt,
  isFinalBeat,
} from "../lib/chachaCallScript";
import { callLine, type CallLine } from "../lib/chachaCallLines";
import {
  callIsOver,
  createCallSession,
  endCallSession,
  getCallSession,
  recordCallTurn,
  waitForCallTurn,
} from "../lib/chachaCallSessions";
import { runLiveTurn, type LiveTurnResult } from "../lib/chachaCallTurn";
import { grantTokensDetailed } from "../lib/tokenService";
import {
  TOKEN_EARN_CHACHA_CALL_TURN,
  CHACHA_CALL_CHAI_MAX,
} from "../lib/tokenEconomy";
import { writeChachaCallXp, XP_EARN_CHACHA_CALL_TURN } from "../lib/xpEngine";
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
/**
 * How long the caption long-poll waits before answering "not yet".
 *
 * Comfortably longer than a turn takes (measured about 2.6 s end to end, of
 * which about 1.0 s is before the first audio byte) and comfortably shorter
 * than any sane client or proxy timeout.
 */
export const TURN_WAIT_MS = 12_000;

export interface ChachaCallDeps {
  /**
   * One fixed line, IN THE LEARNER'S LANGUAGE: his words, the romanization
   * under them and the clip, from tts_cache and built on a miss.
   *
   * IT TAKES NO TEXT, AND THAT IS THE FIX. This used to be handed a line key
   * AND a string, and it cached by the key while synthesizing the string, so
   * the single hardcoded Hindi HELLO went into every language's slot. The words
   * belong to chachaCallLines now, so no caller can pair them wrongly.
   */
  cannedLine: (lineKey: string, languageCode: string) => Promise<CallLine>;
  /**
   * The journey language this learner is on. He speaks it for the whole call
   * (owner ruling, 2026-08-28), which is why it is resolved ONCE at /start and
   * carried on the session rather than read per turn: a learner who switches
   * language mid-call must not make him change tongue between two questions.
   */
  resolveLanguage: (
    userId: string,
  ) => Promise<{ code: string; name: string; nativeName: string }>;
  /**
   * The learner's clip, in something the models will actually accept.
   *
   * THE CALL ROUTE WAS THE ONLY AUDIO-IN PATH IN THIS SERVER THAT SKIPPED THIS,
   * and it cost the whole feature. iOS records m4a (expo-audio's HIGH_QUALITY
   * preset), the call client hardcodes `format: "wav"`, and this route trusted
   * that label: OpenAI was handed m4a bytes in a file named `audio.wav`, threw,
   * and the throw was swallowed by a bare catch. Every turn came back with an
   * empty transcript, which after 2026-08-28 reads as "Didn't catch that" on
   * every single answer while the learner's own level meter is bouncing.
   *
   * WAV OR MP3, NOT MERELY "DECODABLE". ensureCompatibleFormat is happy to hand
   * Whisper an mp4 untouched, and Whisper is happy to take it, but gpt-audio's
   * `input_audio` accepts only wav and mp3. Both halves of a turn read the same
   * buffer, so the narrower rule is the one that governs.
   */
  prepareLearnerAudio: (
    audio: Buffer,
  ) => Promise<{ buffer: Buffer; format: "wav" | "mp3"; detected: string }>;
  /** One live beat through gpt-audio. */
  liveTurn: typeof runLiveTurn;
  /**
   * Transcribes the learner's clip on a CANNED beat, where no live turn runs.
   *
   * IT USED TO SKIP THIS, and the comment on CallTurn.learner said why: his
   * farewell is fixed, so nothing would read the words. That stopped being true
   * on 2026-08-28, when a turn started earning on whether he HEARD them. The
   * journey's last learner turn is answered by the canned goodbye, so without
   * this the fifth answer of a five-turn call could never earn and the cap of
   * five was unreachable by one.
   *
   * It runs beside the cached clip rather than in front of it: the learner is
   * already hearing his farewell while this resolves.
   */
  transcribeLearner: (
    audio: Buffer,
    format: "wav" | "mp3",
    languageCode: string,
    languageNativeName: string,
  ) => Promise<string>;
  /**
   * Credits one chai for an answered JOURNEY turn. Returns the amount actually
   * granted, which is 0 when the ledger already holds this turn.
   *
   * INJECTED SO THE REWARD IS TESTABLE. It reached the ledger directly until
   * 2026-08-28, which meant no test could see it, which is part of why nobody
   * noticed the grant sat below an early return and had never run at all.
   */
  grantChai: (userId: string, callId: string, turnIndex: number) => Promise<number>;
  /** The same for XP on a GAME turn. One currency each, never both. */
  grantXp: (
    userId: string,
    languageCode: string,
    callId: string,
    turnIndex: number,
  ) => Promise<number>;
  /** Opens the TLS connection early so the first live turn is not the cold one. */
  warmConnection: () => void;
  /**
   * How long the caption long-poll waits before answering "not yet".
   * Injectable so a test does not sit out the real twelve seconds; a suite of
   * 1350 tests cannot afford a route that blocks for its own timeout.
   */
  turnWaitMs: number;
}

const defaultDeps: ChachaCallDeps = {
  cannedLine: callLine,
  resolveLanguage: async (userId) => {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { activeLanguage: true },
    });
    // Falls back to Hindi, which is the free language and the one whose call
    // clips are warmed at boot, so a learner with no choice recorded still
    // gets an instant greeting rather than a synthesis wait.
    const code = user?.activeLanguage?.trim() || "hi";
    const row = await db.query.languagesTable.findFirst({
      where: eq(languagesTable.code, code),
      // nativeName is the recognizer's script anchor, not decoration: without
      // it a Gujarati call transcribes into Perso-Arabic. See sttLanguage.ts.
      columns: { name: true, nativeName: true },
    });
    return {
      code,
      name: row?.name ?? "Hindi",
      nativeName: row?.nativeName ?? "",
    };
  },
  prepareLearnerAudio: async (audio) => {
    const detected = detectAudioFormat(audio);
    if (detected === "wav" || detected === "mp3") {
      return { buffer: audio, format: detected, detected };
    }
    // Anything else, including the m4a a phone actually records and the
    // "unknown" a truncated clip produces, goes through ffmpeg. It is already
    // a server dependency and already spawned twice per turn.
    return { buffer: await convertToWav(audio), format: "wav", detected };
  },
  liveTurn: runLiveTurn,
  // Deliberately does NOT catch. The route catches and LOGS, because a
  // transcriber that refuses every clip and a learner who says nothing produce
  // the same empty string, and one of them is an outage.
  transcribeLearner: async (audio, format, languageCode, languageNativeName) => {
    const pinning = buildSttOptions({ languageCode, languageNativeName });
    const raw = await speechToText(audio, format, pinning);
    return discardAnchorEcho(raw.trim(), pinning.prompt);
  },
  grantChai: async (userId, callId, turnIndex) => {
    try {
      const { granted } = await grantTokensDetailed(
        userId,
        "earn_chacha_call",
        `call:${callId}:${turnIndex}`,
        TOKEN_EARN_CHACHA_CALL_TURN,
      );
      return granted ? TOKEN_EARN_CHACHA_CALL_TURN : 0;
    } catch {
      // A call that keeps working without its chai is a small disappointment;
      // a call that drops because the ledger hiccuped is the feature failing.
      return 0;
    }
  },
  grantXp: async (userId, languageCode, callId, turnIndex) => {
    try {
      const granted = await writeChachaCallXp(
        userId,
        languageCode,
        callId,
        turnIndex,
        XP_EARN_CHACHA_CALL_TURN,
      );
      return granted ? XP_EARN_CHACHA_CALL_TURN : 0;
    } catch {
      return 0;
    }
  },
  warmConnection: () => {
    // A cheap GET on the same host. Measured 2026-08-28: the first request a
    // process makes costs about 1.9 s to first audio against about 1.0 s warm,
    // and that whole difference is connection setup. Firing this while the
    // learner is still listening to the canned hello means the first LIVE turn
    // is never the one that pays it. Fire and forget; a failure here must never
    // touch the call.
    void openai.models.retrieve("gpt-audio").catch(() => {});
  },
  turnWaitMs: TURN_WAIT_MS,
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

      // The journey's interruption unless the games hub says otherwise. The
      // default is the safe one: five questions rather than twenty.
      const mode: CallMode =
        (req.body as { mode?: unknown } | undefined)?.mode === "game"
          ? "game"
          : "journey";
      const language = await deps.resolveLanguage(userId);
      const session = createCallSession(
        userId,
        language.code,
        language.name,
        language.nativeName,
        mode,
      );
      deps.warmConnection();

      /**
       * WHICH LANGUAGE THIS CALL OPENED IN.
       *
       * Logged because the answer was briefly invisible and cost an hour on
       * 2026-08-28. The app was reported as speaking Hindi on a Gujarati
       * account; the account was in fact on Hindi, and a home screen caught
       * mid-reconciliation said otherwise. LanguageContext adopts the SERVER'S
       * saved language over its local mirror once per mount, so a local value
       * can be stale for a few seconds after a switch on another device.
       *
       * The line under the clock already tells the LEARNER. This tells the log,
       * so the same question is answerable from production without a screenshot
       * taken at the right second.
       */
      req.log.info(
        { callId: session.id, mode, language: language.code },
        "[chacha-call] start",
      );

      const hello = CALL_BEATS[0];
      const line = await deps.cannedLine(hello.id, language.code);

      res.json({
        callId: session.id,
        /**
         * The language this call is FIXED to, sent so the screen can say so
         * under the clock (owner, 2026-08-28). It has to come from the session
         * rather than the client's live context: the call is pinned at creation
         * precisely so a learner switching language mid-call does not change
         * who they are talking to, which makes the client's current language
         * the wrong answer in exactly the case this line exists for.
         */
        languageName: session.languageName,
        languageCode: session.languageCode,
        beat: {
          id: hello.id,
          index: 0,
          // HIS WORDS COME FROM THE CACHE, NOT FROM THE SCRIPT. The script's
          // string is Hindi; this is that line in the learner's language, and
          // it is the same text the clip below actually speaks.
          text: line.text,
          romanized: line.romanized,
          english: hello.english,
          canned: true,
          isFinal: false,
        },
        mode,
        // How many times the learner will be asked to speak. Known before the
        // call starts, which is the point of a semi-scripted agenda: five for
        // the journey's interruption, twenty for the chosen game.
        learnerTurns: learnerTurnsFor(mode),
        // The clip that loops behind him for this call and no other. Fixed at
        // creation; a client that reconnects gets the same one back off every
        // turn rather than picking again and changing cars mid-sentence.
        backdrop: session.backdrop,
        audioBase64: line.audioBase64,
        format: line.format,
      });
    },
  );

  // POST /openai/chacha-call/:callId/turn
  //
  // The learner's clip in, his reply out. Body is JSON:
  //   { audioBase64: string, format?: "wav" | "mp3" }
  //
  // No languageCode in the body, and there must never be one: the call is
  // pinned to the session's language at /start so a learner switching language
  // mid-call cannot make him change tongue between two questions.
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
      // The client's label is a HINT AND NOTHING MORE from 2026-08-28. It sent
      // "wav" for an m4a for the life of this feature and the route believed it.
      // detectAudioFormat reads the magic bytes instead.
      const claimedFormat = body.format === "mp3" ? "mp3" : "wav";

      const beat = beatAt(session.mode, session.beatIndex);
      if (!beat) {
        res.status(409).json({ error: "Call is already over" });
        return;
      }

      const rawAudio = Buffer.from(audioBase64, "base64");
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

      // Decoded ONCE, before either model sees it, because both halves of a turn
      // read the same buffer and gpt-audio is the fussier of the two.
      let audio: Buffer = rawAudio;
      let format: "wav" | "mp3" = claimedFormat;
      let detected = claimedFormat as string;
      try {
        const prepared = await deps.prepareLearnerAudio(rawAudio);
        audio = prepared.buffer;
        format = prepared.format;
        detected = prepared.detected;
      } catch (err) {
        // ffmpeg refusing the clip is not a reason to drop the call: the turn
        // carries on with the raw bytes and degrades to his scripted line if the
        // models will not take them. It MUST be loud, because a silent version
        // of exactly this is what hid the defect for a day.
        req.log.warn(
          { err, bytes: rawAudio.length },
          "[chacha-call] could not decode the learner's clip",
        );
      }

      let result: LiveTurnResult | null = null;
      const t0 = Date.now();
      // null until the first byte lands. NOT 0-as-absent: a first chunk that
      // arrives inside the same millisecond is the best possible outcome and
      // must not be logged as "no audio ever came".
      let firstAudioMs: number | null = null;
      if (beat.mode === "live") {
        try {
          result = await deps.liveTurn({
            audio,
            audioFormat: format,
            beat,
            languageName: session.languageName,
            languageCode: session.languageCode,
            languageNativeName: session.languageNativeName,
            history: session.turns,
            onAudioChunk: (chunk) => {
              if (firstAudioMs === null) firstAudioMs = Date.now() - t0;
              if (stream) appendChatAudioChunk(stream, chunk);
            },
          });
        } catch (err) {
          // The learner still gets a call: the canned fallback below answers in
          // his voice either way. But this MUST NOT be silent. A gpt-audio
          // outage would otherwise degrade every call in the world to its
          // script with nobody the wiser, and this repo has already had a total
          // outage produce no alert at all. warn and above reaches Sentry.
          req.log.warn(
            { err, beat: beat.id, callId: session.id },
            "[chacha-call] live turn failed, falling back to the scripted line",
          );
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
      // BOTH FORMS, because the caption shows both: his line in the language's
      // own script, and a romanization under it. He is prompted to write the
      // native script now; romanizeTranscript passes Latin straight through
      // untouched and returns empty for a script it cannot convert, in which
      // case the caption simply has no second line rather than a wrong one.
      const chachaRomanized = spoken ? romanizeTranscript(spoken, session.languageCode) : "";

      const spokeLive = Boolean(result && result.mp3.length > 0 && result.chachaText);
      let learnerText = result?.learnerText ?? "";

      // The fallback line depends on WHY we are falling back. A learner who
      // said nothing gets the nothing-heard line, because he is delighted by
      // anything and that has to include nothing; a model that failed gets this
      // beat's own scripted line, so the agenda still advances.
      //
      // ONLY THE KEY IS CHOSEN HERE. The words behind it belong to
      // chachaCallLines, which holds them per language; picking a key and a
      // string separately is what put Hindi into every language's cache slot.
      const nothingHeard = !spokeLive && result && !learnerText;
      const fallbackKey = nothingHeard ? "nothingHeard" : beat.id;
      const fallbackEnglish = nothingHeard ? CALL_NOTHING_HEARD.english : beat.english;

      let chachaText: string;
      let canned: boolean;
      let romanizedOut: string | null = null;
      let audioBase64Out: string | null = null;
      let formatOut: string | null = null;

      if (spokeLive && result) {
        chachaText = spoken;
        canned = false;
        romanizedOut = chachaRomanized || null;
        audioBase64Out = result.mp3.toString("base64");
        formatOut = "mp3";
      } else {
        // STARTED BEFORE THE CLIP AND AWAITED AFTER IT, so the farewell is on
        // its way to the learner while this resolves. Only for a beat that ran
        // canned with no live turn behind it; a failed live turn already has a
        // transcript, or has already decided it heard nothing.
        const lateTranscript =
          beat.mode === "canned"
            ? deps
                .transcribeLearner(
                  audio,
                  format,
                  session.languageCode,
                  session.languageNativeName,
                )
                .catch((err: unknown) => {
                  req.log.warn(
                    { err, format, detected, beat: beat.id },
                    "[chacha-call] could not transcribe the learner on a canned beat",
                  );
                  return "";
                })
            : null;
        const clip = await deps.cannedLine(fallbackKey, session.languageCode);
        if (lateTranscript) learnerText = (await lateTranscript).trim();
        chachaText = clip.text;
        canned = true;
        // A CANNED LINE GETS A ROMANIZATION TOO, which it never used to. It was
        // one hardcoded Hinglish string in Latin letters, so there was nothing
        // to transliterate. In the learner's own script there is, and a canned
        // beat that drops the second caption line would read as a different kind
        // of moment from a live one for no reason a learner could name.
        romanizedOut = clip.romanized;
        audioBase64Out = clip.audioBase64;
        formatOut = clip.format;
        // The stream was promised bytes it is not going to get from the model.
        if (stream && clip.audioBase64) {
          appendChatAudioChunk(stream, Buffer.from(clip.audioBase64, "base64"));
        }
      }

      if (stream) {
        if (audioBase64Out) completeChatAudioStream(stream);
        else failChatAudioStream(stream);
      }

      /**
       * WHAT THE TURN PAID, DECIDED BEFORE THE TURN IS RECORDED.
       *
       * IT USED TO SIT BELOW `if (stream) return`, WHICH MEANT IT NEVER RAN.
       * The app always sends `X-Audio-Stream: url`, so every real call took the
       * 202 path and returned before reaching the grant. No learner has ever
       * been credited a single chai for a call, and the "+1" the caption
       * component draws could not fire. Found 2026-08-28 while wiring the
       * screen edge the owner asked for; the reward and the way to SEE it were
       * the same bug twice.
       *
       * HE HAS TO HAVE HEARD THEM. Owner ruling, 2026-08-28: a turn earns when
       * the learner spoke and the server got words back, and earns nothing when
       * it heard silence. That is the only rule available that means something
       * without inventing a score, and this call has none by design. It is not
       * a judgement of the answer: nothing here reads what they said, only
       * WHETHER they said it.
       *
       * ONE CURRENCY EACH. Chai on the journey call, XP on the game (owner:
       * "chai is only earned on the journey route when chacha calls them. if
       * they access the game from the games page, they can only earn XP").
       * Chai is what he gives you for picking up when HE rang; XP is what every
       * other game on the hub pays for playing it.
       *
       * PER TURN RATHER THAN A LUMP AT THE END, which is what makes the "+1"
       * floating up the screen true rather than decorative, and it means a
       * learner who has to hang up after two questions keeps the two they
       * earned. The chai cap is belt and braces: the journey agenda is five
       * questions, so the count cannot exceed five on its own, but a future
       * agenda change must not quietly become a bigger payout.
       *
       * THE REFID IS THE IDEMPOTENCY. `call:<id>:<turn>` credits once at each
       * ledger's unique index however many times a flaky connection retries the
       * same turn, and `granted` says whether THIS request was the one that
       * inserted it, so nothing reports a reward the learner did not just get.
       *
       * Failure here never fails the turn. A call that keeps working without
       * its chai is a small disappointment; a call that drops because the
       * ledger hiccuped is the feature not working.
       */
      // A REFUSED CLIP IS NOT A SILENT LEARNER, and the difference must not be
      // invisible again. warn and above reaches Sentry.
      if (result?.transcriptFailed) {
        req.log.warn(
          { beat: beat.id, format, detected, bytes: rawAudio.length, callId: session.id },
          "[chacha-call] transcription refused the learner's clip",
        );
      }

      const heardThem = learnerText.length > 0;
      // The turn they just answered. Read BEFORE recordCallTurn advances it.
      const answeredIndex = session.beatIndex;
      let chaiEarned = 0;
      let xpEarned = 0;
      if (heardThem && session.mode === "journey" && answeredIndex <= CHACHA_CALL_CHAI_MAX) {
        chaiEarned = await deps.grantChai(userId, session.id, answeredIndex);
      } else if (heardThem && session.mode === "game") {
        xpEarned = await deps.grantXp(
          userId,
          session.languageCode,
          session.id,
          answeredIndex,
        );
      }

      // HIS words get romanized above; HERS get the same treatment here, from
      // the same deterministic transliterator, so the mirror reads the way the
      // caption does.
      const learnerRomanized = learnerText
        ? romanizeTranscript(learnerText, session.languageCode).trim() || null
        : null;

      recordCallTurn(session, {
        beatId: beat.id,
        learner: learnerText,
        learnerRomanized: learnerRomanized === learnerText ? null : learnerRomanized,
        learnerEnglish: result?.learnerEnglish ?? "",
        chacha: chachaText,
        romanized: romanizedOut,
        canned,
        chaiEarned,
        xpEarned,
      });

      // The number this whole feature rests on. Measured at about 1.0 s warm on
      // a laptop, and NEVER measured from the Repl, where it actually runs. Log
      // it per turn so a regression is visible in production rather than felt
      // by a learner sitting in silence.
      req.log.info(
        {
          beat: beat.id,
          canned,
          firstAudioMs,
          totalMs: Date.now() - t0,
          spokenSeconds: Number((result?.spokenSeconds ?? 0).toFixed(2)),
          // WHAT THE PHONE ACTUALLY SENT, against what it said it sent. A day
          // went into "he never hears me" and this one pair answers it.
          claimedFormat,
          detected,
          audioBytes: rawAudio.length,
          heardSomething: heardThem,
          transcriptFailed: result?.transcriptFailed ?? false,
          chaiEarned,
          xpEarned,
        },
        "[chacha-call] turn",
      );

      if (stream) return; // The 202 already went out.

      const next = beatAt(session.mode, session.beatIndex);

      res.json({
        chaiEarned,
        xpEarned,
        callId: session.id,
        backdrop: session.backdrop,
        beat: {
          id: beat.id,
          index: session.beatIndex - 1,
          text: chachaText,
          // The second caption line. Null rather than a repeat when he already
          // wrote in Latin letters, or when the script cannot be romanized.
          romanized: romanizedOut,
          english: canned ? fallbackEnglish : null,
          canned,
          isFinal: isFinalBeat(session.mode, session.beatIndex - 1),
        },
        heard: learnerText,
        heardRomanized: learnerRomanized === learnerText ? null : learnerRomanized,
        heardEnglish: result?.learnerEnglish ?? "",
        next: next
          ? { id: next.id, index: session.beatIndex, canned: next.mode === "canned" }
          : null,
        over: callIsOver(session),
        audioBase64: audioBase64Out,
        format: formatOut,
      });
    },
  );

  // GET /openai/chacha-call/:callId/turn/:index
  //
  // His words for one turn, waited for rather than polled for.
  //
  // WHY THIS EXISTS AT ALL. A streaming turn answers 202 with an audio URL in
  // about 30 ms so the player can start pulling before the model has said a
  // word. That response cannot also carry his text, because his text is not
  // known yet, and React Native's fetch cannot stream a response body to carry
  // it later. So the captions need a second request, and this is it: it blocks
  // until the turn is recorded and returns immediately if it already is.
  //
  // It is a LONG POLL rather than a polling loop on purpose. A phone asking
  // every 200 ms while he talks is a request storm for a feature whose entire
  // point is the second of silence at the start of a turn.
  router.get(
    "/openai/chacha-call/:callId/turn/:index",
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
      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0) {
        res.status(400).json({ error: "Bad turn index" });
        return;
      }

      const arrived = await waitForCallTurn(session, index, deps.turnWaitMs);
      const turn = session.turns[index];
      if (!arrived || !turn) {
        // 204, not an error: the turn may still be coming, and the client's
        // answer is to show no caption rather than to show a failure over a
        // call the learner can still hear.
        res.status(204).end();
        return;
      }

      const next = beatAt(session.mode, session.beatIndex);
      res.json({
        index,
        text: turn.chacha,
        romanized: turn.romanized,
        canned: turn.canned,
        heard: turn.learner,
        heardRomanized: turn.learnerRomanized,
        heardEnglish: turn.learnerEnglish,
        /**
         * WHAT THE TURN PAID, AND WHETHER HE HEARD THEM AT ALL.
         *
         * THIS RESPONSE IS THE ONLY ONE THE APP READS. A streaming turn answers
         * 202 with an audio URL and nothing else, so a reward that travels only
         * on the JSON turn response reaches curl and never reaches a learner.
         * It carried no reward at all until 2026-08-28, which is half of why
         * nobody had ever seen the "+1 chai" the caption draws.
         *
         * `heard` is the transcript and can be empty for a dozen reasons, so
         * the boolean is sent explicitly rather than left to the client to
         * infer from an empty string.
         */
        heardSomething: turn.learner.length > 0,
        chaiEarned: turn.chaiEarned,
        xpEarned: turn.xpEarned,
        next: next
          ? { id: next.id, index: session.beatIndex, canned: next.mode === "canned" }
          : null,
        over: callIsOver(session),
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

      const bye = await deps.cannedLine("bye", session.languageCode);
      const outcome = endCallSession(session.id);

      res.json({
        callId: session.id,
        outcome,
        turns: session.turns.length,
        text: bye.text,
        romanized: bye.romanized,
        // The gloss stays English in every language: it IS the translation.
        english: CALL_CANNED_LINES.bye.english,
        audioBase64: bye.audioBase64,
        format: bye.format,
      });
    },
  );

  return router;
}

const router: IRouter = createChachaCallRouter();
export default router;
