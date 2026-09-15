// CONVERTTOWAV STOPS AT A LENGTH, WHATEVER THE INPUT DECODES TO.
//
// Found by the 2026-09-15 review of the contribution page's phrase mode
// (finding 3), measured with convertToWav's own arguments: an hour of silence
// as FLAC is 371,735 bytes, under the phrase route's 1 MB cap, and became a
// 115,200,078-byte WAV in 0.28 s. As Ogg-FLAC it starts "OggS", so a
// magic-byte gate calls it ogg and lets it through. Any signed-in learner
// reaches convertToWav through /openai/pronunciation.
//
// The cap lives in lib/integrations-openai-ai-server/src/audio/client.ts, the
// copy the api imports, with the reasoning for 120 seconds.
//
// PURE: no database. The two cases that run ffmpeg skip, and say so in the
// count, where ffmpeg is not on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MAX_DECODE_SECONDS,
  convertToWav,
  convertToWavArgs,
} from "@workspace/integrations-openai-ai-server/audio";
import { wavDurationSeconds } from "./audioDuration";

/** 16 kHz mono signed 16-bit PCM, which is what convertToWav writes. */
const PCM_BYTES_PER_SECOND = 16_000 * 2;

test("the ffmpeg arguments cap the output's length, as an output option", () => {
  const args = convertToWavArgs("IN", "OUT");
  const t = args.indexOf("-t");
  assert.ok(t >= 0, "no -t: convertToWav decodes for as long as the input runs");
  assert.equal(args[t + 1], String(MAX_DECODE_SECONDS));
  // After -i and before the output path, so it bounds the WAV written rather
  // than the input's own timeline, which a crafted file gets to describe.
  const i = args.indexOf("-i");
  assert.ok(i >= 0 && args[i + 1] === "IN");
  assert.ok(t > i + 1, "-t must come after the input");
  assert.equal(args[args.length - 1], "OUT", "the output path stays last");
  // The rest of the conversion is what every reader of the output assumes.
  for (const [flag, value] of [["-f", "wav"], ["-ar", "16000"], ["-ac", "1"], ["-acodec", "pcm_s16le"]]) {
    assert.equal(args[args.indexOf(flag!) + 1], value, `${flag} changed`);
  }
  // The lookups above can say no.
  assert.equal(args.indexOf("-ss"), -1);
});

test("the cap sits above the declared limits of the callers that have one", () => {
  // Read as text: both modules pull in the database, and this file stays pure.
  const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), "utf8");
  const phrase = /const MAX_PHRASE_DURATION_MS = (\d+) \* 1000;/.exec(read("../routes/scriptTrace.ts"));
  assert.ok(phrase, "could not find the phrase take limit in routes/scriptTrace.ts");
  assert.ok(MAX_DECODE_SECONDS > Number(phrase[1]), "a phrase take the route accepts would be cut short");
  const freeChat = /export const FREE_WEEKLY_CHAT_SECONDS_CAP = (\d+);/.exec(read("./entitlements.ts"));
  assert.ok(freeChat, "could not find the free weekly chat allowance in lib/entitlements.ts");
  assert.ok(MAX_DECODE_SECONDS >= Number(freeChat[1]), "one chat turn could outlast a free learner's whole week");
  // And it still bounds something: minutes, not the hour the review measured.
  assert.ok(MAX_DECODE_SECONDS <= 600);
});

const noFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 ? false : "ffmpeg is not on PATH";

/** Silence of a given length, encoded as FLAC in the given container, made by ffmpeg itself. */
function silence(seconds: number, container: "ogg" | "flac"): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "decode-cap-"));
  try {
    const out = join(dir, `silence.${container}`);
    const made = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
      "-t", String(seconds),
      "-c:a", "flac", "-f", container, "-y", out,
    ]);
    assert.equal(made.status, 0, `could not make the fixture: ${String(made.stderr)}`);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a small input that decodes to minutes stops at the cap", { skip: noFfmpeg }, async () => {
  // The review's shape, five times the cap long: silence as Ogg-FLAC, so the
  // bytes start OggS and would pass for an ordinary ogg recording.
  const input = silence(MAX_DECODE_SECONDS * 5, "ogg");
  assert.equal(input.subarray(0, 4).toString("latin1"), "OggS");
  assert.ok(
    input.length < (1024 * 1024 * 3) / 4,
    `the fixture should fit under the phrase route's 1 MB of base64; it is ${input.length} bytes`,
  );

  const wav = await convertToWav(input);
  const seconds = wavDurationSeconds(wav);
  assert.ok(Math.abs(seconds - MAX_DECODE_SECONDS) < 0.5, `expected about ${MAX_DECODE_SECONDS} s, got ${seconds} s`);
  assert.ok(
    wav.length <= (MAX_DECODE_SECONDS + 1) * PCM_BYTES_PER_SECOND,
    `${wav.length} bytes is more than ${MAX_DECODE_SECONDS} s of PCM`,
  );
});

test("an ordinary take converts whole", { skip: noFfmpeg }, async () => {
  // The control: the cap must not be what every conversion now returns.
  const wav = await convertToWav(silence(3, "flac"));
  const seconds = wavDurationSeconds(wav);
  assert.ok(Math.abs(seconds - 3) < 0.25, `expected about 3 s, got ${seconds} s`);
});
