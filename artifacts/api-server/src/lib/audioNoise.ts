/**
 * Noise production baseline: a derived signal-to-noise estimate for the
 * recording behind a pronunciation attempt.
 *
 * Why this exists: hold-to-talk recording means every clip opens with a
 * stretch of room tone before the learner speaks, which is a free per-clip
 * sample of their actual surroundings. Comparing that opening against the
 * loudest part of the clip sizes how much background noise learners are
 * practising in, and (joined with the attempt's band) how often noise costs
 * them an attempt.
 *
 * What this is NOT: it retains nothing. No audio, no transcript, no new
 * category of data, only a single derived number per attempt. The voice
 * contribution program spec (docs/specs/voice-data-program.md) governs RAW
 * RECORDINGS (consent, retention, deletion, access to audio); it is silent on
 * derived measurements, and this module keeps no bytes to be governed.
 *
 * Contract:
 *  - Best-effort. `measureAttemptSnrDb` never throws and never rejects; it
 *    resolves to null when the clip cannot be measured. Scoring must be
 *    byte-identical whether the measurement succeeds or fails.
 *  - Reuses the SAME ffmpeg conversion helper the pronunciation route already
 *    depends on (`convertToWav`) rather than introducing a second decoder, and
 *    skips it entirely when the pipeline already produced WAV.
 *  - Callers run it CONCURRENTLY with the STT passes, so it costs no wall-clock
 *    time on the instant-feedback path (decode is tens of ms; STT is ~1 s).
 */

import { convertToWav } from "@workspace/integrations-openai-ai-server/audio";

/** Frame length used for the short-term energy envelope. */
const FRAME_MS = 20;
/** How much of the clip's opening counts as the room-tone sample. */
const LEAD_WINDOW_MS = 300;
/** Never treat more than this fraction of a clip as "the opening". */
const LEAD_MAX_FRACTION = 0.4;
/** Below two frames there is no opening to compare against anything. */
const MIN_FRAMES = 2;
/** One 16-bit LSB, the quietest thing that is not digital silence. */
const AMPLITUDE_EPSILON = 1;
/** Reported values are clamped into this range so outliers stay analysable. */
const SNR_MIN_DB = -20;
const SNR_MAX_DB = 60;

interface PcmView {
  samples: Int16Array;
  sampleRate: number;
}

/**
 * Reads canonical PCM WAV bytes (as produced by convertToWav: 16 kHz mono
 * s16le) into sample values. Walks the RIFF chunk list rather than assuming a
 * 44-byte header, and takes channel 0 when a file is multi-channel.
 *
 * Returns null for anything that is not 16-bit PCM WAV.
 */
function readPcm16(buffer: Buffer): PcmView | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === "fmt " && body + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      dataStart = body;
      // A streamed WAV can declare a bogus size; trust the real byte count.
      dataLength = Math.min(chunkSize, Math.max(0, buffer.length - body));
      break;
    }
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (dataStart < 0 || sampleRate <= 0 || channels <= 0) return null;
  if (bitsPerSample !== 16) return null;

  const frameBytes = 2 * channels;
  const frameCount = Math.floor(dataLength / frameBytes);
  if (frameCount <= 0) return null;

  const samples = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    // Channel 0 only: convertToWav emits mono, and for anything else one
    // channel is a faithful enough sample of the room.
    samples[i] = buffer.readInt16LE(dataStart + i * frameBytes);
  }
  return { samples, sampleRate };
}

function rms(samples: Int16Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  const n = to - from;
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

function percentile(sortedAscending: number[], fraction: number): number {
  if (sortedAscending.length === 0) return 0;
  const idx = Math.min(
    sortedAscending.length - 1,
    Math.max(0, Math.round(fraction * (sortedAscending.length - 1))),
  );
  return sortedAscending[idx]!;
}

/**
 * Signal-to-noise estimate, in dB, for canonical PCM WAV bytes.
 *
 * How it degrades, by design (no clip shape is an error):
 *  - clip shorter than two frames (< 40 ms) → null (there is no opening to
 *    compare against anything);
 *  - digital silence → 0 dB (nothing rises above the floor);
 *  - all speech, no quiet opening → the 10th-percentile frame stands in for the
 *    floor, so the value is small and positive rather than absent;
 *  - a click or breath in the opening → the percentile floor undercuts it, so
 *    one loud frame cannot masquerade as a noisy room;
 *  - not 16-bit PCM WAV at all → null.
 */
export function snrDbFromWav(wav: Buffer): number | null {
  const pcm = readPcm16(wav);
  if (!pcm) return null;

  const frameLength = Math.max(1, Math.round((pcm.sampleRate * FRAME_MS) / 1000));
  const frameCount = Math.floor(pcm.samples.length / frameLength);
  if (frameCount < MIN_FRAMES) return null;

  const frameRms: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    frameRms[f] = rms(pcm.samples, f * frameLength, (f + 1) * frameLength);
  }

  // The room-tone opening: the first LEAD_WINDOW_MS, never more than
  // LEAD_MAX_FRACTION of the clip, always at least one frame.
  const leadFrames = Math.max(
    1,
    Math.min(
      Math.floor(frameCount * LEAD_MAX_FRACTION),
      Math.round(LEAD_WINDOW_MS / FRAME_MS),
    ),
  );
  let leadPower = 0;
  for (let f = 0; f < leadFrames; f++) leadPower += frameRms[f]! * frameRms[f]!;
  const leadRms = Math.sqrt(leadPower / leadFrames);

  const ascending = [...frameRms].sort((a, b) => a - b);
  // Floor fallback for the all-speech case, and a guard against a click in
  // the opening: whichever floor estimate is quieter is the honest one.
  const noise = Math.min(leadRms, percentile(ascending, 0.1));

  // Signal: the loudest tenth of the clip (at least one frame), which is where
  // the learner actually speaks.
  const loudCount = Math.max(1, Math.ceil(frameCount * 0.1));
  let loudPower = 0;
  for (let i = ascending.length - loudCount; i < ascending.length; i++) {
    loudPower += ascending[i]! * ascending[i]!;
  }
  const speech = Math.sqrt(loudPower / loudCount);

  // Digital silence (or so close to it that nothing was captured at all).
  if (speech <= AMPLITUDE_EPSILON) return 0;

  const snr = 20 * Math.log10(speech / Math.max(noise, AMPLITUDE_EPSILON));
  const clamped = Math.min(SNR_MAX_DB, Math.max(SNR_MIN_DB, snr));
  return Math.round(clamped * 10) / 10;
}

/**
 * Best-effort SNR for one attempt's recording.
 *
 * `converted`/`format` are the pronunciation route's existing
 * `ensureCompatibleFormat` output: when that already produced WAV the decode is
 * free, and otherwise the same ffmpeg helper the pipeline already ships turns
 * the container into PCM. Never throws, every failure resolves to null so the
 * attempt scores and records exactly as it would without this measurement.
 */
export async function measureAttemptSnrDb(
  converted: Buffer,
  format: string,
): Promise<number | null> {
  try {
    if (format === "wav") return snrDbFromWav(converted);
    const wav = await convertToWav(converted);
    return snrDbFromWav(wav);
  } catch {
    // Deliberately silent at this level: the caller logs, and a measurement
    // failure must never be visible in the learner's result.
    return null;
  }
}
