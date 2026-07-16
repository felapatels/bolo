import {
  openai,
  speechToText,
  ensureCompatibleFormat,
  convertToWav,
  type SpeechToTextOptions,
} from "@workspace/integrations-openai-ai-server/audio";
import { wavDurationSeconds } from "./audioDuration";
import { isEffectivelyEmpty } from "./pronunciationGuards";

// A single prior turn of the conversation, supplied by the client as a short
// rolling context window (no server-side chat history is persisted — see the
// task brief's "out of scope").
export interface ChatHistoryTurn {
  role: "learner" | "parrot";
  text: string;
}

export interface ParrotTurnInput {
  audioBuffer: Buffer;
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
   * Recording duration in seconds as measured by the client. When provided the
   * server skips the WAV-conversion step that exists solely for duration
   * measurement, saving ~200–400 ms of ffmpeg overhead per turn.
   */
  clientDurationSeconds?: number;
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

// ALL bird-sound tokens the LLM may insert. Stripped from TTS so the voice
// never pronounces them — the client plays a real parrot SFX instead.
const SQUAWK_RE =
  /\b(Squawk!?|Squawkity!?|Bawk( bawk)?!?|Awk!?|Eeek!?|Tweet!?|Chirp!?|Screech!?|Caw!?|Squee!?)\s*/gi;

function extractSquawks(text: string): { cleaned: string; squawkVariant: 0 | 1 | 2 | null } {
  SQUAWK_RE.lastIndex = 0;
  const hasSquawk = SQUAWK_RE.test(text);
  SQUAWK_RE.lastIndex = 0;
  const cleaned = text.replace(SQUAWK_RE, "").replace(/\s{2,}/g, " ").trim();
  const squawkVariant: 0 | 1 | 2 | null = hasSquawk
    ? (Math.floor(Math.random() * 3) as 0 | 1 | 2)
    : null;
  return { cleaned: cleaned || text, squawkVariant };
}

// Injectable AI dependencies so the conversational flow can be unit-tested
// without hitting the real OpenAI API, mirroring the injectable-`generate`
// pattern used by the phrase replenisher.
export interface ParrotChatDeps {
  transcribe: (
    buffer: Buffer,
    format: "wav" | "mp3",
    options: SpeechToTextOptions,
  ) => Promise<string>;
  // Returns the in-language reply, its English gloss, and an English
  // translation of the learner's utterance in a single LLM call.
  reply: (
    systemPrompt: string,
    userPrompt: string,
  ) => Promise<{ text: string; english: string; transcriptEnglish: string }>;
  // Synthesizes the cleaned reply text using Bolo's parrot character voice.
  synthesize: (text: string, languageName: string) => Promise<Buffer>;
}

// Custom TTS for Bolo — uses the dedicated tts-1 endpoint (much faster than
// routing through gpt-audio chat completions). shimmer voice is available on
// both models; tts-1 handles multilingual text natively without a language hint.
async function boloTTS(text: string, _languageName: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.audio.speech as any).create({
    model: "tts-1",
    voice: "shimmer",
    input: text,
    response_format: "mp3",
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const defaultParrotChatDeps: ParrotChatDeps = {
  transcribe: (buffer, format, options) =>
    speechToText(buffer, format, options),

  reply: async (systemPrompt, userPrompt) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "{}").trim();
    let parsed: { reply?: string; english?: string; transcript_english?: string } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = { reply: raw, english: "", transcript_english: "" };
    }
    return {
      text: parsed.reply?.trim() ?? "",
      english: parsed.english?.trim() ?? "",
      transcriptEnglish: parsed.transcript_english?.trim() ?? "",
    };
  },

  synthesize: boloTTS,
};

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
- Occasionally throw in a parrot exclamation — "Squawk!", "Bawk!", "Awk!", "Squawkity!", "Bawk bawk!", or "Eeek!" — roughly one reply in three, only when it fits naturally (at the start, mid-sentence as an interjection, or at the end). Vary which one you use. Don't force it every turn.
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
- "Squawk! Pretty bird doesn't talk about that! Let's chat about something fun in ${languageName}!"
- "Bawk! That's not in Bolo's nest! Tell me something happy in ${languageName} instead!"
- "Ruffles feathers — nope, not going there! What's your favorite food? Say it in ${languageName}!"
- "Squawk squawk! Wrong topic for this bird! Ask me something nice in ${languageName}!"
After the deflection, steer back to a friendly, everyday topic.

