import { test, before } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { CALL_BEATS, CALL_PERSONA_PROMPT } from "./chachaCallScript";
import type { CallTurn } from "./chachaCallSessions";
import type {
  LiveTurnDeps,
  LiveTurnRequest,
  LiveTurnResult,
} from "./chachaCallTurn";

// The audio client throws at IMPORT time when OPENAI_API_KEY is unset, and ESM
// hoists every static import above any assignment in this file, so setting the
// variable at the top would run too late. The module under test is therefore
// pulled in dynamically inside before(), after the key exists.
//
// Nothing here reaches OpenAI: every dep is injected. The key only has to be
// present, not valid, which is what lets this suite run on a laptop.
let buildTurnMessages: (req: LiveTurnRequest) => unknown[];
let encodeMp3WithFfmpeg: (
  pcm: AsyncIterable<Buffer>,
  onChunk?: (c: Buffer) => void,
) => Promise<Buffer>;
let pcmSeconds: (bytes: number) => number;
let runLiveTurn: (req: LiveTurnRequest, deps: LiveTurnDeps) => Promise<LiveTurnResult>;

before(async () => {
  process.env.OPENAI_API_KEY ??= "test-key-not-used";
  const mod = await import("./chachaCallTurn");
  ({ buildTurnMessages, encodeMp3WithFfmpeg, pcmSeconds, runLiveTurn } = mod);
});

const LIVE_BEAT = CALL_BEATS.find((b) => b.mode === "live")!;
const AUDIO = Buffer.from("pretend-this-is-a-wav");

function req(over: Partial<LiveTurnRequest> = {}): LiveTurnRequest {
  return {
    audio: AUDIO,
    audioFormat: "wav",
    beat: LIVE_BEAT,
    languageName: "Gujarati",
    languageCode: "gu",
    history: [],
    ...over,
  };
}

/** A stream that yields base64 pcm and a transcript, like gpt-audio does. */
function fakeStream(pcm: Buffer, text: string) {
  return async function* () {
    yield { text };
    // Two chunks, so the test proves the stream is consumed rather than read
    // once. ffmpeg needs real samples, so this is real silence.
    yield { audio: pcm.subarray(0, pcm.length / 2).toString("base64") };
    yield { audio: pcm.subarray(pcm.length / 2).toString("base64") };
  };
}

function deps(over: Partial<LiveTurnDeps> = {}): LiveTurnDeps {
  return {
    streamPcm: () => fakeStream(Buffer.alloc(4800), "Waah beta!")(),
    transcribe: async () => "main theek hoon",
    encodeMp3: async (pcm, onChunk) => {
      const parts: Buffer[] = [];
      for await (const c of pcm) parts.push(c);
      const out = Buffer.from(`mp3:${Buffer.concat(parts).length}`);
      onChunk?.(out);
      return out;
    },
    ...over,
  };
}

test("pcmSeconds reads gpt-audio's 24 kHz mono pcm16", () => {
  assert.equal(pcmSeconds(48000), 1);
  assert.equal(pcmSeconds(0), 0);
});

test("a live turn returns his words, their words and the clip", async () => {
  const res = await runLiveTurn(req(), deps());
  assert.equal(res.chachaText, "Waah beta!");
  assert.equal(res.learnerText, "main theek hoon");
  assert.equal(res.spokenSeconds, pcmSeconds(4800));
  assert.ok(res.mp3.length > 0);
});

test("audio chunks arrive as they are encoded, not only at the end", async () => {
  const chunks: Buffer[] = [];
  const res = await runLiveTurn(
    req({ onAudioChunk: (c) => chunks.push(c) }),
    deps(),
  );
  assert.ok(chunks.length > 0, "the caller must see bytes before the promise settles");
  assert.equal(Buffer.concat(chunks).toString(), res.mp3.toString());
});

test("a failed transcription costs the turn its record, never its voice", async () => {
  // The voice is the feature; the transcript is bookkeeping. A turn whose STT
  // falls over must still be a turn the learner hears.
  const res = await runLiveTurn(
    req(),
    deps({ transcribe: async () => { throw new Error("stt down"); } }),
  );
  assert.equal(res.learnerText, "");
  assert.equal(res.chachaText, "Waah beta!");
  assert.ok(res.mp3.length > 0);
});

