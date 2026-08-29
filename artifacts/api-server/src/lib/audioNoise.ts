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
 * category of data — only a single derived number per attempt. The voice
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
import { readPcm16, type PcmView } from "./wavPcm";

/** Frame length used for the short-term energy envelope. */
const FRAME_MS = 20;
/** How much of the clip's opening counts as the room-tone sample. */
const LEAD_WINDOW_MS = 300;
/** Never treat more than this fraction of a clip as "the opening". */
const LEAD_MAX_FRACTION = 0.4;
/** Below two frames there is no opening to compare against anything. */
const MIN_FRAMES = 2;
/** One 16-bit LSB — the quietest thing that is not digital silence. */
const AMPLITUDE_EPSILON = 1;
/** Reported values are clamped into this range so outliers stay analysable. */
const SNR_MIN_DB = -20;
const SNR_MAX_DB = 60;

export { readPcm16, type PcmView } from "./wavPcm";

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
/** RMS per FRAME_MS frame, or null for a clip too short to frame at all. */
function frameRmsSeries(pcm: PcmView): number[] | null {
  const frameLength = Math.max(1, Math.round((pcm.sampleRate * FRAME_MS) / 1000));
  const frameCount = Math.floor(pcm.samples.length / frameLength);
  if (frameCount < MIN_FRAMES) return null;
  const frameRms: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    frameRms[f] = rms(pcm.samples, f * frameLength, (f + 1) * frameLength);
  }
  return frameRms;
}

/**
 * HESITATION, MEASURED FROM THE CLIP ITSELF (build 20).
 *
 * Owner, 2026-08-29: "if the learner hesitates or does poorly, it should
 * surface again." Doing poorly already reaches the scheduler through the
 * score band; nothing measured hesitation, and neither client sends a timing
 * of any kind (every attempt is flagged latency_missing). The recording
 * starts when the learner taps Record, so the silence before their voice is
 * exactly the pause they took to find the words. That is measured here, on
 * the same decoded audio the SNR reads, and it costs no extra decode.
 *
 * The onset is the first frame that is clearly voice AND stays voice for the
 * next frame too. "Clearly voice" is louder than four times the noise floor
 * and at least a fifth of the clip's own speech level, capped at half that
 * level so a clip that is voice from its first sample (no quiet floor at
 * all) still finds its onset at zero. Holding for two frames (40 ms) is what
 * keeps a click or a breath in the opening from reading as the first word.
 * Null when the clip never reaches a voice-sized level at all (nothing was
 * said, which the transcript path already turns into a miss). The lead
 * frames and floor are the ones snrDbFromWav uses, so the two measurements
 * can never disagree about what "quiet" means.
 */
const ONSET_FLOOR_RATIO = 4;
const ONSET_SPEECH_FRACTION = 0.2;
const ONSET_SPEECH_CAP = 0.5;
const ONSET_SUSTAIN_FRAMES = 2;
/** Below this RMS (about -40 dBFS) nothing in the clip is a voice. */
const VOICE_MIN_RMS = 300;

export function leadingSilenceMsFromWav(wav: Buffer): number | null {
  const pcm = readPcm16(wav);
  if (!pcm) return null;
  const frameRms = frameRmsSeries(pcm);
  if (!frameRms) return null;
  const frameCount = frameRms.length;

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
  const noise = Math.max(Math.min(leadRms, percentile(ascending, 0.1)), AMPLITUDE_EPSILON);

  const loudCount = Math.max(1, Math.ceil(frameCount * 0.1));
  let loudPower = 0;
  for (let i = ascending.length - loudCount; i < ascending.length; i++) {
    loudPower += ascending[i]! * ascending[i]!;
  }
  const speech = Math.sqrt(loudPower / loudCount);
  if (speech < VOICE_MIN_RMS) return null;

  const threshold = Math.min(
    Math.max(noise * ONSET_FLOOR_RATIO, speech * ONSET_SPEECH_FRACTION),
    speech * ONSET_SPEECH_CAP,
  );
  for (let f = 0; f + ONSET_SUSTAIN_FRAMES <= frameCount; f++) {
    let sustained = true;
    for (let k = 0; k < ONSET_SUSTAIN_FRAMES; k++) {
      if (frameRms[f + k]! < threshold) {
        sustained = false;
        break;
      }
    }
    if (sustained) return f * FRAME_MS;
  }
  return null;
}

export interface AttemptAudioMeasures {
  snrDb: number | null;
  /** Milliseconds of silence before the learner's voice, or null when none was found. */
  hesitationMs: number | null;
}

/**
 * Both clip measurements from ONE decode. measureAttemptSnrDb stays for its
 * callers and tests; the pronunciation route uses this so the second
 * measurement adds no conversion to the learner's wait.
 */
export async function measureAttemptAudio(
  converted: Buffer,
  format: string,
): Promise<AttemptAudioMeasures> {
  try {
    const wav = format === "wav" ? converted : await convertToWav(converted);
    return { snrDb: snrDbFromWav(wav), hesitationMs: leadingSilenceMsFromWav(wav) };
  } catch {
    return { snrDb: null, hesitationMs: null };
  }
}

export function snrDbFromWav(wav: Buffer): number | null {
  const pcm = readPcm16(wav);
  if (!pcm) return null;

  const frameRms = frameRmsSeries(pcm);
  if (!frameRms) return null;
  const frameCount = frameRms.length;

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
 * the container into PCM. Never throws — every failure resolves to null so the
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
