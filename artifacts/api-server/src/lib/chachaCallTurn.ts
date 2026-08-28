import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { openai, speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { CHACHA_TTS_VOICE } from "./chachaStrings";
import { buildLivePrompt, type CallBeat } from "./chachaCallScript";
import type { CallTurn } from "./chachaCallSessions";

/**
 * One LIVE turn of Chacha-ji's phone call: the learner's audio in, his spoken
 * reply out, streamed.
 *
 * WHY gpt-audio AND NOT THE THREE HOPS CHAT USES. Measured on this repo's own
 * key, 2026-08-28, same input clip and same persona for both:
 *
 *   gpt-audio, one hop      first audio at 958 / 1029 / 1173 ms warm
 *   STT -> LLM -> TTS       first audio at 1761 / 1772 / 2091 / 3207 ms
 *
 * A call with two second gaps is a walkie-talkie and the illusion dies, so the
 * one hop is the feature rather than an optimization of it. Both functions
 * this calls have existed in the audio client since it was written and nothing
 * had ever called either of them.
 *
 * WHY THE AUDIO COMES OUT AS MP3. gpt-audio refuses every streaming format but
 * pcm16 (verified: `audio.format does not support 'mp3' when stream=true`), and
 * raw pcm is not something the native players behind expo-audio will take. So
 * the pcm is transcoded on the fly by ffmpeg, which is already a server
 * dependency (replit.nix) and already spawned by convertToWav. Measured cost of
 * that hop: 11 ms to the first mp3 byte, and the wire payload drops from
 * 274 KB to 46 KB for the same six seconds of speech, which is the part that
 * matters on a phone.
 *
 * WHY THE TRANSCRIPT RUNS ALONGSIDE. Chat completions do not return a
 * transcript of the audio you send them, and the next beat needs to know what
 * was said. Transcription is therefore started in parallel and never awaited
 * before the audio streams: STT lands around 630 ms, the first audio byte
 * around 1000 ms, so the record is ready before he has stopped talking and it
 * costs the learner nothing. If it fails, the turn still happens with an empty
 * record, because the voice is the feature and the transcript is bookkeeping.
 */

/** pcm16 out of gpt-audio: 24 kHz, mono, 16-bit. */
export const GPT_AUDIO_PCM_SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;

/** Seconds of speech in a pcm16 buffer of this shape. */
export function pcmSeconds(byteLength: number): number {
  return byteLength / (GPT_AUDIO_PCM_SAMPLE_RATE * BYTES_PER_SAMPLE);
}

export type LearnerAudioFormat = "wav" | "mp3";

export interface LiveTurnRequest {
  audio: Buffer;
  audioFormat: LearnerAudioFormat;
  beat: CallBeat;
  /** Turns already taken in this call, oldest first. */
  history: readonly CallTurn[];
  /** Called with each mp3 chunk as it is encoded. */
  onAudioChunk?: (chunk: Buffer) => void;
}

export interface LiveTurnResult {
  /** What Chacha-ji said, as the model transcribed its own speech. */
  chachaText: string;
  /** What the learner said. Empty is a normal outcome, never an error. */
  learnerText: string;
  /** The whole reply, for callers that want the clip rather than the stream. */
  mp3: Buffer;
  /** Seconds of speech he produced. */
  spokenSeconds: number;
}

export interface LiveTurnDeps {
  /** Opens the gpt-audio stream and yields base64 pcm16 chunks. */
  streamPcm: (req: LiveTurnRequest) => AsyncIterable<{ audio?: string; text?: string }>;
  /** Transcribes the learner's clip, for the record only. */
  transcribe: (audio: Buffer, format: LearnerAudioFormat) => Promise<string>;
  /** Encodes a pcm16 stream to mp3, calling onChunk as bytes are produced. */
  encodeMp3: (
    pcm: AsyncIterable<Buffer>,
    onChunk?: (chunk: Buffer) => void,
  ) => Promise<Buffer>;
}

/**
 * Builds the messages for one live beat.
 *
 * History goes in as TEXT, not as audio. Resending the learner's clips would
 * grow the request by roughly 165 KB of base64 per prior turn and buy nothing:
 * he is reacting to what they said, and by this point we have the words.
 */
export function buildTurnMessages(req: LiveTurnRequest): unknown[] {
  const history = req.history.flatMap((t) => {
    const msgs: unknown[] = [];
    if (t.chacha.trim()) msgs.push({ role: "assistant", content: t.chacha });
    if (t.learner.trim()) msgs.push({ role: "user", content: t.learner });
    return msgs;
  });

  return [
    { role: "system", content: buildLivePrompt(req.beat) },
    ...history,
    {
      role: "user",
      content: [
        {
          type: "input_audio",
          input_audio: {
            data: req.audio.toString("base64"),
            format: req.audioFormat,
          },
        },
      ],
    },
  ];
}

/**
 * Pipes a pcm16 stream through ffmpeg to mp3.
 *
 * `-flush_packets 1` matters: without it ffmpeg holds output in its own
 * buffer and the first mp3 byte arrives late, which would give back the
 * latency the one-hop model just won.
 */
export async function encodeMp3WithFfmpeg(
  pcm: AsyncIterable<Buffer>,
  onChunk?: (chunk: Buffer) => void,
): Promise<Buffer> {
  const ff = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "s16le",
    "-ar", String(GPT_AUDIO_PCM_SAMPLE_RATE),
    "-ac", "1",
    "-i", "pipe:0",
    "-f", "mp3",
    "-b:a", "64k",
    // A bare frame stream, no container furniture. `-write_xing 0` because the
    // Xing header carries a duration ffmpeg fills in by SEEKING BACK once it
    // knows the frame count, and it cannot seek on a pipe: leaving it on ships
    // a header claiming the wrong length, which is exactly the thing a
    // progressive player trusts. `-id3v2_version 0` so the very first bytes
    // out are decodable audio rather than a tag.
    "-write_xing", "0",
    "-id3v2_version", "0",
    "-flush_packets", "1",
    "pipe:1",
  ]);

  const out: Buffer[] = [];
  const stderr: Buffer[] = [];
  ff.stdout.on("data", (b: Buffer) => {
    out.push(b);
    onChunk?.(b);
  });
  ff.stderr.on("data", (b: Buffer) => stderr.push(b));

  const closed = new Promise<number>((resolve, reject) => {
    ff.on("close", resolve);
    ff.on("error", reject);
  });
  // A learner who hangs up mid-reply closes the pipe under us. That is a
  // dropped call, not a crash.
  ff.stdin.on("error", () => {});

  for await (const chunk of pcm) {
    if (!ff.stdin.destroyed) ff.stdin.write(chunk);
  }
  if (!ff.stdin.destroyed) ff.stdin.end();

  const code = await closed;
  if (code !== 0) {
    const detail = Buffer.concat(stderr).toString("utf8").slice(-300);
    throw new Error(`ffmpeg exited with code ${code}: ${detail}`);
  }
  return Buffer.concat(out);
}

