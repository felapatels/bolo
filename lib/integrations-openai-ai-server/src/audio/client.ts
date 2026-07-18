import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp (Safari/iOS records in these containers)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 */
export async function ensureCompatibleFormat(
  audioBuffer: Buffer
): Promise<{ buffer: Buffer; format: "wav" | "mp3" }> {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

/** Voice Chat: audio-in, audio-out using gpt-audio. */
export async function voiceChat(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
  outputFormat: "wav" | "mp3" = "mp3"
): Promise<{ transcript: string; audioResponse: Buffer }> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: outputFormat },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
  });
  const message = response.choices[0]?.message as any;
  const transcript = message?.audio?.transcript || message?.content || "";
  const audioData = message?.audio?.data ?? "";
  return {
    transcript,
    audioResponse: Buffer.from(audioData, "base64"),
  };
}

/** Streaming Voice Chat for real-time audio responses. */
export async function voiceChatStream(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav"
): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  const audioBase64 = audioBuffer.toString("base64");
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.transcript) {
        yield { type: "transcript", data: delta.audio.transcript };
      }
      if (delta?.audio?.data) {
        yield { type: "audio", data: delta.audio.data };
      }
    }
  })();
}

/** Text-to-Speech using gpt-audio. */
export async function textToSpeech(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  format: "wav" | "mp3" | "flac" | "opus" | "pcm16" = "wav",
  // Naming the language anchors the audio model: without it, short snippets in
  // non-Latin scripts are occasionally misread as a different phrase entirely.
  language?: string
): Promise<Buffer> {
  const langHint = language?.trim() ? ` The text is in ${language.trim()}.` : "";
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format },
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that performs text-to-speech. Read the given text exactly as written — never substitute, add, or omit words." +
          langHint,
      },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  return Buffer.from(audioData, "base64");
}

/**
 * Text-to-Speech via ElevenLabs eleven_multilingual_v2.
 *
 * Purpose-built for multilingual audio including Indian scripts (Gujarati,
 * Tamil, Hindi, etc.).  Makes a direct HTTPS call to api.elevenlabs.io using
 * the ELEVENLABS_API_KEY environment variable and returns an MP3 Buffer
 * decoded from the `audio_base64` field of the `/with-timestamps` JSON
 * response.
 *
 * Voice: "George" (default premade, ID JBFqnCBsd6RMkjVDRZzb) — warm, clear,
 * works well across Latin and non-Latin scripts with eleven_multilingual_v2.
 * Chosen over "Rachel" (21m00Tcm4TlvDq8ikWAM) because Rachel is a *library*
 * voice that free-tier API keys are not allowed to use (the API returns a 402
 * paid_plan_required); George is available on every plan.
 * The voiceId parameter lets callers override if needed.
 */
export async function textToSpeechElevenLabs(
  text: string,
  voiceId = "JBFqnCBsd6RMkjVDRZzb",
  // language parameter kept for API symmetry with textToSpeech; ElevenLabs
  // auto-detects the script via eleven_multilingual_v2 so it is not sent.
  _language?: string,
  // ElevenLabs model to synthesize with. The default (multilingual v2) is the
  // highest-quality option; latency-sensitive callers (e.g. live chat) can
  // pass "eleven_flash_v2_5" for ~75 ms model latency at slightly lower
  // fidelity. Optional trailing parameter → fully backward compatible.
  modelId = "eleven_multilingual_v2",
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY must be set. Add it as a Replit Secret to enable ElevenLabs TTS.",
    );
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      output_format: "mp3_44100_128",
      // Improve clarity and consistency for non-Latin scripts. stability=0.7
      // keeps the voice steady without sounding robotic; similarity_boost=0.8
      // preserves the chosen voice's character; use_speaker_boost adds a final
      // audio enhancement pass that helps non-Latin phonemes come through more
      // clearly on device speakers.
      voice_settings: {
        stability: 0.7,
        similarity_boost: 0.8,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed with status ${response.status}: ${detail}`,
    );
  }

  // Track per-request character cost from the response header so callers can
  // surface usage even when the API key cannot read the subscription endpoint.
  const cost = Number(response.headers.get("character-cost") ?? NaN);
  if (Number.isFinite(cost)) {
    usageStats.requests += 1;
    usageStats.charactersUsed += cost;
    usageStats.lastCharacterCost = cost;
  }

  const json = (await response.json()) as { audio_base64?: string };
  const audioBase64 = json.audio_base64;
  if (!audioBase64) {
    throw new Error("ElevenLabs TTS returned no audio_base64 in response");
  }
  return Buffer.from(audioBase64, "base64");
}

export interface ElevenLabsUsageStats {
  /** ElevenLabs TTS requests made by this process. */
  requests: number;
  /** Total characters billed by ElevenLabs since this process started
   * (summed from the `character-cost` response header). */
  charactersUsed: number;
  /** Character cost of the most recent synthesis. */
  lastCharacterCost: number;
}

const usageStats: ElevenLabsUsageStats = {
  requests: 0,
  charactersUsed: 0,
  lastCharacterCost: 0,
};

/** In-process ElevenLabs usage counters (since process start). */
export function getElevenLabsUsageStats(): ElevenLabsUsageStats {
  return { ...usageStats };
}

export interface ElevenLabsQuota {
  /** Characters consumed so far in the current billing period. */
  characterCount: number;
  /** Total characters allowed in the current billing period. */
  characterLimit: number;
  /** Characters still available (limit - count, floored at 0). */
  remaining: number;
  /** Unix seconds when the character allowance next resets (0 if the API
   * omitted it). Distinguishes billing cycles for once-per-cycle alerting. */
  resetUnix: number;
}

/**
 * Fetch the ElevenLabs subscription quota (character credits) for the
 * configured API key. Lets callers log / warn about remaining monthly credits
 * before synthesis starts failing with quota errors.
 */
export async function getElevenLabsQuota(): Promise<ElevenLabsQuota> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY must be set. Add it as a Replit Secret to enable ElevenLabs TTS.",
    );
  }
  const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": apiKey },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs subscription check failed with status ${response.status}: ${detail}`,
    );
  }
  const json = (await response.json()) as {
    character_count?: number;
    character_limit?: number;
    next_character_count_reset_unix?: number;
  };
  const characterCount = Number(json.character_count ?? 0);
  const characterLimit = Number(json.character_limit ?? 0);
  return {
    characterCount,
    characterLimit,
    remaining: Math.max(0, characterLimit - characterCount),
    resetUnix: Number(json.next_character_count_reset_unix ?? 0),
  };
}

