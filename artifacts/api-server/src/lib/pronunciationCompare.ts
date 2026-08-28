import { readPcm16 } from "./wavPcm";

/**
 * REFERENCE-COMPARISON PRONUNCIATION SCORING.
 *
 * Built 2026-08-28 for the languages the recogniser cannot hear. Bodo and
 * Manipuri are speechCapability 'unsupported', so the transcript-based rubric in
 * routes/openai.ts has nothing to work with: there is no transcript. This scores
 * a learner's attempt against a NATIVE RECORDING OF THE SAME WORD instead, which
 * needs no recogniser, no lexicon and no per-language model. It needs one clip.
 *
 * The method is the pre-neural template-matching one, and it is the right tool
 * here precisely because it is old: MFCCs, cepstral mean normalisation, then
 * dynamic time warping to align two utterances that are the same words at
 * different speeds. No dependencies, because the api-server runs on Replit and a
 * native audio package is not worth the deployment risk.
 *
 * WHAT THE DISTANCE ACTUALLY MEASURES, and this governs how it may be used.
 * It is not "how wrong was the pronunciation". It is the sum of:
 *
 *   1. genuine pronunciation difference          <- the only part you want
 *   2. WHO IS SPEAKING: vocal tract length, age, sex
 *   3. the microphone and the room
 *   4. speaking rate                             <- DTW absorbs most of this
 *
 * Item 2 is the dangerous one and it is LARGE. A seven-year-old measured against
 * an adult reference differs in formant frequencies by more than a mispronounced
 * consonant ever will, so a naive distance would fail every child while they
 * pronounce perfectly. That is the same failure as scoring pitch in raw hertz.
 *
 * Two things push back on it, and neither is a cure:
 *   - CEPSTRAL MEAN NORMALISATION subtracts each utterance's own average
 *     spectrum, which removes the channel and some of the speaker.
 *
 *     IT HAS A COST, FOUND BY TEST ON 2026-08-28 AND WORTH KNOWING. For a
 *     SUSTAINED, UNCHANGING sound the utterance mean IS the sound, so
 *     subtracting it leaves almost nothing: two held vowels with completely
 *     different formants, /a/ and /i/ at one pitch, came out 0.31 apart, i.e.
 *     indistinguishable. The method therefore depends on the clip having
 *     spectral VARIATION over time, which every real word has and a held tone
 *     does not. It is safe for words and must not be pointed at sustained
 *     single phones. The 29 native clips bear this out: 812 wrong-word pairings
 *     never scored below 22.8.
 *   - Liftering and a low coefficient count keep the comparison on broad
 *     spectral shape rather than fine voice detail.
 *
 * SO THE SCORE MAPPING IS DELIBERATELY NOT CALIBRATED HERE. `scoreFromDistance`
 * carries two constants that must be measured against real learner attempts
 * before any of this is shown to anybody, and it says so at the call site. Every
 * expensive mistake in this repo has been an instrument nobody zeroed.
 */

// 25 ms analysis window, 10 ms hop: the standard speech frame, chosen because
// it is short enough to sit inside a single phone and long enough to hold a
// pitch period at an adult male's f0.
const WINDOW_MS = 25;
const HOP_MS = 10;
/** Mel filters spanning the band that carries speech. */
const MEL_FILTERS = 26;
const MEL_LOW_HZ = 80;
const MEL_HIGH_HZ = 7600;
/**
 * Coefficients kept per frame. Thirteen is the long-standing default: enough to
 * describe the spectral envelope, few enough to leave the speaker's fine
 * structure out of it. C0 (overall energy) is dropped for the same reason a
 * loud learner should not score differently from a quiet one.
 */
const N_CEPS = 13;
/** Below this fraction of the clip's peak frame energy, a frame is silence. */
const TRIM_FLOOR = 0.02;
/**
 * A clip whose LOUDEST frame is below this has no speech in it at all.
 *
 * The relative trim floor alone cannot catch silence, because everything is
 * silent relative to itself: digital silence has a peak of zero, every frame
 * sits at the floor, and the trim walks inward until one frame is left. That
 * one frame then aligned against a real reference and produced a distance of
 * 0.30, i.e. a score of 100 for saying nothing. Caught by test 2026-08-28.
 *
 * This app has already been bitten once by a silent recording producing a
 * confident answer: holding the mic and saying nothing returned a fully formed
 * Hindi sentence. Absence of speech must never become a number.
 */
