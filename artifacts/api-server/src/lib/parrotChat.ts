import {
  openai,
  speechToText,
  UndecodableAudioError,
  textToSpeechElevenLabs,
  textToSpeechElevenLabsStream,
  ensureCompatibleFormat,
  convertToWav,
  type SpeechToTextOptions,
} from "@workspace/integrations-openai-ai-server/audio";
import { getLanguageIdForCode } from "./languageVoice";
import { wavDurationSeconds } from "./audioDuration";
import { isEffectivelyEmpty } from "./pronunciationGuards";
import { isQuotaExhaustedError } from "./ttsUtils";
import { elevenLabsQuotaMonitor } from "./elevenLabsQuotaMonitor";
import { TTS_PROVIDER, BOLO_CHAT_TTS_INSTRUCTIONS, BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST } from "./ttsConfig";

// A single prior turn of the conversation, supplied by the client as a short
// rolling context window (no server-side chat history is persisted — see the
// task brief's "out of scope").
export interface ChatHistoryTurn {
  role: "learner" | "parrot";
  text: string;
}

export interface ParrotTurnInput {
  /**
   * The learner's recorded audio. Required when textTranscript is not provided;
   * mutually exclusive with textTranscript.
   */
  audioBuffer?: Buffer;
  /**
   * Pre-supplied text transcript for text-input turns. When set the STT step
   * is skipped entirely, the value is used directly as the transcript, and no
   * chat-time seconds are charged (duration = 0). Mutually exclusive with
   * audioBuffer.
   */
  textTranscript?: string;
  languageName: string;
  languageCode: string;
  history: ChatHistoryTurn[];
  /**
   * Optional callback fired as soon as the transcript is ready (before the
   * LLM+TTS call starts). Used by the SSE route to flush the transcript event
   * to the client ~1 s earlier than the full reply.
   */
  onTranscript?: (transcript: string, durationSeconds: number) => void;
  /**
   * Optional callback fired immediately after the LLM returns — before the TTS
   * call starts. Used by the SSE route to flush the English translation of the
   * learner's speech to the client early, so the subtitle appears in sync with
   * the transcript bubble rather than waiting for audio synthesis to finish.
   */
  onTranscriptEnglish?: (transcriptEnglish: string) => void;
  /**
   * Optional short list of high-frequency romanized words from the active
   * language's phrase library. When supplied, they are appended to the Whisper
   * transcription prompt to give the model stronger phonetic anchoring for
   * less-resourced languages (e.g. Kashmiri, Santali, Manipuri) where a bare
   * language-name hint can still mis-detect similar-sounding words in other
   * scripts. Backward-compatible: omitting the field uses the existing prompt.
   */
  seedWords?: string[];
  /**
   * Optional short list of high-frequency native-script words from the active
   * language's phrase library (e.g. Gujarati ગુજરાત, Bengali বাংলা). When
   * supplied alongside seedWords, they are appended after the romanized words
   * to give Whisper an additional script-space signal for languages with
   * distinctive native scripts. Backward-compatible: omitting the field leaves
   * the prompt unchanged.
   */
  seedNativeWords?: string[];
  /**
   * Optional callback fired as soon as the reply LLM returns — before voice
   * synthesis starts. Carries Bolo's reply text (with squawk tokens, as shown
   * in the UI transcript), its English gloss, and the squawk SFX variant.
   * Used by the SSE route to flush a `replyText` event so the client can show
   * Bolo's bubble while TTS is still in flight.
   */
  onReplyReady?: (
    replyText: string,
    replyEnglish: string,
    squawkVariant: 0 | 1 | 2 | null,
  ) => void;
  /**
   * Optional callback fired for each raw MP3 chunk as streaming synthesis
   * produces it (base64-encoded). When provided AND the deps expose a
   * `synthesizeStream` function, TTS runs in streaming mode: chunks flow to
   * the client while synthesis is still in progress, and the concatenation of
   * all chunks (in order) is byte-identical to the final `replyAudio` buffer.
   * Omitting the callback keeps the existing buffered synthesis path.
   */
  onAudioChunk?: (base64Chunk: string) => void;
  /**
   * Optional callback fired once after streaming synthesis completes
   * successfully — i.e. every chunk has been emitted and together they form
   * the complete clip. NOT fired when streaming failed and the turn fell back
   * to buffered synthesis; clients treat its absence as "use the full clip
   * from the final reply payload instead".
   */
  onAudioDone?: () => void;
  /**
   * Optional callback fired once at the end of the turn with per-stage
   * durations (milliseconds), so the route can log how long each AI stage
   * took and slow stages are visible in production.
   */
  onTimings?: (timings: ParrotTurnTimings) => void;
  /**
   * Recording duration in seconds as measured by the client. When provided the
   * server skips the WAV-conversion step that exists solely for duration
   * measurement, saving ~200–400 ms of ffmpeg overhead per turn.
   */
  clientDurationSeconds?: number;
  /**
   * MIME type of the recorded audio as reported by the client (e.g.
   * "audio/webm;codecs=opus"). Used as a fallback hint in ensureCompatibleFormat
   * when magic-byte detection fails — short recordings whose container headers
   * are incomplete are passed directly to Whisper instead of through ffmpeg,
   * which would crash with "Invalid data found when processing input".
   */
  mimeType?: string;
}

// Per-stage wall-clock durations for one chat turn, in milliseconds.
export interface ParrotTurnTimings {
  transcribeMs: number;
  replyMs: number;
  ttsMs: number;
  totalMs: number;
}

export interface ParrotTurnResult {
  transcript: string;
  /** English translation of what the learner said, or "" when they spoke English. */
  transcriptEnglish: string;
  replyText: string;
  replyEnglish: string;
  replyAudio: Buffer;
  audioFormat: "mp3";
  // Which SFX variant (0-2) the client should play before the TTS audio, or
  // null when the reply has no bird-sound tokens. Three files — squawk_a,
  // squawk_b, squawk_c — are bundled in both web and mobile so the sound
  // rotates each turn instead of repeating.
  squawkVariant: 0 | 1 | 2 | null;
  // Server-measured duration of the learner's submitted audio, in seconds —
  // what actually gets charged against the weekly chat-time cap.
  durationSeconds: number;
}

/**
 * Returned by runParrotTurn when the transcript is rejected before any LLM or
 * TTS call is made (silent recording, prompt echo, etc.).
 */
