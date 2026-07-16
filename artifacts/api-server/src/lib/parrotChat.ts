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

// Custom TTS for Bolo — calls gpt-audio with a voice-quality instruction
// to sound young, bright, and energetic. Deliberately avoids any mention of
// birds or parrots so the model has no reason to improvise bird sounds.
async function boloTTS(text: string, languageName: string): Promise<Buffer> {
  const langHint = languageName ? ` The text is in ${languageName}.` : "";
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audio: { voice: "shimmer", format: "mp3" } as any,
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
  return Buffer.from(audioData, "base64");
}

export const defaultParrotChatDeps: ParrotChatDeps = {
  transcribe: (buffer, format, options) =>
    speechToText(buffer, format, options),

  reply: async (systemPrompt, userPrompt) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 200,
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

  // Run WAV conversion (needed only for duration measurement) and transcription
  // in parallel — both operate on the same already-converted buffer, so neither
  // blocks the other.
  const [wavBuffer, transcript] = await Promise.all([
    format === "wav" ? Promise.resolve(buffer) : convertToWav(buffer),
    // Do NOT pass a hard `language` lock — that would block English entirely.
    // Instead supply a prompt that explicitly names both valid languages so
    // Whisper biases toward those two scripts. Short target-language words
    // (e.g. "kemcho") are otherwise mis-detected as phonetically-similar words
    // in unrelated scripts (e.g. Belarusian Cyrillic).
    deps.transcribe(buffer, format, {
      prompt: `${input.languageName} or English.`,
    }).then((t) => t.trim()),
  ]);

  const durationSeconds = wavDurationSeconds(wavBuffer);

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
