import { readPcm16 } from "./wavPcm";

/**
 * RHYTHM, MEASURED WITHOUT A RECOGNISER OR A REFERENCE CLIP.
 *
 * The third scorer, and the only one whose data GENERALISES. The transcript
 * rubric needs recognition that works; reference comparison needs a native clip
 * of the exact phrase and applies to nothing else. Rhythm is a property of the
 * LANGUAGE: measure it once from connected native speech and the norm covers
 * every phrase in that language, including ones not written yet.
 *
 * WHAT IT CATCHES. Indic languages are broadly syllable-timed, English is
 * stress-timed. A diaspora learner imports English timing and sounds foreign
 * while every individual sound is correct, which is the one thing neither other
 * scorer can see: the transcript is spelling, and DTW deliberately warps timing
 * away so it can compare two speeds of the same word.
 *
 * THE MEASURES, all standard in the phonetics literature:
 *   nPVI   how much CONSECUTIVE vowel durations differ, normalised by their
 *          mean so overall speed cancels out. High is stress-timed, low is
 *          syllable-timed.
 *   %V     the share of the utterance that is vocalic.
 *   rate   vocalic intervals per second, the crudest and most robust number.
 *
 * ⚠ NOT WIRED TO ANYTHING, AND ITS RESOLUTION IS THE POINT.
 *
 * THE FIRST VERSION WAS WRONG AND THE WAY IT WAS WRONG IS WORTH KEEPING. It
 * counted VOICED runs as vowels. Nasals, liquids and voiced stops are all
 * periodic, so "vowel nasal vowel" came back as ONE interval. Every language
 * measured 68 to 84 where the published range is 40 to 65, connected Hindi
 * returned 2.05 intervals per second against a real syllable rate near five,
 * and the measure pointed the WRONG WAY on English versus Kashmiri. Splitting
 * each voiced run at its sonority peaks fixed it; see vocalicIntervals.
 *
 * I ALSO OVERSTATED THE METHOD in the first draft, writing that the published
 * work leans on voicing detection. It does not; it uses hand-labelled or
 * force-aligned vowels. Corrected here rather than quietly dropped.
 *
 * WHAT IS MEASURED NOW, on connected native speech, 2026-08-28:
 *
 *     Hindi     nPVI 46.1   rate 3.49/s    8 min
 *     Tamil 1   nPVI 37.8   rate 5.48/s   10 min
 *     Tamil 2   nPVI 44.4   rate 4.89/s   23 min
 *
 * All three land in the published syllable-timed band, which is the correct
 * answer for all three, and Tamil's five-plus intervals per second is a real
 * syllable rate rather than a blob count.
 *
 * TWO TAMIL RECORDINGS DIFFER BY 6.6 nPVI POINTS, AND THAT IS THE NOISE FLOOR.
 * It is as large as the Tamil-to-Hindi gap, so this CANNOT tell one
 * syllable-timed language from another and must never be asked to. What it can
 * plausibly see is the syllable-timed to stress-timed gap, which is about 20
 * points: a diaspora learner speaking Tamil with English timing. Large effect,
 * useful diagnostic, honest limit.
 *
 * STILL UNPROVEN: every recording measured so far is syllable-timed. The
 * 20-point gap is read from the literature, not measured here, until connected
 * STRESS-timed speech goes through this.
 *
 * STILL WRONG: percentV reports 63 to 71% where real speech is nearer 45%. The
 * sonority split fixed the interval count and not the total voiced time, so a
 * run's consonantal shoulders still count as vocalic.
 *
 * IT CANNOT SCORE A SHORT PHRASE. nPVI is a statistic over consecutive
 * intervals; four words give four vowels and a meaningless number. This belongs
 * where learners produce whole utterances, which is Bolo Chat, and NOT in phrase
 * practice. That is a placement decision rather than a caveat.
 */

const HOP_MS = 10;
const WIN_MS = 30;
/** Pitch search range, wide enough for a child at the top and a man at the bottom. */
const F0_MIN = 70;
const F0_MAX = 400;
/** Normalised autocorrelation above this counts the frame as voiced. */
const VOICING_THRESHOLD = 0.35;
/** Frames quieter than this share of the clip's median voiced energy are not vowels. */
const ENERGY_FLOOR = 0.15;
/** Shorter than this is a glitch rather than a vowel: 30 ms at a 10 ms hop. */
const MIN_VOCALIC_FRAMES = 3;
/**
 * Two sonority peaks closer together than this are one vowel, not two.
 * 70 ms at a 10 ms hop, comfortably under the shortest real syllable.
 */
const MIN_PEAK_SEPARATION = 7;
/**
 * How far energy must fall between two peaks for them to count as separate
 * syllables, as a fraction of the lower peak. A dip of less than this is
 * amplitude wobble inside one vowel.
 */
const PEAK_DIP_RATIO = 0.6;
/** Below this many intervals, nPVI is noise. See the note above about placement. */
export const MIN_INTERVALS_FOR_NPVI = 8;

export interface RhythmResult {
  /** Normalised pairwise variability index over vocalic durations. */
  npvi: number;
  /** Share of voiced-and-loud time in the whole clip, 0 to 1. */
  percentV: number;
  /** Vocalic intervals per second. */
  rate: number;
  /** How many intervals the statistics rest on. Below MIN_INTERVALS_FOR_NPVI, distrust npvi. */
  intervals: number;
  seconds: number;
}