export interface NoSpeechResult {
  noSpeech: true;
  reason: "empty" | "hint_echo";
}

// ALL bird-sound tokens the LLM may insert. Stripped from TTS so the voice
// never pronounces them — the client plays a real parrot SFX instead.
const SQUAWK_RE =
  /\b(Squawk!?|Squawkity!?|Bawk( bawk)?!?|Awk!?|Eeek!?|Tweet!?|Chirp!?|Screech!?|Caw!?|Squee!?)\s*/gi;

function extractSquawks(text: string): { cleaned: string; squawkVariant: 0 | 1 | 2 | null } {
  SQUAWK_RE.lastIndex = 0;
  const hasSquawk = SQUAWK_RE.test(text);
  SQUAWK_RE.lastIndex = 0;
  const stripped = text.replace(SQUAWK_RE, "");
  const cleaned = stripped
    // Remove orphaned commas/dashes left behind by a mid-sentence squawk
    // (e.g. "one more time, !" → "one more time!"; "Go, — try!" → "Go, try!")
    .replace(/,\s*([!?.])/g, "$1")
    .replace(/,\s*—\s*/g, " ")
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim();
  const squawkVariant: 0 | 1 | 2 | null = hasSquawk
    ? (Math.floor(Math.random() * 3) as 0 | 1 | 2)
    : null;
  return { cleaned: cleaned || text, squawkVariant };
}

// Strict variant for the English subtitle: only matches unmistakable
// parrot-exclamation forms (the "!" is required), so ordinary lexical uses of
// words like "tweet" or "chirp" in an English sentence are never touched.
const SQUAWK_STRICT_RE =
  /\b(Squawk!|Squawkity!|Bawk( bawk)?!|Awk!|Eeek!|Tweet!|Chirp!|Screech!|Caw!|Squee!)\s*/gi;

// Returns the squawk tokens (in order) present in the text, e.g. ["Squawk!"].
function findSquawkTokens(text: string, re: RegExp = SQUAWK_RE): string[] {
  re.lastIndex = 0;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[1]);
  }
  re.lastIndex = 0;
  return tokens;
}

