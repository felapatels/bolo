import { createHash } from "node:crypto";
import {
  CHACHA_TTS_INSTRUCTIONS,
  CHACHA_TTS_INSTRUCTIONS_DIGEST,
  CHACHA_TTS_MODEL,
  CHACHA_TTS_PROVIDER,
  CHACHA_TTS_VOICE,
} from "./chachaStrings";

/**
 * Chacha-ji's phone call: the script, the agenda and the turn budget.
 *
 * A CALL IS AN EVENT, NOT A LESSON (owner ruling, 2026-08-28). Every other
 * speaking surface in Bolo is framed as practice and is scored. This one is
 * not, and the absence is structural rather than a promise: nothing in this
 * module or in the turn it drives produces a score, a band, a rubric or a
 * correction, and there is no field for one to travel in. Keeping up is the
 * skill being trained, because a real conversation does not wait.
 *
 * THE CALLER IS CHACHA-JI, NOT BOLO. Bolo was considered and reversed on
 * 2026-08-28. He already exists: chachaStrings.ts gives him a voice and three
 * lines at the chai stall, chachaEncounters.ts puts him trackside every fourth
 * station. This is the same man on the telephone, which is why his voice,
 * model, provider and delivery instructions are IMPORTED from chachaStrings
 * rather than restated. He must not sound like one person at the stall and
 * another on the phone.
 *
 * SEMI-SCRIPTED, WHICH IS WHAT MAKES THE PACE CONTROLLABLE. He works through a
 * fixed agenda, so the turn count is bounded and known before the call starts.
 * Each beat is either CANNED (a fixed line, pre-synthesized into tts_cache, no
 * model in the loop at all) or LIVE (gpt-audio hears the learner and answers in
 * character, steering to that beat's agenda item).
 *
 * THE FIRST AND LAST BEATS ARE ALWAYS CANNED, and that is a latency decision,
 * not a copy decision. Measured 2026-08-28 on this repo's own key: a live turn
 * answers in about 1.0 s warm but about 1.9 s on the first request a process
 * makes, because of connection setup. A canned opening costs nothing, and it
 * warms the connection while the learner is still listening to it, so the first
 * LIVE turn is never the cold one.
 *
 * EVERY LIVE BEAT ALSO CARRIES ITS CANNED LINE. If gpt-audio is slow, refuses,
 * or returns nothing, the beat falls back to the fixed clip and the call
 * continues in his voice. A call that degrades to its script is still a call;
 * a call that errors is a hang-up.
 */

/**
 * The video of Chacha-ji that loops behind the call.
 *
 * TWO SCENES, AND A CALL ONLY EVER USES ONE. Owner ruling, 2026-08-28: the
 * scenery differs between them (one is Chacha-ji at the wheel with a festival
 * street through the windscreen, the other has him in the back seat with a
 * market going past the side windows), so cutting between them inside a single
 * call would teleport him mid-sentence. The backdrop is therefore chosen ONCE
 * when the call is created and is fixed for the life of that call. It is
 * carried on the session rather than picked per turn precisely so no later
 * request can change it.
 *
 * BOTH CLIPS LOOP SEAMLESSLY AND THAT TOOK THREE ATTEMPTS. As delivered they
 * did not: the jump at the loop point measured 2.9x a normal frame step for
 * driving and 4.9x for backseat, which is a visible cut every few seconds. The
 * fix is a 0.4 s dissolve of each clip's TAIL into its own HEAD with the output
 * shortened to match, so the two ends are literally the same moment in the
 * source. That lands both at 1.7x and 1.9x, which is each clip's own fastest
 * ordinary motion, meaning the loop point is no longer distinguishable from
 * normal movement.
 *
 * A PING-PONG WOULD HAVE SCORED IDENTICALLY AND WAS REJECTED ON SIGHT. The
 * street travels right to left through the window in both clips, so playing
 * them backwards drives him in reverse down the road while he talks. The
 * numbers alone would have shipped it.
 *
 * `seconds` is the clip length AFTER that trim, which is why it is not a round
 * number and does not match the source files.
 */
export interface CallBackdrop {
  id: "driving" | "backseat";
  /** Asset basename, without a directory: the clients hold their own copies. */
  video: string;
  poster: string;
  seconds: number;
}