Output format:
Always respond with a JSON object with exactly three fields:
- "reply": your response in ${languageName} native script (following all rules above)
- "english": a brief, natural English translation of your reply (one short sentence)
- "transcript_english": a concise English translation of what the learner just said (one short phrase or sentence); use an empty string if the learner spoke in English or if their speech was unclear/silent
Do not include any text outside the JSON object.`;
}

function buildUserPrompt(
  history: ChatHistoryTurn[],
  transcript: string,
): string {
  const historyText = history
    .map((h) => `${h.role === "learner" ? "Learner" : "Bolo"}: ${h.text}`)
    .join("\n");
  const said = isEffectivelyEmpty(transcript)
    ? "(The learner's speech was unclear or silent — you couldn't make out any words.)"
    : transcript;
  return `${historyText ? historyText + "\n" : ""}Learner: ${said}\nBolo:`;
}

// Runs one full conversational turn: transcribe → (onTranscript callback) →
// combined LLM+TTS reply. Callers are responsible for gating (language/time
// caps) before calling this, and for recording usage afterwards — this
// function does no database work and computes only what it needs to reply.
export async function runParrotTurn(
  input: ParrotTurnInput,
  deps: ParrotChatDeps = defaultParrotChatDeps,
): Promise<ParrotTurnResult> {
  const { buffer, format } = await ensureCompatibleFormat(input.audioBuffer);

  // When the client supplies its own duration measurement we skip the WAV
  // conversion step that exists solely for duration measurement — saving
  // ~200–400 ms of ffmpeg overhead per turn. Fall back to the server-side
  // measurement (parallel WAV conversion) when the field is absent.
  let durationSeconds: number;
  let transcript: string;

  if (input.clientDurationSeconds != null) {
    // Fast path: transcribe only, no WAV conversion needed.
    durationSeconds = input.clientDurationSeconds;
    transcript = (
      await deps.transcribe(buffer, format, {
        prompt: buildTranscriptionPrompt(input.languageName, input.seedWords, input.seedNativeWords),
      })
    ).trim();
  } else {
    // Legacy path: run WAV conversion and transcription in parallel.
    const [wavBuffer, t] = await Promise.all([
      format === "wav" ? Promise.resolve(buffer) : convertToWav(buffer),
      deps.transcribe(buffer, format, {
        prompt: buildTranscriptionPrompt(input.languageName, input.seedWords, input.seedNativeWords),
      }).then((t) => t.trim()),
    ]);
    durationSeconds = wavDurationSeconds(wavBuffer);
    transcript = t;
  }

  // Fire the early-transcript callback so the SSE route can flush a
  // `transcript` event to the client before the LLM+TTS call starts.
  input.onTranscript?.(transcript, durationSeconds);

  // LLM call: returns the in-language reply, its English gloss, and an
  // English translation of what the learner said — all in one JSON response.
  const {
    text: rawReplyText,
    english: rawReplyEnglish,
    transcriptEnglish,
  } = await deps.reply(
    buildSystemPrompt(input.languageName),
    buildUserPrompt(input.history, transcript),
  );

  const rawText = rawReplyText.trim() || "Say that again?";

  // Strip ALL bird-sound tokens before synthesis so the voice never says them
  // aloud — the client plays a real parrot SFX instead.
  const { cleaned: ttsText, squawkVariant } = extractSquawks(rawText);

  // TTS call: speaks only the cleaned reply text using Bolo's character voice.
  const replyAudio = await deps.synthesize(ttsText, input.languageName);

  return {
    transcript,
    transcriptEnglish: transcriptEnglish.trim(),
    replyText: rawText,   // full text with squawk tokens for the UI transcript
    replyEnglish: rawReplyEnglish.trim() || ttsText,
    replyAudio,
    audioFormat: "mp3",
    squawkVariant,
    durationSeconds,
  };
}