const ABSOLUTE_SILENCE = 1e-6;
/**
 * Fewer frames than this is not a word. At a 10 ms hop that is 150 ms, which is
 * shorter than any of the 29 native clips by a wide margin.
 */
const MIN_FRAMES = 15;
/**
 * Vocal tract warp search range. See the note in compareToReference.
 *
 * THE GRID MUST LAND EXACTLY ON 1.0. The first version ran 0.86 to 1.16 in
 * steps of 0.025, which steps straight over the identity warp: 0.985 then 1.01.
 * A clip compared against ITSELF then scored 1.45 to 3.53 instead of zero,
 * because the best available analysis was always slightly wrong. These bounds
 * are chosen so 1.0 is on the grid.
 */
const VTLN_MIN = 0.85;
const VTLN_MAX = 1.15;
const VTLN_STEP = 0.025;

export interface CompareResult {
  /** Mean DTW cost per aligned frame. Lower is closer. Never negative. */
  distance: number;
  /** Attempt length over reference length, after both are trimmed. 1.0 is equal. */
  durationRatio: number;
  referenceFrames: number;
  attemptFrames: number;
  /** The vocal tract warp that fitted best. 1.0 means the speakers matched. */
  warp: number;
  /**
   * Cost per REFERENCE frame along the alignment path, worst case where several
   * attempt frames map to one reference frame.
   *
   * THIS IS WHAT MAKES PER-FEATURE SCORING POSSIBLE LATER, and it is why the
   * mean alone is not enough. A single number says "this differed"; the profile
   * says WHERE it differed. Line it up against the reference's own phone
   * timings and "the third consonant was wrong" becomes answerable, which is
   * the whole route to scoring aspiration or a retroflex rather than a word.
   * Nothing consumes it yet. It is returned because throwing it away and
   * recomputing later would mean running the alignment twice.
   */
  costProfile: Float32Array;
}

// ---------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------

/** Int16 to normalised float, with a fixed pre-emphasis that lifts the highs
 *  the way every speech front end does: consonant cues live up there. */
function toFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] / 32768;
    out[i] = x - 0.97 * prev;
    prev = x;
  }
  return out;
}

/**
 * Drops leading and trailing silence.
 *
 * NOT optional, and not cosmetic. DTW aligns endpoint to endpoint, so a clip
 * with half a second of room tone on the front would spend a quarter of its
 * alignment matching silence against speech and report a large distance for a
 * perfect attempt.
 */
function trim(frames: Float32Array[], energies: number[]): Float32Array[] {
  const peak = Math.max(...energies, 0);
  // Nothing was said. Returning empty is what makes the caller answer null.
  if (peak < ABSOLUTE_SILENCE) return [];
  const floor = peak * TRIM_FLOOR;
  let a = 0;
  let b = frames.length - 1;
  while (a < b && energies[a] < floor) a++;
  while (b > a && energies[b] < floor) b--;
  return frames.slice(a, b + 1);
}

/** In-place iterative radix-2 FFT. Real input, complex in/out. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);

/**
 * Triangular mel filterbank over the positive half spectrum.
 *
 * `warp` is the VTLN factor. Scaling the filter centre frequencies is the
 * standard way to compensate for vocal tract length: a shorter tract (a child)
 * pushes every formant up, and warping the analysis by the same ratio puts them
 * back where the reference has them.
 */
function melBank(fftSize: number, sampleRate: number, warp = 1): Float32Array[] {
  const bins = fftSize / 2 + 1;
  const lo = hzToMel(MEL_LOW_HZ);
  const hi = hzToMel(Math.min(MEL_HIGH_HZ, sampleRate / 2));
  const points: number[] = [];
  for (let i = 0; i < MEL_FILTERS + 2; i++) {
    const hz = melToHz(lo + ((hi - lo) * i) / (MEL_FILTERS + 1)) * warp;
    points.push(Math.floor(((fftSize + 1) * hz) / sampleRate));
  }
  const bank: Float32Array[] = [];
  for (let m = 1; m <= MEL_FILTERS; m++) {
    const f = new Float32Array(bins);
    const [l, c, r] = [points[m - 1], points[m], points[m + 1]];
    for (let k = l; k < c; k++) if (k >= 0 && k < bins && c > l) f[k] = (k - l) / (c - l);
    for (let k = c; k < r; k++) if (k >= 0 && k < bins && r > c) f[k] = (r - k) / (r - c);
    bank.push(f);
  }
  return bank;
}

