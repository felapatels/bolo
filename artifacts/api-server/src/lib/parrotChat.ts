import {
  openai,
  speechToText,
  textToSpeech,
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
}

export interface ParrotTurnResult {
  transcript: string;
  replyText: string;
  replyAudio: Buffer;
  audioFormat: "mp3";
  // Server-measured duration of the learner's submitted audio, in seconds —
  // what actually gets charged against the weekly chat-time cap.
  durationSeconds: number;
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
  reply: (systemPrompt: string, userPrompt: string) => Promise<string>;
  synthesize: (text: string, languageName: string) => Promise<Buffer>;
}

export const defaultParrotChatDeps: ParrotChatDeps = {
  transcribe: (buffer, format, options) =>
    speechToText(buffer, format, options),
  reply: async (systemPrompt, userPrompt) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  },
  synthesize: (text, languageName) =>
    textToSpeech(text, "nova", "mp3", languageName),
};

function buildSystemPrompt(languageName: string): string {
  return `You are Bolo, a warm, playful, endlessly patient parrot who is a language learner's ${languageName} conversation buddy. You chat naturally and stay in character.

Rules:
- Reply ONLY in ${languageName} (its own native script), never in English, UNLESS the learner is directly asking you to teach or translate something (see below).
- Keep every reply SHORT — one or two brief sentences at most. This is a spoken, real-time back-and-forth, not an essay.
- Be encouraging and fun, like a chatty pet parrot who loves talking with its favorite person.
- If the learner asks a meta/teaching question — e.g. "how do you say water in ${languageName}?", "what does X mean?", "translate Y" — answer it directly and helpfully in character: give the ${languageName} word/phrase (plus a quick, tiny gloss if useful), then keep the conversation going. Don't just chat past the question.
- If you can't make out what the learner said, warmly ask them to repeat it, in ${languageName}.
- Never use emojis or special symbols — replies are spoken aloud.`;
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

// Runs one full conversational turn: transcribe -> in-character reply ->
// synthesize. Callers are responsible for gating (language/time caps) before
// calling this, and for recording usage afterwards — this function does no
// database work and computes only what it needs to reply.
export async function runParrotTurn(
  input: ParrotTurnInput,
  deps: ParrotChatDeps = defaultParrotChatDeps,
): Promise<ParrotTurnResult> {
  const { buffer, format } = await ensureCompatibleFormat(input.audioBuffer);
  // Duration is measured off a canonical WAV buffer; ensureCompatibleFormat
  // only returns "mp3" when the raw upload was already MP3, in which case a
  // one-off conversion gets us a parseable header.
  const wavBuffer = format === "wav" ? buffer : await convertToWav(buffer);
  const durationSeconds = wavDurationSeconds(wavBuffer);

  const transcript = (
    await deps.transcribe(buffer, format, { language: input.languageCode })
  ).trim();

  const replyText =
    (
      await deps.reply(
        buildSystemPrompt(input.languageName),
        buildUserPrompt(input.history, transcript),
      )
    ).trim() || "Squawk! Say that again?";

  const replyAudio = await deps.synthesize(replyText, input.languageName);

  return {
    transcript,
    replyText,
    replyAudio,
    audioFormat: "mp3",
    durationSeconds,
  };
}