export const CALL_BACKDROPS: readonly CallBackdrop[] = [
  {
    id: "driving",
    video: "chacha-call-driving.mp4",
    poster: "chacha-call-driving-poster.jpg",
    seconds: 4.67,
  },
  {
    id: "backseat",
    video: "chacha-call-backseat.mp4",
    poster: "chacha-call-backseat-poster.jpg",
    seconds: 6.67,
  },
] as const;

/**
 * Picks the backdrop for ONE call. The chooser is injectable so tests can pin
 * it; nothing else about the call depends on which one comes back.
 */
export function pickBackdrop(random: () => number = Math.random): CallBackdrop {
  const i = Math.min(
    CALL_BACKDROPS.length - 1,
    Math.max(0, Math.floor(random() * CALL_BACKDROPS.length)),
  );
  return CALL_BACKDROPS[i];
}

/**
 * TWO CALLS, NOT ONE, ruled by the owner 2026-08-28:
 *
 *   "chacha ji's phone call game is only accessible from the games page.
 *    during the journey, the call is an interruption."
 *
 *   journey  UNSOLICITED. He rings, once per zone, zone 1 at station 3. FIVE
 *            QUESTIONS and then he says goodbye. Bounded because it is not
 *            chosen: an interruption that will not end is a nag.
 *   game     CHOSEN, from the games hub, as often as the learner likes.
 *            UNLIMITED questions; it ends when they hang up (and later, when
 *            they take a third strike). You do not ration a game somebody
 *            opened on purpose.
 *
 * DO NOT CONFLATE THEM. A session read "the game can trigger it" as a second
 * trigger for one feature and started reasoning about a shared budget. The
 * budget belongs to the interruption alone, and the games side needs an ENTRY
 * rather than a trigger.
 */
export type CallMode = "journey" | "game";

export type CallBeatMode = "canned" | "live";

export interface CallBeat {
  id: string;
  mode: CallBeatMode;
  /**
   * What he says when this beat runs canned. For a LIVE beat this is the
   * fallback, used when the model gives us nothing usable.
   */
  text: string;
  /** On-screen gloss beneath the line. "beta" stays untranslated, as it does
   * in the stall farewell: it is affection, not vocabulary. */
  english: string;
  /**
   * What he is steering the conversation to when this beat runs LIVE. This is
   * the agenda, and it is what stops the call wandering.
   */
  agenda?: string;
}

/** He opens the same way in both, and his hello carries the first question. */
const HELLO: CallBeat = {
  id: "hello",
  mode: "canned",
  text: "Arre beta! Chacha-ji bol raha hoon. Kaise ho?",
  english: "Hey beta! It's Chacha-ji calling. How are you?",
};

/** And closes the same way, when there is a close. */
const BYE: CallBeat = {
  id: "bye",
  mode: "canned",
  text: "Chalo beta, phir baat karenge. Apna khayal rakhna.",
  english: "Alright beta, we'll talk again. Take care of yourself.",
};

/**
 * The things he asks about, in order.
 *
 * Deliberately domestic and small: what you ate, who is at home, what you did.
 * A learner a few stops into a journey has words for those and not for much
 * else, and a question they cannot attempt is the failure the no-score rule
 * exists to prevent.
 */
const QUESTIONS: CallBeat[] = [
  {
    id: "khaana",
    mode: "live",
    text: "Bahut accha. Aur bolo, aaj kya khaya?",
    english: "Very good. So tell me, what did you eat today?",
    agenda: "React warmly to whatever they just said, then ask what they ate today.",
  },
  {
    id: "ghar",
    mode: "live",
    text: "Waah. Ghar pe sab theek hai?",
    english: "Lovely. Is everyone well at home?",
    agenda: "React warmly to whatever they just said, then ask who is at home with them.",
  },
  {
    id: "stall",
    mode: "live",
    text: "Waah. Aaj stall pe bahut bheed thi, chai khatam ho gayi!",
    english: "Lovely. The stall was so busy today, we ran out of chai!",
    agenda:
      "React warmly to whatever they just said, then tell them one small thing about your chai stall today and ask if they like chai.",
  },
  {
    id: "din",
    mode: "live",
    text: "Achha! Aaj tumne kya kiya?",
    english: "I see! What did you do today?",
    agenda: "React warmly to whatever they just said, then ask what they did today.",
  },
];