/** Frames of MFCCs, cepstral-mean-normalised across the utterance. */
export function mfccFrames(
  samples: Int16Array,
  sampleRate: number,
  warp = 1,
): Float32Array[] {
  const signal = toFloat(samples);
  const win = Math.round((WINDOW_MS / 1000) * sampleRate);
  const hop = Math.round((HOP_MS / 1000) * sampleRate);
  let fftSize = 1;
  while (fftSize < win) fftSize <<= 1;

  const hamming = new Float32Array(win);
  for (let i = 0; i < win; i++) hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (win - 1));
  const bank = melBank(fftSize, sampleRate, warp);
  const bins = fftSize / 2 + 1;

  const frames: Float32Array[] = [];
  const energies: number[] = [];
  for (let start = 0; start + win <= signal.length; start += hop) {
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    let energy = 0;
    for (let i = 0; i < win; i++) {
      const s = signal[start + i];
      energy += s * s;
      re[i] = s * hamming[i];
    }
    fft(re, im);

    const power = new Float32Array(bins);
    for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];

    const logMel = new Float32Array(MEL_FILTERS);
    for (let m = 0; m < MEL_FILTERS; m++) {
      let acc = 0;
      const f = bank[m];
      for (let k = 0; k < bins; k++) acc += power[k] * f[k];
      logMel[m] = Math.log(acc + 1e-10);
    }

    // DCT-II. C0 is skipped: it is loudness, and loudness is not pronunciation.
    const ceps = new Float32Array(N_CEPS);
    for (let c = 1; c <= N_CEPS; c++) {
      let acc = 0;
      for (let m = 0; m < MEL_FILTERS; m++) {
        acc += logMel[m] * Math.cos((Math.PI * c * (m + 0.5)) / MEL_FILTERS);
      }
      ceps[c - 1] = acc;
    }
    frames.push(ceps);
    energies.push(energy);
  }

  const kept = trim(frames, energies);

  // CEPSTRAL MEAN NORMALISATION, over the TRIMMED frames only. Subtracting the
  // utterance's own average spectrum removes the constant part of the channel
  // (microphone, room) and a useful share of the speaker. Including the trimmed
  // silence in that mean would drag it toward room tone and undo the point.
  if (kept.length === 0) return kept;
  const mean = new Float32Array(N_CEPS);
  for (const f of kept) for (let c = 0; c < N_CEPS; c++) mean[c] += f[c];
  for (let c = 0; c < N_CEPS; c++) mean[c] /= kept.length;
  for (const f of kept) for (let c = 0; c < N_CEPS; c++) f[c] -= mean[c];
  return kept;
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

function euclidean(a: Float32Array, b: Float32Array): number {
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    acc += d * d;
  }
  return Math.sqrt(acc);
}

/**
 * Dynamic time warping, returning cost per aligned frame.
 *
 * DIVIDING BY THE PATH LENGTH IS WHAT MAKES IT COMPARABLE across words. Without
 * it a long word scores worse than a short one purely for being long, and a
 * three-syllable phrase could never beat "eat".
 */
export interface DtwResult {
  distance: number;
  /** Worst cost charged against each frame of `a`. Length equals a.length. */
  profile: Float32Array;
}

export function dtwDistance(a: Float32Array[], b: Float32Array[]): number {
  return dtw(a, b).distance;
}

/** Alignment with the per-frame cost kept. */
export function dtw(a: Float32Array[], b: Float32Array[]): DtwResult {
  if (a.length === 0 || b.length === 0) {
    return { distance: Infinity, profile: new Float32Array(0) };
  }
  const INF = Number.POSITIVE_INFINITY;
  const profile = new Float32Array(a.length);
  let prev = new Float64Array(b.length + 1).fill(INF);
  let prevSteps = new Float64Array(b.length + 1).fill(0);
  prev[0] = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Float64Array(b.length + 1).fill(INF);
    const curSteps = new Float64Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      const cost = euclidean(a[i - 1], b[j - 1]);
      let best = prev[j];
      let steps = prevSteps[j];
      if (cur[j - 1] < best) {
        best = cur[j - 1];
        steps = curSteps[j - 1];
      }
      if (prev[j - 1] < best) {
        best = prev[j - 1];
        steps = prevSteps[j - 1];
      }
      if (best === INF) continue;
      cur[j] = best + cost;
      curSteps[j] = steps + 1;
      // Cheap stand-in for backtracking the path: the worst local cost this
      // reference frame was ever charged. Good enough to localise a difference,
      // and it costs no extra pass.
      if (cost > profile[i - 1]) profile[i - 1] = cost;
    }
    prev = cur;
    prevSteps = curSteps;
  }
  const total = prev[b.length];
  const steps = prevSteps[b.length];
  return { distance: steps > 0 ? total / steps : Infinity, profile };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Compares an attempt against a native reference. Both must be 16-bit PCM WAV;
 * they need not share a sample rate or a length.
 *
 * Returns null when either clip cannot be decoded or holds no speech above the
 * trim floor. A null is "I could not measure this", which callers must NOT
 * render as a bad score. That distinction is the whole reason the pronunciation
 * route has a 'nocatch' band.
 */