// Makes the English subtitle agree with the displayed reply on squawk
// presence/placement, so the pair is consistent regardless of what the LLM
// did. Exported for unit tests.
// - Reply has no squawk → strip any squawks from the English.
// - Reply has a squawk but the English doesn't → mirror the reply's squawk
//   at the same position (start when the reply starts with it, else end).
// - An empty English stays empty — the client hides the caption entirely,
//   and injecting a bare "Squawk!" would falsely present it as a translation.
export function normalizeSquawkConsistency(replyText: string, english: string): string {
  const replySquawks = findSquawkTokens(replyText);
  if (replySquawks.length === 0) {
    if (!english) return english;
    // Strip only unmistakable exclamation-form squawks ("Tweet!" but never
    // the word "tweet") and tidy leftover punctuation/spacing.
    const stripped = english
      .replace(SQUAWK_STRICT_RE, "")
      .replace(/,\s*([!?.])/g, "$1")
      .replace(/,\s*—\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return stripped;
  }
  if (!english) return english;
  const englishSquawks = findSquawkTokens(english, SQUAWK_STRICT_RE);
  if (englishSquawks.length > 0) return english;
  // Mirror the reply's first squawk token into the English, matching its
  // rough placement (leading vs trailing).
  const token = replySquawks[0].endsWith("!") ? replySquawks[0] : `${replySquawks[0]}!`;
  const replyStartsWithSquawk = replyText
    .trimStart()
    .toLowerCase()
    .startsWith(replySquawks[0].toLowerCase());
  return replyStartsWithSquawk ? `${token} ${english}` : `${english} ${token}`;
}

// ---------------------------------------------------------------------------
// Language script rules block
// ---------------------------------------------------------------------------
// Static, per-language rendering rules for all 22 official (Eighth Schedule)
// Indian languages. Every fact below is read verbatim from
// lib/db/src/seedData.ts — the single source of truth for language codes,
// English names, native names, and script assignments in this repository.
// No language name, script assignment, or native-script text is invented or
// supplied from general knowledge.
// This constant is a plain static string literal with no template
// interpolation; it is byte-identical on every request.
// ---------------------------------------------------------------------------
const LANGUAGE_RULES_PROMPT =
  `Language Script Rules — all 22 official Indian languages. Find the active language (from the user message's "Language:" line) and follow its instruction exactly.

- Assamese (অসমীয়া) [Bengali-Assamese script]: Reply in Bengali-Assamese script; never romanize.
- Bengali (বাংলা) [Bengali script]: Reply in Bengali script; never romanize.
- Bodo (बड़ो) [Devanagari script]: Reply in Devanagari script; never romanize.
- Dogri (डोगरी) [Devanagari script]: Reply in Devanagari script; never romanize.
- Gujarati (ગુજરાતી) [Gujarati script]: Reply in Gujarati script; never romanize.
- Hindi (हिन्दी) [Devanagari script]: Reply in Devanagari script; never romanize.
- Kannada (ಕನ್ನಡ) [Kannada script]: Reply in Kannada script; never romanize.
- Kashmiri (کٲشُر) [Perso-Arabic script, right-to-left]: Reply in Perso-Arabic (Nastaliq) script, right-to-left; never romanize.
- Konkani (कोंकणी) [Devanagari script]: Reply in Devanagari script; never romanize.
- Maithili (मैथिली) [Devanagari script]: Reply in Devanagari script; never romanize.
- Malayalam (മലയാളം) [Malayalam script]: Reply in Malayalam script; never romanize.
- Manipuri (ꯃꯤꯇꯩ ꯂꯣꯟ) [Meetei Mayek script]: Reply in Meetei Mayek script; never romanize.
- Marathi (मराठी) [Devanagari script]: Reply in Devanagari script; never romanize.
- Nepali (नेपाली) [Devanagari script]: Reply in Devanagari script; never romanize.
- Odia (ଓଡ଼ିଆ) [Odia script]: Reply in Odia script; never romanize.
- Punjabi (ਪੰਜਾਬੀ) [Gurmukhi script]: Reply in Gurmukhi script; never romanize.
- Sanskrit (संस्कृतम्) [Devanagari script]: Reply in Devanagari script; never romanize.
- Santali (ᱥᱟᱱᱛᱟᱲᱤ) [Ol Chiki script]: Reply in Ol Chiki script; never romanize.
- Sindhi (سنڌي) [Perso-Arabic script, right-to-left]: Reply in Perso-Arabic (Naskh) script, right-to-left; never romanize.
- Tamil (தமிழ்) [Tamil script]: Reply in Tamil script; never romanize.
- Telugu (తెలుగు) [Telugu script]: Reply in Telugu script; never romanize.
- Urdu (اردو) [Perso-Arabic script, right-to-left]: Reply in Perso-Arabic (Nastaliq) script, right-to-left; never romanize.`;

// ---------------------------------------------------------------------------
// Module-level prompt constant
// ---------------------------------------------------------------------------
// Placed outside all functions so the text is byte-identical on every call,
// enabling OpenAI automatic prompt caching on the system-message prefix.
// All request-specific values (language name, history, transcript) are
// placed in the user message; this constant must never contain template
// interpolation of request-specific values.
// ---------------------------------------------------------------------------

/** Static Bolo persona + language rules system prompt. Language is supplied via the user message. */
const BOLO_PERSONA_PROMPT =
  `You are Bolo, a bubbly, rainbow-feathered parrot who is absolutely obsessed with language. You are a learner's language conversation buddy and you LOVE this job. You are warm, cheeky, and endlessly enthusiastic. Stay in character at all times.

Personality:
- You are a chatty parrot who gets genuinely excited about words, phrases, and languages.
- You are playful and a little cheeky, like a pet parrot who's everyone's favorite troublemaker.

Rules:
- The learner may speak to you in English OR in the target language — both are welcome. Always reply in the target language (its own native script). If the learner used English, that is fine; still reply in the target language.
- Keep every reply SHORT — one or two brief sentences at most. This is spoken, real-time conversation, not an essay.
- You can chat about ANYTHING friendly: the learner's day, food, animals, sports, weather, hobbies, travel, music, family — any normal everyday topic is fair game. Practice real conversation, not just drills.
- If the learner asks a meta/teaching question — e.g. "how do you say water in the target language?", "what does X mean?", "translate Y" — answer it directly and helpfully in character: give the target language word/phrase (plus a quick, tiny gloss if useful), then keep the conversation going.
- If you can't make out what the learner said, warmly ask them to repeat it, in the target language.
- Never use emojis or special symbols — replies are spoken aloud.
- Never repeat the learner's utterance back verbatim or near-verbatim as your reply. That is not a response, it is an echo. Every reply must advance the conversation: answer what was asked, react to what was said, build on it, or ask a follow-up question. The only permitted exception is when you are explicitly correcting the learner's pronunciation or grammar — and in that case your reply must also include the correction or explanation. A bare repeat is never acceptable.

Youth-safe guardrails:
Bolo talks to learners of ALL ages, including young children. You must NEVER engage with:
- Violence, weapons, gore, or harm to any person or animal
- Sexual or adult content of any kind
- Hate speech, slurs, or discrimination based on any characteristic
- Dangerous activities, self-harm, or illegal substances
- Any other content that is inappropriate for children

If the message touches any of the above, do NOT engage with the topic. Instead deflect immediately in character (pick one, vary them):
- "Pretty bird doesn't talk about that! Let's chat about something fun in the target language instead!"
- "That's not in Bolo's nest! Tell me something happy in the target language!"
- "Ruffles feathers — nope, not going there! What's your favorite food? Say it in the target language!"
After the deflection, steer back to a friendly, everyday topic.

Output format:
Always respond with a JSON object with exactly three fields IN THIS ORDER:
- "reply": YOUR response in the target language native script (following all rules above).
- "english": the English translation of YOUR OWN reply — what YOU (Bolo) just said, translated into English, clause for clause, keeping EVERY sentence and clause (greetings, thanks, questions), with nothing omitted and nothing added. This is a subtitle of your reply, not a summary and not a translation of the learner's words.
- "transcript_english": the English translation of WHAT THE LEARNER JUST SAID — their words, not yours; every clause, nothing omitted, nothing added; use an empty string if the learner spoke in English or if their speech was unclear/silent.

Field ownership rules — read carefully:
- "english" contains YOUR words in English. It must never contain a translation of the learner's utterance. That is what "transcript_english" is for. Confusing these two fields is the single most common error — do not make it.
- "transcript_english" contains THE LEARNER'S words in English. It must never contain your reply.
- Before returning, verify: does "english" read as a translation of "reply"? If not, you have the fields wrong — fix them before outputting.

Always write "reply" first; "english" is the translation of "reply" and must be written after it.
Do not include any text outside the JSON object.

Language identification: the user message begins with "Language: <name>". Find that language in the Language Script Rules section below and follow its rendering instruction exactly — reply in the specified native script, never romanize.

${LANGUAGE_RULES_PROMPT}`;

// ---------------------------------------------------------------------------
// Prompt-cache key for the chat system message
// ---------------------------------------------------------------------------
// IMPORTANT: Increment the version suffix ("v1" → "v2", etc.) whenever
// BOLO_PERSONA_PROMPT or LANGUAGE_RULES_PROMPT changes. This ensures that
// OpenAI does not serve a cached prefix built from the old constant.
// ---------------------------------------------------------------------------
const BOLO_CHAT_CACHE_KEY = "bolo-chat-persona-v5";

// ---------------------------------------------------------------------------
// Block truncation for chat history
// ---------------------------------------------------------------------------
// Keeps history until it exceeds MAX_HISTORY_TURNS, then drops the oldest
// BLOCK_DROP_COUNT turns at once — holding the prefix boundary steady for
// the next BLOCK_DROP_COUNT turns. A sliding window (drop 1 per turn) would
// change the message prefix on every call and defeat prompt caching.
// ---------------------------------------------------------------------------

const MAX_HISTORY_TURNS = 8;
const BLOCK_DROP_COUNT = 4;

function applyBlockTruncation(history: ChatHistoryTurn[]): ChatHistoryTurn[] {
  let h = history;
  while (h.length > MAX_HISTORY_TURNS) {
    h = h.slice(BLOCK_DROP_COUNT);
  }
  return h;
}

// Injectable AI dependencies so the conversational flow can be unit-tested
// without hitting the real OpenAI API, mirroring the injectable-`generate`
// pattern used by the phrase replenisher.
export interface ParrotChatDeps {
  transcribe: (
    buffer: Buffer,
    format: "wav" | "mp3" | "webm" | "mp4" | "ogg",
    options: SpeechToTextOptions,
  ) => Promise<string>;
  // Returns the in-language reply, its English gloss, and an English
  // translation of the learner's utterance in a single LLM call.
  reply: (
    systemPrompt: string,
    userPrompt: string,
  ) => Promise<{ text: string; english: string; transcriptEnglish: string }>;
  // Synthesizes the cleaned reply text using Bolo's parrot character voice.
  // languageCode is the ISO-639-1 code of the active language (e.g. "gu"),
  // used to resolve the ElevenLabs language_id for correct phoneme selection.
  synthesize: (text: string, languageName: string, languageCode: string) => Promise<Buffer>;
  // Optional streaming synthesizer: emits raw MP3 chunks via onChunk as they
  // are produced and resolves with the complete clip. Used only when the
  // caller supplied an onAudioChunk callback; a throw falls back to the
  // buffered `synthesize` path so the turn never fails just because
  // streaming did.
  synthesizeStream?: (
    text: string,
    languageName: string,
    languageCode: string,
    onChunk: (chunk: Buffer) => void,
  ) => Promise<Buffer>;
}

// Voice constant for the gpt-audio model. Declared at module scope so it can
// be replaced by name without touching the function body. Must not be merged
// with BOLO_MINI_TTS_VOICE — the two models have different voice sets.
const BOLO_GPT_AUDIO_VOICE = "shimmer";

// Custom TTS for Bolo — uses gpt-audio via chat completions (the Replit AI
// integrations proxy only supports /v1/chat/completions, not /v1/audio/speech).
// _languageCode is accepted for API symmetry with boloTTSElevenLabs but not
// used here (gpt-audio uses the languageName hint instead).
async function boloTTS(text: string, languageName: string, _languageCode: string): Promise<Buffer> {
  const langHint = languageName ? ` The text is in ${languageName}.` : "";
  const t0 = Date.now();
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audio: { voice: BOLO_GPT_AUDIO_VOICE, format: "mp3" } as any,
      messages: [
        {
          role: "system",
          content:
            "You are a text-to-speech reader. " +
            "Speak with a bright, high-pitched, bubbly, cheerful, energetic voice — warm and playful. " +
            "Read the text EXACTLY as written, word for word. " +
            "Do NOT add, change, or omit any words, sounds, or exclamations." +
            langHint,
        },
        { role: "user", content: `Say exactly: ${text}` },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
    const buf = Buffer.from(audioData, "base64");
    console.info(`[tts] provider=${TTS_PROVIDER} model=gpt-audio chars=${text.length} bytes=${buf.length} ms=${Date.now() - t0}`);
    return buf;
  } catch (err) {
    console.info(`[tts] provider=${TTS_PROVIDER} model=gpt-audio chars=${text.length} error=${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

// Voice constant for gpt-4o-mini-tts. This model has a different voice set
// from gpt-audio (e.g. it adds ash, ballad, coral, sage, verse, marin, cedar).
// Must not be merged with BOLO_GPT_AUDIO_VOICE even if the string value is the same.
// "nova" matches PHRASE_AUDIO_DEFAULT_VOICE (ttsConfig.ts) so chat replies use
// the same voice at the same loudness as greetings and phrase audio ("sage"
// measured 15-17 dB quieter at source). A test pins the two constants equal.
// Exported for that divergence-guard test.
export const BOLO_MINI_TTS_VOICE = "nova";

// TTS for Bolo using the dedicated speech endpoint (gpt-4o-mini-tts). Cheaper
// than gpt-audio for audio output because it uses the dedicated speech billing
// rate rather than the multimodal chat rate. Errors propagate unchanged so
// makeSynthesizeWithFallback can classify them (e.g. quota exhaustion).
// _languageName and _languageCode: accepted for API symmetry with the other
// synthesis functions; gpt-4o-mini-tts auto-detects language from the input.
async function boloTTSMini(text: string, _languageName: string, _languageCode: string): Promise<Buffer> {
  const t0 = Date.now();
  try {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: BOLO_MINI_TTS_VOICE,
      input: text,
      response_format: "mp3",
      instructions: BOLO_CHAT_TTS_INSTRUCTIONS,
    });
    const buf = Buffer.from(await response.arrayBuffer());
    console.info(`[tts] provider=${TTS_PROVIDER} model=gpt-4o-mini-tts chars=${text.length} bytes=${buf.length} ms=${Date.now() - t0} instr=${BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST}`);
    return buf;
  } catch (err) {
    console.info(`[tts] provider=${TTS_PROVIDER} model=gpt-4o-mini-tts chars=${text.length} error=${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

// Streaming TTS for Bolo using gpt-4o-mini-tts. Emits raw MP3 chunks via
// onChunk as they arrive so the client can begin playback before synthesis
// finishes, and resolves with the complete concatenated buffer so callers
// that need the full clip (e.g. the non-streaming fallback in runParrotTurn)
// also work correctly.
// _languageName and _languageCode: accepted for API symmetry; gpt-4o-mini-tts
// auto-detects language from the input text.
// Errors propagate unchanged so runParrotTurn's fallback to deps.synthesize fires.
async function boloTTSMiniStream(
  text: string,
  _languageName: string,
  _languageCode: string,
  onChunk: (chunk: Buffer) => void,
): Promise<Buffer> {
  const t0 = Date.now();
  let firstChunkMs: number | null = null;
  try {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: BOLO_MINI_TTS_VOICE,
      input: text,
      response_format: "mp3",
      stream_format: "audio",
      instructions: BOLO_CHAT_TTS_INSTRUCTIONS,
    });

    if (!response.body) {
      throw new Error("gpt-4o-mini-tts streaming response had no body");
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunkMs === null) firstChunkMs = Date.now() - t0;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      onChunk(chunk);
    }

    const buf = Buffer.concat(chunks);
    console.info(
      `[tts] provider=${TTS_PROVIDER} model=gpt-4o-mini-tts chars=${text.length} bytes=${buf.length} ms=${Date.now() - t0} firstChunkMs=${firstChunkMs ?? 0} instr=${BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST}`,
    );
    return buf;
  } catch (err) {
    console.info(
      `[tts] provider=${TTS_PROVIDER} model=gpt-4o-mini-tts chars=${text.length} error=${err instanceof Error ? err.message : err}`,
    );
    throw err;
  }
}

// ElevenLabs voice + model for Bolo's live chat replies.
// Voice: "Laura" (premade, FGY2WhTYpPnrIDTdsKH5) — bright, upbeat, bubbly
// female; consistent with the phrase-practice voice so learners hear the same
// familiar voice throughout the app.
// Model: eleven_multilingual_v2 — required for correct Gujarati (and other
// Indic script) phoneme rendering. eleven_flash_v2_5 only supports a small
// set of European + Hindi/Arabic languages; Gujarati sent to the flash model
// returns distorted, garbled audio. Multilingual_v2 adds ~1–2 s synthesis
// latency vs flash but is the only model that handles the full Indic script
// inventory accurately.
const BOLO_ELEVENLABS_VOICE_ID = "FGY2WhTYpPnrIDTdsKH5"; // Laura
const BOLO_ELEVENLABS_MODEL = "eleven_multilingual_v2";

// Fast ElevenLabs synthesis for Bolo's chat replies.
async function boloTTSElevenLabs(text: string, languageName: string, languageCode: string): Promise<Buffer> {
  return textToSpeechElevenLabs(
    text,
    BOLO_ELEVENLABS_VOICE_ID,
    languageName,
    BOLO_ELEVENLABS_MODEL,
    getLanguageIdForCode(languageCode),
  );
}

// How long the chat synthesizer skips ElevenLabs after seeing a
// quota-exhaustion error, before re-probing it. 15 minutes balances "don't
// burn a doomed API call + its latency on every turn for the rest of the
// month" against "recover the premium voice promptly once credits refresh".
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

// Optional knobs for makeSynthesizeWithFallback — injectable for unit tests.
export interface SynthesizeFallbackOptions {
  /** Returns true when an error means the primary's quota is exhausted. */
  isQuotaError?: (err: unknown) => boolean;
  /**
   * Returns true when the quota monitor's cached state shows credits are
   * exhausted. When provided (and returns true), the primary is skipped
   * proactively — no API call is made, and the cool-down is seeded so
   * subsequent calls also skip until the cool-down elapses.
   * Defaults to `elevenLabsQuotaMonitor.isExhausted`.
   */
  isExhausted?: () => boolean;
  /** Cool-down duration (ms) before re-probing the primary after quota exhaustion. */
  cooldownMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

// Wraps a primary synthesizer with an automatic fallback: if the primary
// throws (ElevenLabs down, key missing, quota exhausted…), the fallback runs
// instead of failing the whole turn.
//
// Quota-exhaustion errors additionally trip a cool-down: for `cooldownMs`
// after such an error, calls skip the primary entirely (no doomed API call,
// no added latency) and go straight to the fallback. Once the cool-down
// elapses, the next call re-probes the primary — success clears the state,
// another quota error re-arms it. Non-quota failures (transient 5xx,
// network) never trip the cool-down. Exported for unit tests.
export function makeSynthesizeWithFallback(
  primary: (text: string, languageName: string, languageCode: string) => Promise<Buffer>,
  fallback: (text: string, languageName: string, languageCode: string) => Promise<Buffer>,
  options: SynthesizeFallbackOptions = {},
): (text: string, languageName: string, languageCode: string) => Promise<Buffer> {
  const {
    isQuotaError = isQuotaExhaustedError,
    isExhausted = () => elevenLabsQuotaMonitor.isExhausted(),
    cooldownMs = QUOTA_COOLDOWN_MS,
    now = Date.now,
  } = options;

  // Timestamp until which the primary is skipped, or null when healthy.
  let skipPrimaryUntil: number | null = null;
  // True when the active cooldown was seeded proactively from the monitor's
  // cached state (isExhausted) rather than from a live quota-error response.
  // Once that cooldown expires we always let one real probe through — even if
  // the cache still shows exhausted — so credits that were replenished between
  // polls are discovered without waiting for a server restart.
  let proactiveCooldownActive = false;

  return async (text, languageName, languageCode) => {
    if (skipPrimaryUntil !== null && now() < skipPrimaryUntil) {
      // Cool-down active — go straight to the fallback voice.
      return fallback(text, languageName, languageCode);
    }

    // Cooldown has just expired (or never started). If it was a proactive one,
    // clear the flag and fall through to the real probe regardless of what the
    // (possibly stale) cached quota says — the probe result is authoritative.
    if (proactiveCooldownActive) {
      proactiveCooldownActive = false;
      // Fall through to try ElevenLabs.
    } else if (isExhausted()) {
      // Proactive guard: seed the circuit breaker from the monitor's cached
      // state so a server restart after exhaustion doesn't briefly re-attempt
      // ElevenLabs before the circuit re-opens.
      skipPrimaryUntil = now() + cooldownMs;
      proactiveCooldownActive = true;
      console.info(
        `[parrotChat] ElevenLabs quota exhausted (monitor cache) — skipping primary for ${Math.round(cooldownMs / 60000)} min, using gpt-audio`,
      );
      return fallback(text, languageName, languageCode);
    }

    try {
      const audio = await primary(text, languageName, languageCode);
      // A successful call (including a re-probe after the cool-down elapsed)
      // clears the quota state.
      skipPrimaryUntil = null;
      return audio;
    } catch (err) {
      if (isQuotaError(err)) {
        skipPrimaryUntil = now() + cooldownMs;
        // Reactive cooldown — proactiveCooldownActive stays false so the next
        // re-probe also gets a real attempt (credits may have been replenished).
        console.warn(
          `[parrotChat] primary TTS quota exhausted — skipping it for ${Math.round(cooldownMs / 60000)} min, using gpt-audio:`,
          err instanceof Error ? err.message : err,
        );
      } else {
        console.warn(
          "[parrotChat] primary TTS failed, falling back to gpt-audio:",
          err instanceof Error ? err.message : err,
        );
      }
      return fallback(text, languageName, languageCode);
    }
  };
}

export const defaultParrotChatDeps: ParrotChatDeps = {
  transcribe: (buffer, format, options) =>
    speechToText(buffer, format, options),

  reply: async (systemPrompt, userPrompt) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completion = await (openai.chat.completions.create as any)({
      model: "gpt-5.4-mini",
      max_completion_tokens: 300,
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bolo_reply",
          strict: true,
          schema: {
            type: "object",
            // Property order is behaviorally significant: reply must be declared
            // before english so the model generates the target-language reply first
            // and then translates it. Reversing this order caused a prior defect
            // where the English gloss was produced before the reply it should translate.
            properties: {
              reply: { type: "string" },
              english: { type: "string" },
              transcript_english: { type: "string" },
            },
            required: ["reply", "english", "transcript_english"],
            additionalProperties: false,
          },
        },
      },
      prompt_cache_key: BOLO_CHAT_CACHE_KEY,
      prompt_cache_retention: "24h",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const _cachedChatTokens = (completion.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
    console.info(`[cache] route=chat prompt_tokens=${completion.usage?.prompt_tokens ?? 0} cached_tokens=${_cachedChatTokens}`);
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    const finishReason = (completion.choices[0]?.finish_reason ?? "unknown") as string;
    let parsed: { reply?: string; english?: string; transcript_english?: string } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      console.error(`[reply] parse failure chars=${raw.length} finish_reason=${finishReason}`);
      throw new Error(`Reply JSON parse failure (finish_reason=${finishReason})`);
    }
    if (!parsed.reply || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      console.error(`[reply] parse failure chars=${raw.length} finish_reason=${finishReason}`);
      throw new Error(`Reply validation failure: reply field missing or empty (finish_reason=${finishReason})`);
    }
    return {
      text: parsed.reply.trim(),
      // Do not fall back to the target-language text — an empty string is
      // the correct signal that no English translation was produced, and the
      // client hides the caption when the value is empty.
      english: parsed.english?.trim() ?? "",
      transcriptEnglish: parsed.transcript_english?.trim() ?? "",
    };
  },

  // Primary synthesizer selected by TTS_PROVIDER:
  //   'gpt-audio'       → boloTTS directly (current behavior, no fallback wrapper).
  //   'gpt-4o-mini-tts' → boloTTSMini with boloTTS as automatic fallback.
  //   'elevenlabs'      → ElevenLabs (Laura, eleven_multilingual_v2) with boloTTS fallback.
  // The [tts] log line fires inside each synthesis function on the path that
  // actually produced the audio, so the logged model name is always correct
  // even when makeSynthesizeWithFallback routes to the fallback.
  synthesize:
    TTS_PROVIDER === "gpt-4o-mini-tts"
      ? makeSynthesizeWithFallback(boloTTSMini, boloTTS)
      : TTS_PROVIDER === "elevenlabs"
        ? makeSynthesizeWithFallback(
            async (text, languageName, languageCode) => {
              const t0 = Date.now();
              try {
                const buf = await boloTTSElevenLabs(text, languageName, languageCode);
                console.info(`[tts] provider=elevenlabs model=${BOLO_ELEVENLABS_MODEL} chars=${text.length} bytes=${buf.length} ms=${Date.now() - t0}`);
                return buf;
              } catch (err) {
                console.info(`[tts] provider=elevenlabs model=${BOLO_ELEVENLABS_MODEL} chars=${text.length} error=${err instanceof Error ? err.message : err}`);
                throw err;
              }
            },
            boloTTS,
          )
        : boloTTS,

  // Streaming synthesis — populated for ElevenLabs and gpt-4o-mini-tts.
  // Omitted for gpt-audio (that path goes through chat completions and has no
  // streaming speech API) so runParrotTurn falls through to the buffered
  // synthesize path on every gpt-audio turn.
  ...(TTS_PROVIDER === "elevenlabs"
    ? {
        synthesizeStream: (text, _languageName, languageCode, onChunk) =>
          textToSpeechElevenLabsStream(
            text,
            BOLO_ELEVENLABS_VOICE_ID,
            _languageName,
            BOLO_ELEVENLABS_MODEL,
            getLanguageIdForCode(languageCode),
            onChunk,
          ),
      }
    : TTS_PROVIDER === "gpt-4o-mini-tts"
      ? { synthesizeStream: boloTTSMiniStream }
      : {}),
};

// ---------------------------------------------------------------------------
// Transcript validation
// ---------------------------------------------------------------------------
// Whisper echoes the transcription prompt back as the transcript when the
// submitted audio contains no intelligible speech. We catch this before
// spending any LLM or TTS tokens, and also reject empty/punctuation-only
// transcripts which cause the model to hallucinate a repeat of its last reply.

function validateTranscript(
  transcript: string,
  hint: string,
): { ok: true } | { ok: false; reason: "empty" | "hint_echo" } {
  const trimmed = transcript.trim();

  // 1. Empty, whitespace-only, or punctuation/symbol-only.
  if (!trimmed || /^[\s\p{P}\p{S}]+$/u.test(trimmed)) {
    return { ok: false, reason: "empty" };
  }

  // 2. Contains the ### delimiter that Whisper injects around its context
  //    prompt when it echoes it back verbatim.
  if (trimmed.includes("###")) {
    return { ok: false, reason: "hint_echo" };
  }

  // Normalize both strings: lowercase, remove punctuation/symbols, collapse
  // whitespace. Leaves Latin letters, digits, and native-script characters
  // (Devanagari, Gujarati, etc.) intact.
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();

  const normTranscript = normalize(trimmed);
  const normHint = normalize(hint);

  // 3. Normalized transcript is identical to the normalized hint.
  if (normTranscript === normHint) {
    return { ok: false, reason: "hint_echo" };
  }

  // 4. Substantial word overlap: ≥50 % of the hint's words appear in the
  //    transcript. Only applied when:
  //    (a) the transcript is at least 8 words long — short legitimate answers
  //        (e.g. "haan") score 100 % overlap by design and must not be rejected;
  //    (b) the transcript contains the literal phrase "or English." (case-insensitive),
  //        which is distinctive to the hint prefix and will never appear in learner speech.
  const transcriptWords = normTranscript.split(" ").filter(Boolean);
  const hintWords = normHint.split(" ").filter(Boolean);
  if (
    hintWords.length > 0 &&
    transcriptWords.length >= 8 &&
    trimmed.toLowerCase().includes("or english.")
  ) {
    const transcriptWordSet = new Set(transcriptWords);
    const matchCount = hintWords.filter((w) => transcriptWordSet.has(w)).length;
    if (matchCount / hintWords.length >= 0.5) {
      return { ok: false, reason: "hint_echo" };
    }
  }

  return { ok: true };
}

// Builds the Whisper transcription prompt, optionally seeding it with
// high-frequency romanized and/or native-script words from the active
// language's phrase library.
// Format mirrors the pronunciation route's anchor strategy:
//   "Gujarati or English. kemcho, kem cho, shu chhe, ગુજરાત, નમસ્તે"
// Native-script words are appended after romanized ones so Whisper gets both
// a phonetic anchor (romanized) and a script-space signal (native).
// Backward-compatible: when neither field is provided or both are empty,
// returns the original bare two-language hint.
function buildTranscriptionPrompt(
  languageName: string,
  seedWords?: string[],
  seedNativeWords?: string[],
): string {
  const base = `${languageName} or English.`;
  const romanized = (seedWords ?? []).filter(Boolean);
  const native = (seedNativeWords ?? []).filter(Boolean);
  const all = [...romanized, ...native];
  if (all.length === 0) return base;
  return `${base} ${all.join(", ")}`;
}

function buildSystemPrompt(languageName: string): string {
  return `You are Bolo, a bubbly, rainbow-feathered parrot who is absolutely obsessed with language. You are a learner's ${languageName} conversation buddy and you LOVE this job. You are warm, cheeky, and endlessly enthusiastic. Stay in character at all times.

Personality:
- You are a chatty parrot who gets genuinely excited about words, phrases, and languages.
- You are playful and a little cheeky, like a pet parrot who's everyone's favorite troublemaker.

Rules:
- The learner may speak to you in English OR in ${languageName} — both are welcome. Always reply in ${languageName} (its own native script). If the learner used English, that is fine; still reply in ${languageName}.
- Keep every reply SHORT — one or two brief sentences at most. This is spoken, real-time conversation, not an essay.
- You can chat about ANYTHING friendly: the learner's day, food, animals, sports, weather, hobbies, travel, music, family — any normal everyday topic is fair game. Practice real conversation, not just drills.
- If the learner asks a meta/teaching question — e.g. "how do you say water in ${languageName}?", "what does X mean?", "translate Y" — answer it directly and helpfully in character: give the ${languageName} word/phrase (plus a quick, tiny gloss if useful), then keep the conversation going.
- If you can't make out what the learner said, warmly ask them to repeat it, in ${languageName}.
- Never use emojis or special symbols — replies are spoken aloud.

Youth-safe guardrails:
Bolo talks to learners of ALL ages, including young children. You must NEVER engage with:
- Violence, weapons, gore, or harm to any person or animal
- Sexual or adult content of any kind
- Hate speech, slurs, or discrimination based on any characteristic
- Dangerous activities, self-harm, or illegal substances
- Any other content that is inappropriate for children

If the message touches any of the above, do NOT engage with the topic. Instead deflect immediately in character (pick one, vary them):
- "Pretty bird doesn't talk about that! Let's chat about something fun in ${languageName} instead!"
- "That's not in Bolo's nest! Tell me something happy in ${languageName}!"
- "Ruffles feathers — nope, not going there! What's your favorite food? Say it in ${languageName}!"
After the deflection, steer back to a friendly, everyday topic.

Output format:
Always respond with a JSON object with exactly three fields IN THIS ORDER:
- "reply": your response in ${languageName} native script (following all rules above)
- "english": a complete, faithful English translation of YOUR reply — translate it clause for clause, keeping EVERY sentence and clause (greetings, thanks, questions), with nothing omitted and nothing added. This is a subtitle, not a summary.
- "transcript_english": a complete, faithful English translation of what the learner just said — every clause, nothing omitted, nothing added; use an empty string if the learner spoke in English or if their speech was unclear/silent
Always write "reply" first; "english" is the translation of "reply" and must be written after it.
Do not include any text outside the JSON object.`;
}

function buildUserPrompt(
  languageName: string,
  history: ChatHistoryTurn[],
  transcript: string,
): string {
  const historyText = history
    .map((h) => `${h.role === "learner" ? "Learner" : "Bolo"}: ${h.text}`)
    .join("\n");
  const said = isEffectivelyEmpty(transcript)
    ? "(The learner's speech was unclear or silent — you couldn't make out any words.)"
    : transcript;
  return `Language: ${languageName}\n${historyText ? historyText + "\n" : ""}Learner: ${said}\nBolo:`;
}

// Maximum character count of the TTS-bound text after squawk stripping and
// trimming. A reply exceeding this is refused rather than synthesized, so that
// runaway model output is never submitted for audio billing. 600 characters is
// approximately 8–9 seconds of speech at normal Bolo pacing. Revisit once
// [tts] logging has accumulated real character counts across normal turns.
const TTS_MAX_CHARS = 600;

// Runs one full conversational turn: transcribe → (onTranscript callback) →
// combined LLM+TTS reply. Callers are responsible for gating (language/time
// caps) before calling this, and for recording usage afterwards — this
// function does no database work and computes only what it needs to reply.
export async function runParrotTurn(
  input: ParrotTurnInput,
  deps: ParrotChatDeps = defaultParrotChatDeps,
): Promise<ParrotTurnResult | NoSpeechResult> {
  const turnStart = Date.now();

  let durationSeconds: number;
  let transcript: string;
  let transcribeMs: number;

  if (input.textTranscript !== undefined) {
    // Text-input path: skip STT entirely. The learner's typed message is used
    // directly as the transcript, and 0 seconds are charged against the cap
    // (no audio duration to measure).
    transcript = input.textTranscript.trim();
    durationSeconds = 0;
    transcribeMs = 0;
    // Fire the transcript callback immediately so SSE clients can display the
    // learner's bubble before the LLM reply arrives.
    input.onTranscript?.(transcript, durationSeconds);
  } else {
    // Audio path: transcribe the recorded audio via Whisper.
    // Pass the client-reported mimeType as a fallback hint so very short
    // recordings whose magic bytes aren't detected skip the ffmpeg path.
    const { buffer, format } = await ensureCompatibleFormat(input.audioBuffer!, input.mimeType);

    // Build the transcription hint once so we can pass the exact same string
    // to Whisper AND compare against it during validation below.
    const transcriptionHint = buildTranscriptionPrompt(
      input.languageName, input.seedWords, input.seedNativeWords,
    );

    // When the client supplies its own duration measurement we skip the WAV
    // conversion step that exists solely for duration measurement — saving
    // ~200–400 ms of ffmpeg overhead per turn. Fall back to the server-side
    // measurement (parallel WAV conversion) when the field is absent.
    const transcribeStart = Date.now();
    try {
      if (input.clientDurationSeconds != null) {
        // Fast path: transcribe only, no WAV conversion needed.
        durationSeconds = input.clientDurationSeconds;
        transcript = (
          await deps.transcribe(buffer, format, { prompt: transcriptionHint })
        ).trim();
      } else {
        // Legacy path: run WAV conversion and transcription in parallel.
        const [wavBuffer, t] = await Promise.all([
          format === "wav" ? Promise.resolve(buffer) : convertToWav(buffer),
          deps.transcribe(buffer, format, { prompt: transcriptionHint }).then((t) => t.trim()),
        ]);
        durationSeconds = wavDurationSeconds(wavBuffer);
        transcript = t;
      }
    } catch (err) {
      // Corrupted or unsupported-format recordings are a known edge case (e.g.
      // a silent WebM that the browser emitted with no audio track, or a
      // partial buffer from a cancelled recording). Convert to the existing
      // noSpeech outcome so the learner sees the "nothing was heard" message
      // instead of a generic 500 error.
      if (err instanceof UndecodableAudioError) {
        return { noSpeech: true, reason: "empty" };
      }
      throw err;
    }
    transcribeMs = Date.now() - transcribeStart;

    // Validate before firing onTranscript or making any LLM/TTS call.
    // Whisper echoes the transcription hint back when audio is silent; empty
    // and punctuation-only transcripts cause the model to hallucinate.
    const transcriptValidation = validateTranscript(transcript, transcriptionHint);
    if (!transcriptValidation.ok) {
      return { noSpeech: true, reason: transcriptValidation.reason };
    }

    // Fire the early-transcript callback so the SSE route can flush a
    // `transcript` event to the client before the LLM+TTS call starts.
    input.onTranscript?.(transcript, durationSeconds);
  }

  // LLM call: returns the in-language reply, its English gloss, and an
  // English translation of what the learner said — all in one JSON response.
  // Block-truncate history before building the prompt so the prefix stays
  // stable across consecutive turns within a conversation block.
  const effectiveHistory = applyBlockTruncation(input.history);
  const replyStart = Date.now();
  const {
    text: rawReplyText,
    english: rawReplyEnglish,
    transcriptEnglish,
  } = await deps.reply(
    BOLO_PERSONA_PROMPT,
    buildUserPrompt(input.languageName, effectiveHistory, transcript),
  );
  const replyMs = Date.now() - replyStart;

  // Fire the early-transcriptEnglish callback so the SSE route can flush
  // the learner's English subtitle before TTS synthesis begins (~1–3 s early).
  input.onTranscriptEnglish?.(transcriptEnglish.trim());

  const rawText = rawReplyText.trim() || "Say that again?";

  // Strip ALL bird-sound tokens before synthesis so the voice never says them
  // aloud — the client plays a real parrot SFX instead.
  const { cleaned: ttsText, squawkVariant } = extractSquawks(rawText);

  // Server-side consistency guard: the English subtitle must agree with the
  // displayed reply on squawk presence/placement, whatever the LLM produced.
  const replyEnglish = normalizeSquawkConsistency(rawText, rawReplyEnglish.trim());

  // Fire the early reply-text callback so the SSE route can flush Bolo's
  // bubble to the client while voice synthesis is still in flight.
  input.onReplyReady?.(rawText, replyEnglish, squawkVariant);

  // Synthesis length guard: refuse to synthesize a runaway reply. Applied to
  // the post-squawk-stripped, post-trimmed string — exactly the string that
  // would be billed — so audio cost is bounded even when the model misbehaves.
  // Must sit before the synthesis call so a runaway reply is never submitted.
  if (ttsText.length > TTS_MAX_CHARS) {
    console.error(`[reply] synthesis guard chars=${ttsText.length} limit=${TTS_MAX_CHARS}`);
    throw new Error(`Reply too long for synthesis: ${ttsText.length} chars exceeds limit of ${TTS_MAX_CHARS}`);
  }

  // TTS call: speaks only the cleaned reply text using Bolo's character voice.
  // When the caller wants streaming audio (SSE clients) and the deps provide
  // a streaming synthesizer, chunks are forwarded as they arrive so playback
  // can start before the clip is finished. Any streaming failure falls back
  // to the buffered synthesizer — the client then simply plays the full clip
  // from the final reply payload (onAudioDone is only fired on a complete,
  // successful stream).
  const ttsStart = Date.now();
  let replyAudio: Buffer;
  if (input.onAudioChunk && deps.synthesizeStream) {
    try {
      replyAudio = await deps.synthesizeStream(ttsText, input.languageName, input.languageCode, (chunk) => {
        input.onAudioChunk?.(chunk.toString("base64"));
      });
      input.onAudioDone?.();
    } catch (err) {
      console.warn(
        "[parrotChat] streaming TTS failed, falling back to buffered synthesis:",
        err instanceof Error ? err.message : err,
      );
      replyAudio = await deps.synthesize(ttsText, input.languageName, input.languageCode);
      // Feed the fallback clip through the same streaming channel and mark it
      // complete: the client's progressive player is already connected to the
      // stream URL, so this turns "stream aborts → silence risk" into a
      // normal, trusted playback of the full clip.
      input.onAudioChunk?.(replyAudio.toString("base64"));
      input.onAudioDone?.();
    }
  } else {
    replyAudio = await deps.synthesize(ttsText, input.languageName, input.languageCode);
  }
  const ttsMs = Date.now() - ttsStart;

  input.onTimings?.({
    transcribeMs,
    replyMs,
    ttsMs,
    totalMs: Date.now() - turnStart,
  });

  return {
    transcript,
    transcriptEnglish: transcriptEnglish.trim(),
    replyText: rawText,   // full text with squawk tokens for the UI transcript
    // Empty string when the LLM omitted the English translation (e.g. truncated
    // JSON) — the client skips the caption rather than showing target-language
    // text as if it were English.
    replyEnglish,
    replyAudio,
    audioFormat: "mp3",
    squawkVariant,
    durationSeconds,
  };
}