/** How many questions the JOURNEY call asks, counting his hello. */
export const JOURNEY_QUESTIONS = 5;

/**
 * The GAME's ceiling, in learner turns. Owner ruling, 2026-08-28: "lets put max
 * 20 turns on games."
 *
 * A chosen game is not rationed the way an interruption is, but it still has to
 * END. Without a ceiling a call runs until the learner hangs up, which sounds
 * generous and is actually a game with no finish: nothing to reach, and a
 * session that only ever stops because somebody got bored. Twenty turns is
 * roughly five minutes of talking, and it is the OTHER way out beside three
 * strikes rather than a replacement for it.
 */
export const GAME_MAX_TURNS = 20;

/**
 * The journey call, start to finish. His hello is question one, then four live
 * questions, then goodbye: five questions and five turns for the learner.
 */
export const JOURNEY_BEATS: readonly CallBeat[] = [
  HELLO,
  ...QUESTIONS.slice(0, JOURNEY_QUESTIONS - 1),
  BYE,
] as const;

/**
 * The beat at an index.
 *
 * The JOURNEY call runs out of beats, which is what ends it. The GAME call
 * never does: past the opening it cycles the questions forever, so it ends only
 * when the learner hangs up. Cycling rather than repeating one question keeps a
 * long game from becoming an interrogation about lunch.
 */
export function beatAt(mode: CallMode, index: number): CallBeat | undefined {
  if (index < 0) return undefined;
  if (index === 0) return HELLO;
  if (mode === "journey") return JOURNEY_BEATS[index];
  // The game: his hello, then questions cycling until the ceiling, then
  // goodbye. Cycling rather than repeating one question keeps a long game from
  // becoming an interrogation about lunch.
  if (index >= GAME_MAX_TURNS) return index === GAME_MAX_TURNS ? BYE : undefined;
  return QUESTIONS[(index - 1) % QUESTIONS.length];
}

/** The index of the farewell, after which there is nothing. */
function lastIndex(mode: CallMode): number {
  return mode === "journey" ? JOURNEY_BEATS.length - 1 : GAME_MAX_TURNS;
}

/** True when this index is the beat the call ends on. */
export function isFinalBeat(mode: CallMode, index: number): boolean {
  return index === lastIndex(mode);
}

/** True once the call has run out of beats. */
export function callHasRunOut(mode: CallMode, index: number): boolean {
  return index > lastIndex(mode);
}

/** How many times the learner speaks before he says goodbye. */
export function learnerTurnsFor(mode: CallMode): number {
  return lastIndex(mode);
}

/** Ordered ids of every beat that can appear, for prewarm and for tests. */
export const CALL_BEAT_IDS: readonly string[] = [
  HELLO.id,
  ...QUESTIONS.map((q) => q.id),
  BYE.id,
];

/** Every beat, for callers that need the whole set rather than a sequence. */
export const CALL_BEATS: readonly CallBeat[] = [HELLO, ...QUESTIONS, BYE];

/**
 * What he says when the learner's audio arrives empty or undecodable.
 *
 * HE IS DELIGHTED BY ANYTHING THEY SAY, AND THAT HAS TO INCLUDE NOTHING. He
 * does not ask them to repeat, does not press, and does not mark the turn as
 * failed: he says it does not matter and moves to the next beat. Pressing a
 * shy learner for a second attempt is the pressure this feature was designed
 * to avoid.
 */
export const CALL_NOTHING_HEARD: { text: string; english: string } = {
  text: "Koi baat nahi, beta. Sunkar hi accha laga.",
  english: "No matter, beta. It was good just to hear you.",
};

/** Every fixed clip a call can play, including the nothing-heard line. */
export const CALL_CANNED_LINES: Record<string, { text: string; english: string }> = {
  ...Object.fromEntries(
    CALL_BEATS.map((b) => [b.id, { text: b.text, english: b.english }]),
  ),
  nothingHeard: CALL_NOTHING_HEARD,
};