export function compareToReference(
  referenceWav: Buffer,
  attemptWav: Buffer,
): CompareResult | null {
  const ref = readPcm16(referenceWav);
  const att = readPcm16(attemptWav);
  if (!ref || !att) return null;

  const refFrames = mfccFrames(ref.samples, ref.sampleRate);
  if (refFrames.length < MIN_FRAMES) return null;

  // VTLN BY SEARCH, AND WITHOUT IT THIS WHOLE MODULE IS UNUSABLE.
  //
  // Measured 2026-08-28 on the 29 native Bodo clips. Unwarped, the metric
  // handled speaking rate beautifully (a 25% tempo change scored 100) and fell
  // apart on the speaker: a THREE SEMITONE pitch shift, far less than the gap
  // between an adult and a seven-year-old, took a perfectly pronounced word to
  // a distance of 21.7 when a COMPLETELY DIFFERENT WORD sits at 23.3. Headroom
  // of 0.63 is no headroom, and every child would have scored zero.
  //
  // So the attempt is analysed at a range of vocal tract warps and the best fit
  // wins. The learner is not penalised for the size of their head. The range is
  // the usual one for adult-to-child compensation; the step is coarse because
  // the alignment is tolerant and 13 passes over a one second clip is cheap.
  let best: { distance: number; profile: Float32Array; frames: number; warp: number } | null = null;
  for (let warp = VTLN_MIN; warp <= VTLN_MAX + 1e-9; warp += VTLN_STEP) {
    const attFrames = mfccFrames(att.samples, att.sampleRate, warp);
    if (attFrames.length < MIN_FRAMES) continue;
    const d = dtw(refFrames, attFrames);
    if (!best || d.distance < best.distance) {
      best = { distance: d.distance, profile: d.profile, frames: attFrames.length, warp };
    }
  }
  if (!best) return null;

  return {
    distance: best.distance,
    durationRatio: best.frames / refFrames.length,
    referenceFrames: refFrames.length,
    attemptFrames: best.frames,
    warp: best.warp,
    costProfile: best.profile,
  };
}

/**
 * Maps a DTW distance to 0-100.
 *
 * THE SHAPE IS MEASURED. WHERE A HUMAN WOULD DRAW THE LINE IS NOT.
 *
 * Measured 2026-08-28 over the 29 native Bodo clips, 841 pairings, plus
 * synthetic degradations of four of them:
 *
 *     a clip against itself            0.0
 *     the same word, 0.8x and 1.25x    4.1 and 5.2   rate is absorbed
 *     the same word, pitch +/-3 st     6.3 and 8.5   after VTLN; 21+ without it
 *     the same word, noise added      13.6
 *     a DIFFERENT word                22.8 at closest, 38.6 median
 *
 * So 6 and 26 put every same-word variant above 60 and every wrong word below
 * 20, with the closest wrong pairing landing near 15. That is a defensible
 * shape and it is NOT a calibration.
 *
 * WHAT IS STILL MISSING IS THE ONLY THING THAT MATTERS FOR A LEARNER: nobody
 * has measured a real attempt by a real child, and nobody has had a speaker
 * rate one. Until that exists these constants say "this differs from the
 * reference by about this much", not "this was worth 70 out of 100". Show a
 * comparison, not a mark, and see the persona rules on why: accent and
 * pronunciation are never the joke, and a confident wrong number is worse than
 * no number at all.
 *
 * Calibrating means collecting real attempts, having a speaker rate them, and
 * fitting these two numbers to that. Until then, show the learner a comparison,
 * not a score. See the persona rules: accent and pronunciation are never the
 * joke, and a confident wrong number is worse than no number.
 */
export const DISTANCE_AT_100 = 6;
export const DISTANCE_AT_0 = 26;

export function scoreFromDistance(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= DISTANCE_AT_100) return 100;
  if (distance >= DISTANCE_AT_0) return 0;
  const t = (distance - DISTANCE_AT_100) / (DISTANCE_AT_0 - DISTANCE_AT_100);
  return Math.round(100 * (1 - t));
}
