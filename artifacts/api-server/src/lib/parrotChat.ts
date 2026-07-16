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
  replyEnglish: string;
  replyAudio: Buffer;
  audioFormat: "mp3";
  // True when Bolo's reply contained at least one squawk token. The client
  // plays a real parrot SFX before the TTS audio so the voice never has to
  // say the word "squawk" aloud.
  hasSquawk: boolean;
  // Server-measured duration of the learner's submitted audio, in seconds —
  // what actually gets charged against the weekly chat-time cap.
  durationSeconds: number;
}

// Squawk tokens the LLM may insert for character. We strip them from the TTS
// input so the synthesiser doesn't awkwardly pronounce "squawk", and signal
// the client to play a real parrot sound effect instead.
const SQUAWK_RE = /\b(Squawk!?|Squawkity!?|Bawk( bawk)?!?|Awk!?|Eeek!?)\s*/gi;

function extractSquawks(text: string): { cleaned: string; hasSquawk: boolean } {
  SQUAWK_RE.lastIndex = 0;
  const hasSquawk = SQUAWK_RE.test(text);
  SQUAWK_RE.lastIndex = 0;
  const cleaned = text.replace(SQUAWK_RE, "").replace(/\s{2,}/g, " ").trim();
  return { cleaned: cleaned || text, hasSquawk };
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
  // Returns both the in-language reply and its English gloss in a single call,
  // eliminating the separate translate round-trip.
  reply: (
    systemPrompt: string,
    userPrompt: string,
  ) => Promise<{ text: string; english: string }>;
  synthesize: (text: string, languageName: string) => Promise<Buffer>;
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
    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    try {
      const parsed = JSON.parse(raw) as { reply?: string; english?: string };
      return {
        text: parsed.reply?.trim() ?? "",
        english: parsed.english?.trim() ?? "",
      };
    } catch {
      return { text: raw, english: "" };
    }
  },
  synthesize: (text, languageName) =>
    textToSpeech(text, "shimmer", "mp3", languageName),
};

function buildSystemPrompt(languageName: string): string {
  return `You are Bolo, a bubbly, rainbow-feathered parrot who is absolutely obsessed with language. You are a learner's ${languageName} conversation buddy and you LOVE this job. You are warm, cheeky, and endlessly enthusiastic. Stay in character at all times.

Personality:
- You are a chatty parrot who gets genuinely excited about words, phrases, and languages.
- Every single reply must include at least one parrot exclamation — "Squawk!", "Bawk!", "Awk!", "Squawkity!", "Bawk bawk!", or "Eeek!" — placed naturally in the sentence (at the start, mid-sentence as an interjection, or at the end). Vary which one you use so it stays fresh.
- Stack two exclamations in a single reply whenever you're especially excited or surprised — e.g. "Squawk! ... Awk!"
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
Always respond with a JSON object with exactly two fields:
- "reply": your response in ${languageName} native script (following all rules above)
- "english": a brief, natural English translation of your reply (one short sentence)
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

// Runs one full conversational turn: transcribe -> in-character reply ->
// synthesize. Callers are responsible for gating (language/time caps) before
// calling this, and for recording usage afterwards — this function does no
// database work and computes only what it needs to reply.
export async function runParrotTurn(
  input: ParrotTurnInput,
  deps: ParrotChatDeps = defaultParrotChatDeps,
): Promise<ParrotTurnResult> {
  const { buffer, format } = await ensureCompatibleFormat(input.audioBuffer);

  // Run WAV conversion (needed only for duration measurement) and transcription
  // in parallel — both operate on the same already-converted buffer, so neither
  // blocks the other. When the input is already WAV the Promise.resolve short-
  // circuits immediately, making this zero-cost in the common case.
  const [wavBuffer, transcript] = await Promise.all([
    format === "wav" ? Promise.resolve(buffer) : convertToWav(buffer),
    // Do NOT lock Whisper to the target language — learners may speak in
    // English or the target language and Whisper auto-detects both reliably.
    // Locking to a single language code causes English speech to be
    // hallucinated as random characters in that script (e.g. Japanese kanji
    // when the learner said an English word while studying Gujarati).
    deps.transcribe(buffer, format, {}).then((t) => t.trim()),
  ]);

  const durationSeconds = wavDurationSeconds(wavBuffer);

  // Single LLM call returns both the in-language reply and its English gloss,
  // replacing the previous two-call (reply + translate) sequential pattern.
  const { text: rawReplyText, english: rawReplyEnglish } = await deps.reply(
    buildSystemPrompt(input.languageName),
    buildUserPrompt(input.history, transcript),
  );

  const rawText = rawReplyText.trim() || "Say that again?";

  // Strip squawk tokens before synthesis so the voice never pronounces the
  // word "squawk" — the client plays a real parrot SFX instead.
  const { cleaned: replyText, hasSquawk } = extractSquawks(rawText);

  const replyAudio = await deps.synthesize(replyText, input.languageName);

  return {
    transcript,
    replyText: rawText,        // show the full text (with squawk tokens) in the UI
    replyEnglish: rawReplyEnglish.trim() || replyText,
    replyAudio,
    audioFormat: "mp3",
    hasSquawk,
    durationSeconds,
  };
}
