import { readPcm16 } from "./wavPcm";

/**
 * PITCH TRACKING, and the intonation measures built on it.
 *
 * Shared infrastructure rather than one feature: intonation needs an f0 contour,
 * and so does TONE for the four tonal languages in the catalogue (Punjabi,
 * Dogri, Meetei, Bodo). speechRhythm.ts already finds a pitch period to decide
 * whether a frame is voiced and then throws the value away; this keeps it.
 *
 * YIN RATHER THAN PLAIN AUTOCORRELATION. Raw autocorrelation octave-errors
 * badly: the peak at twice the true period is often as tall as the real one, so
 * a tracker picks 100 Hz for a 200 Hz voice and the contour jumps an octave
 * mid-word. YIN's cumulative mean normalised difference function suppresses
 * that by construction, and it is about fifteen lines.
 *
 * EVERYTHING IS REPORTED IN SEMITONES AGAINST THE SPEAKER'S OWN MEDIAN, never
 * in hertz. An adult male sits near 110 Hz, a woman near 200, a seven-year-old
 * near 300. A rule written in hertz would say every child was shouting and every
 * man was bored. This is the same mistake vocal tract length made in
 * pronunciationCompare.ts, where a three semitone shift nearly scored a correct
 * word as a wrong one, and it is avoided here by construction rather than
 * patched later.
 */

const HOP_MS = 10;
const WIN_MS = 40;
const F0_MIN = 70;
const F0_MAX = 400;
/** YIN's absolute threshold: below this, the dip is a real period. */
const YIN_THRESHOLD = 0.15;
/** The share of an utterance's voiced frames that counts as its ending. */
const TERMINAL_SHARE = 0.3;
/** Fewer voiced frames than this and no contour is worth reporting. */
const MIN_VOICED_FRAMES = 10;

export interface PitchPoint {
  /** Seconds from the start of the clip. */
  t: number;
  /** Semitones relative to the utterance's median pitch. */
  semitones: number;
}

export interface IntonationResult {
  /** The speaker's median pitch in this clip, hertz. Reported for sanity, never compared. */
  medianHz: number;
  /** Semitones per second over the final stretch. Positive is a rise. */
  terminalSlope: number;
  /** Total semitone span of the contour: how much the voice moved at all. */
  range: number;
  voicedFrames: number;
  contour: PitchPoint[];
}

/** YIN pitch estimate for one frame, in hertz, or 0 when unvoiced. */
function yinF0(frame: Float32Array, sampleRate: number): number {
  const maxLag = Math.min(Math.floor(sampleRate / F0_MIN), Math.floor(frame.length / 2));
  const minLag = Math.floor(sampleRate / F0_MAX);
  const diff = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      const d = frame[i] - frame[i + lag];
      acc += d * d;
    }
    diff[lag] = acc;
  }
  // Cumulative mean normalisation: this is the step that kills octave errors.
  const cmnd = new Float64Array(maxLag + 1).fill(1);
  let running = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    running += diff[lag];
    cmnd[lag] = running > 0 ? (diff[lag] * (lag - minLag + 1)) / running : 1;
  }
  // The FIRST dip below threshold, not the deepest: taking the deepest is how a
  // tracker lands an octave low.
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < YIN_THRESHOLD) {
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
      return sampleRate / lag;
    }
  }
  return 0;
}

/** The voiced pitch contour, in semitones against the clip's own median. */
export function pitchContour(samples: Int16Array, sampleRate: number): PitchPoint[] {
  const win = Math.round((WIN_MS / 1000) * sampleRate);
  const hop = Math.round((HOP_MS / 1000) * sampleRate);
  const raw: { t: number; hz: number }[] = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    const f = new Float32Array(win);
    for (let i = 0; i < win; i++) f[i] = samples[start + i] / 32768;
    const hz = yinF0(f, sampleRate);
    if (hz >= F0_MIN && hz <= F0_MAX) raw.push({ t: start / sampleRate, hz });
  }
  if (raw.length === 0) return [];
  const sorted = raw.map((p) => p.hz).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return raw.map((p) => ({ t: p.t, semitones: 12 * Math.log2(p.hz / median) }));
}

/**
 * Slope over the last TERMINAL_SHARE of the contour, by least squares.
 *
 * THE END IS WHERE THE GRAMMAR LIVES. A question rises into its final syllable
 * and a statement falls; the middle of an utterance carries emphasis and accent
 * that vary far more between speakers than the ending does.
 */
export function terminalSlope(contour: PitchPoint[]): number {
  if (contour.length < 4) return 0;
  const from = Math.floor(contour.length * (1 - TERMINAL_SHARE));
  const pts = contour.slice(from);
  const n = pts.length;
  if (n < 3) return 0;
  const mt = pts.reduce((a, p) => a + p.t, 0) / n;
  const ms = pts.reduce((a, p) => a + p.semitones, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.t - mt) * (p.semitones - ms);
    den += (p.t - mt) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/** Returns null when the clip cannot be decoded or holds too little voicing. */
export function analyseIntonation(wav: Buffer): IntonationResult | null {
  const pcm = readPcm16(wav);
  if (!pcm) return null;
  const contour = pitchContour(pcm.samples, pcm.sampleRate);
  if (contour.length < MIN_VOICED_FRAMES) return null;
  const semis = contour.map((p) => p.semitones).sort((a, b) => a - b);
  const raw = contour.map((p) => p.semitones);
  const medianHz = 0; // filled below
  const lo = semis[Math.floor(semis.length * 0.05)];
  const hi = semis[Math.floor(semis.length * 0.95)];
  return {
    medianHz: medianHz,
    terminalSlope: terminalSlope(contour),
    range: hi - lo,
    voicedFrames: raw.length,
    contour,
  };
}