/**
 * Streaming Text-to-Speech via ElevenLabs.
 *
 * Calls the `/stream` variant of the text-to-speech endpoint, which returns
 * raw MP3 bytes progressively as synthesis proceeds. Each chunk is forwarded
 * to `onChunk` as it arrives (chunk boundaries are arbitrary byte offsets in
 * the MP3 stream — callers concatenating all chunks in order reconstruct the
 * exact same file). Resolves with the complete audio Buffer once the stream
 * ends, so callers can also use the full clip (e.g. for a final payload).
 */
export async function textToSpeechElevenLabsStream(
  text: string,
  voiceId = "JBFqnCBsd6RMkjVDRZzb",
  // Kept for API symmetry with textToSpeechElevenLabs; not sent to the API.
  _language?: string,
  modelId = "eleven_multilingual_v2",
  onChunk?: (chunk: Buffer) => void,
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY must be set. Add it as a Replit Secret to enable ElevenLabs TTS.",
    );
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      // Same voice_settings as the non-streaming endpoint for consistent output.
      voice_settings: {
        stability: 0.7,
        similarity_boost: 0.8,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs streaming TTS failed with status ${response.status}: ${detail}`,
    );
  }

  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      const buf = Buffer.from(value);
      chunks.push(buf);
      onChunk?.(buf);
    }
  }

  const full = Buffer.concat(chunks);
  if (full.length === 0) {
    throw new Error("ElevenLabs streaming TTS returned no audio bytes");
  }
  return full;
}

/** Streaming Text-to-Speech. */
export async function textToSpeechStream(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy"
): Promise<AsyncIterable<string>> {
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.data) {
        yield delta.audio.data;
      }
    }
  })();
}

export interface SpeechToTextOptions {
  /** ISO-639-1 language code hint (e.g. "gu", "hi"). Improves accuracy for
   * short utterances in less-common languages. */
  language?: string;
  /** Context prompt (e.g. the phrase the speaker is attempting). Steers the
   * transcriber's vocabulary without forcing the output. */
  prompt?: string;
  /** Use the larger transcription model — worth it when the fast model
   * returned nothing or something wildly divergent. */
  highQuality?: boolean;
}

/** Speech-to-Text using gpt-4o-mini-transcribe (or gpt-4o-transcribe). */
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav",
  options: SpeechToTextOptions = {}
): Promise<string> {
  const model = options.highQuality ? "gpt-4o-transcribe" : "gpt-4o-mini-transcribe";
  try {
    const file = await toFile(audioBuffer, `audio.${format}`);
    const response = await openai.audio.transcriptions.create({
      file,
      model,
      ...(options.language ? { language: options.language } : {}),
      ...(options.prompt ? { prompt: options.prompt } : {}),
    });
    return response.text;
  } catch (err) {
    // The transcribe models accept only a subset of ISO-639-1 codes (e.g.
    // 'pa' for Punjabi is rejected with a 400 invalid_value on `language`).
    // Retry without the code — the prompt already names the language, which
    // is enough of a hint. Any other error propagates unchanged.
    const e = err as { status?: number; param?: string; message?: string };
    const languageRejected =
      e?.status === 400 &&
      (e?.param === "language" ||
        /language(_| )?code|'language'|unsupported language/i.test(e?.message ?? ""));
    if (options.language && languageRejected) {
      const file = await toFile(audioBuffer, `audio.${format}`);
      const response = await openai.audio.transcriptions.create({
        file,
        model,
        ...(options.prompt ? { prompt: options.prompt } : {}),
      });
      return response.text;
    }
    throw err;
  }
}

/** Streaming Speech-to-Text. */
export async function speechToTextStream(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<AsyncIterable<string>> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const stream = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    stream: true,
  });

  return (async function* () {
    for await (const event of stream) {
      if (event.type === "transcript.text.delta") {
        yield event.delta;
      }
    }
  })();
}
