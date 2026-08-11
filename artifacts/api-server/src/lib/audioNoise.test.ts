/**
 * Noise production baseline: the signal-to-noise measurement itself.
 *
 * The measurement is observation-only, so the bar it has to clear is (a) it
 * ranks a quiet room above a noisy one, and (b) no clip shape — silence, all
 * speech, a fragment, or bytes that aren't audio at all — can turn into an
 * error, because an error here would cost a learner their attempt.
 */

import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

// convertToWav is the only thing audioNoise imports from the audio package.
// Swap it for a controllable stub so the "measurement blew up" case can be
// exercised without ffmpeg.
let convertBehaviour: (buf: Buffer) => Buffer = (buf) => buf;
let convertCalls = 0;

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    convertToWav: async (buf: Buffer) => {
      convertCalls++;
      return convertBehaviour(buf);
    },
  },
});

const { snrDbFromWav, measureAttemptSnrDb } = await import("./audioNoise");

// ── Synthetic clip helpers ───────────────────────────────────────────────────

const SAMPLE_RATE = 16_000;

/** Wraps 16-bit mono PCM samples in a canonical 44-byte WAV header. */
function wav(samples: number[], sampleRate = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    const clamped = Math.max(-32768, Math.min(32767, Math.round(s)));
    data.writeInt16LE(clamped, i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Deterministic pseudo-noise so a run can never flake on an unlucky draw.
function noise(ms: number, amplitude: number, seed = 1): number[] {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out: number[] = new Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out[i] = ((s / 2147483648) * 2 - 1) * amplitude;
  }
  return out;
}

function tone(ms: number, amplitude: number, hz = 180): number[] {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) * amplitude;
  }
  return out;
}

function mix(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

// A hold-to-talk clip: room tone first, then the learner.
const CLEAN = wav([...noise(300, 40), ...tone(1000, 8000)]);
const NOISY = wav([
  ...noise(300, 3000, 7),
  ...mix(tone(1000, 6000), noise(1000, 3000, 9)),
]);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("snrDbFromWav", () => {
  test("a clean clip (quiet opening, loud speech) reports a high SNR", () => {
    const snr = snrDbFromWav(CLEAN);
    assert.ok(snr != null, "clean clip must be measurable");
    assert.ok(snr! > 25, `expected a high SNR for a clean clip, got ${snr}`);
  });

  test("a noisy clip reports a much lower SNR than the same speech recorded cleanly", () => {
    const noisySnr = snrDbFromWav(NOISY);
    const cleanSnr = snrDbFromWav(CLEAN);
    assert.ok(noisySnr != null, "noisy clip must be measurable");
    assert.ok(
      noisySnr! < 18,
      `a room this noisy should not read as quiet, got ${noisySnr}`,
    );
    assert.ok(
      cleanSnr! - noisySnr! > 15,
      `clean (${cleanSnr}) should rank far above noisy (${noisySnr})`,
    );
  });

  test("digital silence degrades to 0 dB, not an error", () => {
    const snr = snrDbFromWav(wav(new Array(SAMPLE_RATE).fill(0)));
    assert.equal(snr, 0, "silence has nothing above the floor");
  });

  test("an all-speech clip with no quiet opening still returns a small value", () => {
    const snr = snrDbFromWav(wav(tone(1000, 8000)));
    assert.ok(snr != null, "an all-speech clip must not fail to measure");
    assert.ok(
      snr! >= 0 && snr! < 10,
      `all-speech should read as low headroom, got ${snr}`,
    );
  });

  test("a clip too short to hold an opening returns null rather than a guess", () => {
    const snr = snrDbFromWav(wav(tone(10, 6000)));
    assert.equal(snr, null, "10 ms cannot separate room tone from speech");
  });

  test("bytes that are not 16-bit PCM WAV return null", () => {
    assert.equal(snrDbFromWav(Buffer.from("not audio at all")), null);
    assert.equal(snrDbFromWav(Buffer.alloc(2000)), null, "zero-filled bytes are not a RIFF file");
    // Truncated: a valid header with no samples behind it.
    assert.equal(snrDbFromWav(wav([])), null);
  });
});

describe("measureAttemptSnrDb", () => {
  test("skips conversion entirely when the pipeline already produced WAV", async () => {
    convertCalls = 0;
    const snr = await measureAttemptSnrDb(CLEAN, "wav");
    assert.ok(snr != null && snr > 25, `expected a measurement, got ${snr}`);
    assert.equal(convertCalls, 0, "a WAV buffer must not be re-decoded");
  });

  test("reuses the existing conversion helper for other containers", async () => {
    convertCalls = 0;
    convertBehaviour = () => CLEAN;
    const snr = await measureAttemptSnrDb(Buffer.from("webm-bytes"), "webm");
    assert.equal(convertCalls, 1, "non-WAV input goes through convertToWav");
    assert.ok(snr != null && snr > 25, `expected a measurement, got ${snr}`);
  });

  test("a measurement failure resolves to null instead of throwing", async () => {
    convertBehaviour = () => {
      throw new Error("ffmpeg exploded");
    };
    const snr = await measureAttemptSnrDb(Buffer.from("webm-bytes"), "webm");
    assert.equal(snr, null, "a failed measurement must be absent, never an error");
    convertBehaviour = (buf) => buf;
  });

  test("undecodable output resolves to null", async () => {
    convertBehaviour = () => Buffer.from("still not audio");
    const snr = await measureAttemptSnrDb(Buffer.from("webm-bytes"), "webm");
    assert.equal(snr, null);
    convertBehaviour = (buf) => buf;
  });
});