/** Normalised autocorrelation peak in the pitch range: high means periodic. */
function voicing(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / F0_MAX);
  const maxLag = Math.min(Math.floor(sampleRate / F0_MIN), frame.length - 1);
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy <= 0) return 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < frame.length; i++) acc += frame[i] * frame[i + lag];
    const norm = acc / energy;
    if (norm > best) best = norm;
  }
  return best;
}

/** Vocalic interval durations in seconds, in order. */
export function vocalicIntervals(samples: Int16Array, sampleRate: number): number[] {
  const win = Math.round((WIN_MS / 1000) * sampleRate);
  const hop = Math.round((HOP_MS / 1000) * sampleRate);
  const voiced: boolean[] = [];
  const energies: number[] = [];

  for (let start = 0; start + win <= samples.length; start += hop) {
    const f = new Float32Array(win);
    let e = 0;
    for (let i = 0; i < win; i++) {
      f[i] = samples[start + i] / 32768;
      e += f[i] * f[i];
    }
    energies.push(e);
    voiced.push(voicing(f, sampleRate) >= VOICING_THRESHOLD);
  }

  // The energy floor comes from the clip's OWN voiced frames rather than an
  // absolute level, so a quiet recording is not read as having no vowels in it.
  const voicedEnergies = energies.filter((_, i) => voiced[i]).sort((a, b) => a - b);
  if (voicedEnergies.length === 0) return [];
  const floor = voicedEnergies[Math.floor(voicedEnergies.length / 2)] * ENERGY_FLOOR;

  // Collect voiced-and-loud RUNS first.
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < voiced.length; i++) {
    const on = voiced[i] && energies[i] >= floor;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= MIN_VOCALIC_FRAMES) runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0 && voiced.length - start >= MIN_VOCALIC_FRAMES) runs.push([start, voiced.length]);

  // A RUN IS NOT A VOWEL, and assuming it was is what broke the first version.
  // Vowels, nasals and liquids are all voiced, so "vowel nasal vowel" comes back
  // as ONE long run. Measured 2026-08-28 on eight minutes of connected Hindi:
  // 2.05 intervals per second where the language runs about five syllables a
  // second, and 63% vocalic where real speech is nearer 45%. Both are the
  // signature of merged runs.
  //
  // Splitting on SONORITY PEAKS is the standard language-independent fix: each
  // syllable carries an energy maximum, and the dips between them are the
  // consonants. A peak only counts when energy falls far enough on both sides
  // to be a real boundary rather than wobble inside one vowel.
  const out: number[] = [];
  for (const [a, b] of runs) {
    const peaks: number[] = [];
    for (let i = a + 1; i < b - 1; i++) {
      if (energies[i] <= energies[i - 1] || energies[i] < energies[i + 1]) continue;
      const last = peaks[peaks.length - 1];
      if (last !== undefined) {
        if (i - last < MIN_PEAK_SEPARATION) {
          if (energies[i] > energies[last]) peaks[peaks.length - 1] = i;
          continue;
        }
        let dip = Infinity;
        for (let k = last; k <= i; k++) dip = Math.min(dip, energies[k]);
        if (dip > PEAK_DIP_RATIO * Math.min(energies[last], energies[i])) {
          if (energies[i] > energies[last]) peaks[peaks.length - 1] = i;
          continue;
        }
      }
      peaks.push(i);
    }
    if (peaks.length <= 1) {
      out.push(((b - a) * hop) / sampleRate);
      continue;
    }
    // Each nucleus owns the span to the midpoint of its neighbours.
    let edge = a;
    for (let p = 0; p < peaks.length; p++) {
      const next = p + 1 < peaks.length ? Math.floor((peaks[p] + peaks[p + 1]) / 2) : b;
      out.push(((next - edge) * hop) / sampleRate);
      edge = next;
    }
  }
  return out;
}

/**
 * nPVI over consecutive durations.
 *
 * DIVIDING BY THE PAIR'S MEAN IS THE WHOLE POINT: it cancels overall speed, so
 * a slow speaker and a fast one with the same rhythm score the same. Without
 * that normalisation this would measure tempo, which DTW already handles.
 */
export function npvi(durations: number[]): number {
  if (durations.length < 2) return 0;
  let acc = 0;
  for (let i = 0; i < durations.length - 1; i++) {
    const mean = (durations[i] + durations[i + 1]) / 2;
    if (mean > 0) acc += Math.abs(durations[i] - durations[i + 1]) / mean;
  }
  return (100 * acc) / (durations.length - 1);
}

/** Returns null when the clip cannot be decoded or holds no vowels at all. */
export function analyseRhythm(wav: Buffer): RhythmResult | null {
  const pcm = readPcm16(wav);
  if (!pcm) return null;
  const durations = vocalicIntervals(pcm.samples, pcm.sampleRate);
  if (durations.length === 0) return null;
  const seconds = pcm.samples.length / pcm.sampleRate;
  const vocalic = durations.reduce((a, b) => a + b, 0);
  return {
    npvi: npvi(durations),
    percentV: vocalic / seconds,
    rate: durations.length / seconds,
    intervals: durations.length,
    seconds,
  };
}