/** The slice of a streamed gpt-audio chunk this module reads. */
interface AudioDeltaChunk {
  choices?: Array<{
    delta?: { audio?: { data?: string; transcript?: string } };
  }>;
}

const defaultDeps: LiveTurnDeps = {
  streamPcm: async function* (req) {
    // The SDK's audio chat-completion types do not model the audio deltas that
    // come back on a stream, so the request goes out untyped and the response
    // is narrowed to the shape we actually read. Everything load-bearing is in
    // AudioDeltaChunk above it.
    const created = await openai.chat.completions.create({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: CHACHA_TTS_VOICE, format: "pcm16" },
      // One or two short sentences, and a hard ceiling so a model that decides
      // to give a speech cannot hold the line open.
      max_completion_tokens: 220,
      messages: buildTurnMessages(req),
      stream: true,
    } as never);
    const stream = created as unknown as AsyncIterable<AudioDeltaChunk>;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      yield { audio: delta?.audio?.data, text: delta?.audio?.transcript };
    }
  },
  transcribe: (audio, format) => speechToText(audio, format),
  encodeMp3: encodeMp3WithFfmpeg,
};

export async function runLiveTurn(
  req: LiveTurnRequest,
  deps: LiveTurnDeps = defaultDeps,
): Promise<LiveTurnResult> {
  // Started first and awaited last: the record must never sit in front of the
  // voice. A failed transcription costs the turn its text, not its audio.
  const transcriptPromise = deps
    .transcribe(req.audio, req.audioFormat)
    .catch(() => "");

  let chachaText = "";
  let pcmBytes = 0;

  const pcm = (async function* () {
    for await (const ev of deps.streamPcm(req)) {
      if (ev.text) chachaText += ev.text;
      if (ev.audio) {
        const buf = Buffer.from(ev.audio, "base64");
        pcmBytes += buf.length;
        yield buf;
      }
    }
  })();

  const mp3 = await deps.encodeMp3(pcm, req.onAudioChunk);
  const learnerText = (await transcriptPromise).trim();

  return {
    chachaText: chachaText.trim(),
    learnerText,
    mp3,
    spokenSeconds: pcmSeconds(pcmBytes),
  };
}