/**
 * Version tag baked into the call clips' cache keys. Bump when any LINE'S
 * WORDING above changes, so the stale clip is orphaned rather than served.
 *
 * v2, 2026-08-28: the key gained a LANGUAGE segment. He is localized on the
 * call now (owner ruling, see the prompt below), so a key without a language
 * would serve the first learner's language to every learner after them. v1
 * clips are orphaned deliberately.
 * The voice, model, provider and instructions rotate the key on their own
 * through the segments below.
 */
export const CALL_CACHE_KEY_VERSION = "v2";

/**
 * Cache key for one canned call line, in its OWN namespace.
 *
 * Separate from chachaAudioCacheKey's `bolo-chacha-` prefix on purpose: the
 * stall lines and the call lines are different recordings of the same man, and
 * rewording one must never orphan or collide with the other. Same discipline,
 * different namespace, which is the pattern chachaStrings itself set when it
 * refused to share the phrase-audio identity.
 */
export function callLineCacheKey(
  lineKey: string,
  languageCode: string,
  provider: string = CHACHA_TTS_PROVIDER,
  model: string = CHACHA_TTS_MODEL,
  voice: string = CHACHA_TTS_VOICE,
  instructionsDigest: string = CHACHA_TTS_INSTRUCTIONS_DIGEST,
): string {
  const lang = languageCode.trim().toLowerCase() || "und";
  return `bolo-chacha-call-${CALL_CACHE_KEY_VERSION}::${provider}::${model}::${voice}::${instructionsDigest}::${lang}::${lineKey}`;
}

/**
 * The system prompt for a LIVE beat.
 *
 * THE NO-DIRECTIONS RULE IS INHERITED, NOT INVENTED. `parrotChat.ts` lost its
 * whole "pointing at the rest of the app" block on 2026-08-28 after the owner
 * caught Bolo telling a learner the bazaar was on the Home screen. Chacha-ji is
 * on a telephone and can see their screen even less than she could, so a
 * confident wrong direction is worse from him. The two personas must not
 * diverge on this.
 *
 * Built fresh per beat because the agenda line changes; everything above it is
 * byte-identical across every call and every learner, so the constant prefix
 * below stays eligible for OpenAI's automatic prompt caching. Keep all
 * request-specific text in the agenda tail for the same reason.
 */
export const CALL_PERSONA_PROMPT = `You are Chacha-ji, and you have telephoned the learner. You are the same man who runs the roadside chai stall they visit on their journey.

${CHACHA_TTS_INSTRUCTIONS}

You are on a phone call, not in a lesson.

You are DELIGHTED by anything the learner says, however small, however wrong, in whatever language it comes out. You never correct them. You never score them. You never grade them or tell them how they did. If they manage only one word, that word is wonderful.

If they say almost nothing, carry the call yourself and move on cheerfully. Never ask them to repeat themselves.

Speak the way you speak at the stall, warm and unhurried, but SPEAK THE LEARNER'S OWN LANGUAGE, named below. Simple, everyday words a beginner has a chance of catching. Keep every turn to ONE OR TWO SHORT SENTENCES. You are on the telephone and they are waiting for you.

WRITE YOUR WORDS IN THE NATIVE SCRIPT OF THAT LANGUAGE, not in Latin letters. The learner sees your line twice on screen, once in the real script and once romanized underneath, so the script is what they are here to learn to read.

NEVER TELL THEM WHERE ANYTHING IS IN THE APP. You are on the telephone and you cannot see their screen. Do not name a screen, a tab, a button or a menu, and do not tell them to go anywhere or tap anything. If they ask, say warmly that you cannot see what they are looking at, and go back to the conversation.`;

export function buildLivePrompt(beat: CallBeat, languageName: string): string {
  const agenda = beat.agenda ?? "Say something warm and then say goodbye.";
  // Language first, because it governs every word of the reply; the agenda is
  // what he does inside it. Both sit AFTER the byte-identical persona prefix so
  // that prefix stays eligible for automatic prompt caching.
  return `${CALL_PERSONA_PROMPT}\n\nThe learner is learning ${languageName}. Speak ${languageName}.\n\nRight now, do this: ${agenda}`;
}

/** Digest of the persona prompt, so a prompt edit is visible in logs. */
export const CALL_PERSONA_DIGEST = createHash("sha256")
  .update(CALL_PERSONA_PROMPT)
  .digest("hex")
  .slice(0, 8);