test("the transcript never sits in front of the audio", async () => {
  // Started first, awaited last. A slow STT must not delay a single mp3 byte,
  // because that would hand back the latency the one-hop model just won.
  let firstChunkAt = 0;
  let transcriptResolvedAt = 0;
  const res = await runLiveTurn(
    req({ onAudioChunk: () => { if (!firstChunkAt) firstChunkAt = performance.now(); } }),
    deps({
      transcribe: async () => {
        await new Promise((r) => setTimeout(r, 60));
        transcriptResolvedAt = performance.now();
        return "late";
      },
    }),
  );
  assert.equal(res.learnerText, "late");
  assert.ok(
    firstChunkAt > 0 && firstChunkAt < transcriptResolvedAt,
    "audio must reach the caller before the transcript resolves",
  );
});

test("an empty transcript is a normal turn, not an error", async () => {
  const res = await runLiveTurn(req(), deps({ transcribe: async () => "   " }));
  assert.equal(res.learnerText, "");
  assert.ok(res.mp3.length > 0);
});

test("a model that says nothing yields an empty reply rather than throwing", async () => {
  const res = await runLiveTurn(
    req(),
    deps({ streamPcm: async function* () { /* silence */ } }),
  );
  assert.equal(res.chachaText, "");
  assert.equal(res.spokenSeconds, 0);
  // The route reads this as "fall back to the canned line".
});

test("the prompt carries the persona and the beat's agenda", () => {
  const messages = buildTurnMessages(req()) as Array<{ role: string; content: unknown }>;
  assert.equal(messages[0].role, "system");
  assert.ok(String(messages[0].content).startsWith(CALL_PERSONA_PROMPT));
  assert.ok(String(messages[0].content).includes("Speak Gujarati"));
  assert.ok(String(messages[0].content).includes(LIVE_BEAT.agenda!));
});

test("history goes up as text, never as resent audio", () => {
  // Resending each prior clip would add roughly 165 KB of base64 per turn and
  // buy nothing: by this point we have the words.
  const history: CallTurn[] = [
    { beatId: "khaana", learner: "roti aur dal", chacha: "Waah!", canned: false },
  ];
  const messages = buildTurnMessages(req({ history })) as Array<{ role: string; content: unknown }>;
  assert.deepEqual(
    messages.slice(1, 3),
    [
      { role: "assistant", content: "Waah!" },
      { role: "user", content: "roti aur dal" },
    ],
  );
  // Exactly one input_audio in the whole request: this turn's clip.
  const audioCount = JSON.stringify(messages).split('"input_audio"').length - 1;
  assert.equal(audioCount, 2, "one type marker and one payload key, from one clip");
});

test("a silent prior turn leaves no empty message behind", () => {
  const history: CallTurn[] = [
    { beatId: "khaana", learner: "", chacha: "Koi baat nahi", canned: true },
  ];
  const messages = buildTurnMessages(req({ history })) as Array<{ role: string }>;
  assert.deepEqual(messages.map((m) => m.role), ["system", "assistant", "user"]);
});

test("ffmpeg really does turn gpt-audio's pcm into playable mp3", async () => {
  // The one test here that spawns the real encoder. It is load-bearing: mp3 is
  // the only container the native players will take, and gpt-audio refuses
  // every streaming format but pcm16, so this hop is not optional.
  const quarterSecond = Buffer.alloc(24000 * 2 * 0.25 * 2);
  for (let i = 0; i < quarterSecond.length; i += 2) {
    quarterSecond.writeInt16LE(Math.round(8000 * Math.sin(i / 24)), i);
  }
  const chunks: Buffer[] = [];
  const mp3 = await encodeMp3WithFfmpeg(
    (async function* () {
      yield quarterSecond.subarray(0, quarterSecond.length / 2);
      yield quarterSecond.subarray(quarterSecond.length / 2);
    })(),
    (c) => chunks.push(c),
  );
  assert.ok(mp3.length > 0, "ffmpeg produced no mp3");
  assert.equal(Buffer.concat(chunks).toString("hex"), mp3.toString("hex"));
  // MPEG audio frame sync: 11 set bits opening the first frame header.
  assert.equal(mp3[0], 0xff);
  assert.equal(mp3[1] & 0xe0, 0xe0);
});
