/**
 * FROM SPEECH TIMINGS TO MOUTH SHAPES.
 *
 * Implements the lip sync spec (artifact 2b5796bb, 2026-09-13). Phrase audio is
 * fetched from ElevenLabs' /with-timestamps endpoint, which returns a start and
 * end time for every character, and today the server keeps only the audio
 * (lib/integrations-openai-ai-server/src/audio/client.ts reads `audio_base64`
 * and drops `alignment`). This turns that alignment into a track of mouth
 * shapes the 3D bird can play.
 *
 * Why per-character timing is good enough here, when it is poor for English:
 * in Ge'ez, Hangul and the Brahmic scripts a character is a syllable, and in
 * the Latin orthographies this fleet teaches (Swahili, Hausa, Yoruba, Zulu) a
 * letter is close to a sound. So these are close to syllable boundaries, which
 * is the unit a beak opens and closes on.
 *
 * The spec's three rules, all enforced below:
 *   1. never hold a shape for less than 60 ms (short ones merge into a neighbour)
 *   2. closed on silence, closed before the first sound and after the last
 *   3. blend, do not cut (sampleMouth cross-fades over 40 ms)
 *
 * Pure: no clock, no audio, no DOM. The same phrase always gives the same track.
 */

import type { VisemeKey } from './contract';

export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/**
 * `closed` is silence. `MBP` is a lip closure inside speech: the same shape on a
 * beak, kept separate because it is the one closure a viewer consciously checks.
 * `rest` is the half-open mouth a consonant passes through.
 */
export type MouthShape = 'closed' | 'rest' | 'AA' | 'E' | 'I' | 'O' | 'U' | 'MBP';
export type MouthKey = { t: number; shape: MouthShape };

export const MIN_HOLD_SECONDS = 0.06;
export const BLEND_SECONDS = 0.04;

/** How far the beak opens for a shape, for a rig that has a jaw and no shape keys. */
export const MOUTH_OPENNESS: Record<MouthShape, number> = {
  closed: 0,
  MBP: 0,
  rest: 0.25,
  I: 0.3,
  U: 0.35,
  E: 0.45,
  O: 0.7,
  AA: 1,
};

/** The shape key that carries a mouth shape on a rig built to the brief. */
export const SHAPE_KEY_FOR_MOUTH: Record<MouthShape, VisemeKey | null> = {
  closed: null,
  rest: null,
  AA: 'viseme_AA',
  E: 'viseme_E',
  I: 'viseme_I',
  O: 'viseme_O',
  U: 'viseme_U',
  MBP: 'viseme_MBP',
};

type Class = MouthShape | 'consonant' | 'silence';
/** A character can be a whole syllable (Ge'ez, Hangul): closure, then vowel. */
type Sound = { onset?: 'MBP'; nucleus: Class; coda?: 'MBP' };

const LATIN_VOWELS: Record<string, MouthShape> = { a: 'AA', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I', w: 'U' };
const LATIN_BILABIAL = new Set(['m', 'b', 'p', 'ɓ']);

// The Brahmic blocks share one layout (inherited from ISCII), so one table of
// offsets serves Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu,
// Kannada and Malayalam.
const BRAHMIC_BLOCKS = [0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00];
const BRAHMIC_VOWEL: Record<number, MouthShape> = {
  0x05: 'AA', 0x06: 'AA', 0x07: 'I', 0x08: 'I', 0x09: 'U', 0x0a: 'U',
  0x0e: 'E', 0x0f: 'E', 0x10: 'E', 0x12: 'O', 0x13: 'O', 0x14: 'O',
  // vowel signs
  0x3e: 'AA', 0x3f: 'I', 0x40: 'I', 0x41: 'U', 0x42: 'U',
  0x46: 'E', 0x47: 'E', 0x48: 'E', 0x4a: 'O', 0x4b: 'O', 0x4c: 'O',
};
const BRAHMIC_BILABIAL = new Set([0x2a, 0x2b, 0x2c, 0x2d, 0x2e]); // pa pha ba bha ma
const BRAHMIC_VIRAMA = 0x4d;

function brahmicOffset(code: number): number | null {
  for (const base of BRAHMIC_BLOCKS) if (code >= base && code < base + 0x80) return code - base;
  return null;
}

// Ge'ez: each syllable row has seven vowel orders plus a labialised eighth.
const ETHIOPIC_ORDER: MouthShape[] = ['AA', 'U', 'I', 'AA', 'E', 'rest', 'O', 'AA'];
const ETHIOPIC_BILABIAL_ROWS = new Set([0x1218, 0x1260, 0x1268, 0x1330, 0x1350]); // me be ve p'e pe

// Hangul syllable blocks: initial, medial, final.
const HANGUL_INITIAL_BILABIAL = new Set([6, 7, 8, 16]); // ㅁ ㅂ ㅃ ㅍ
const HANGUL_MEDIAL: MouthShape[] = ['AA', 'E', 'AA', 'E', 'O', 'E', 'O', 'E', 'O', 'AA', 'E', 'E', 'O', 'U', 'O', 'E', 'I', 'U', 'I', 'I', 'I'];
const HANGUL_FINAL_BILABIAL = new Set([16, 17, 18, 26]); // ㅁ ㅂ ㅄ ㅍ

const ARABIC: Record<number, Class> = {
  0x0627: 'AA', 0x0622: 'AA', 0x0623: 'AA', 0x0625: 'I', 0x0648: 'U', 0x064a: 'I', 0x0649: 'AA',
  0x0645: 'MBP', 0x0628: 'MBP', 0x067e: 'MBP',
  0x064e: 'AA', 0x064f: 'U', 0x0650: 'I', 0x0652: 'silence', 0x0651: 'consonant',
};

function isSilence(ch: string): boolean {
  return /^[\s\p{P}\p{S}]$/u.test(ch) || ch === '';
}

/** What one character sounds like, given the character after it. */
export function soundOf(ch: string, next = ''): Sound {
  if (isSilence(ch)) return { nucleus: 'silence' };
  const code = ch.codePointAt(0) ?? 0;

  // Latin, including tone and dot marks (Yoruba ẹ ọ, Igbo ị ụ, Hausa ɓ).
  if (code < 0x0250 || (code >= 0x1e00 && code < 0x1f00)) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (LATIN_VOWELS[base]) return { nucleus: LATIN_VOWELS[base] };
    if (LATIN_BILABIAL.has(base)) return { nucleus: 'MBP' };
    if (/\p{N}/u.test(base)) return { nucleus: 'AA' };
    return { nucleus: 'consonant' };
  }
  if (ch === 'ɓ') return { nucleus: 'MBP' };

  const brahmic = brahmicOffset(code);
  if (brahmic !== null) {
    if (BRAHMIC_VOWEL[brahmic]) return { nucleus: BRAHMIC_VOWEL[brahmic] };
    if (brahmic === BRAHMIC_VIRAMA || brahmic < 0x05) return { nucleus: 'consonant' };
    if (brahmic >= 0x15 && brahmic <= 0x39) {
      // A consonant carries the inherent "a" unless a vowel sign or a virama follows.
      const nextOffset = next ? brahmicOffset(next.codePointAt(0) ?? 0) : null;
      const followed = nextOffset !== null && (nextOffset === BRAHMIC_VIRAMA || (nextOffset >= 0x3e && nextOffset <= 0x4c));
      if (BRAHMIC_BILABIAL.has(brahmic)) return followed ? { nucleus: 'MBP' } : { onset: 'MBP', nucleus: 'AA' };
      return { nucleus: followed ? 'consonant' : 'AA' };
    }
    return { nucleus: 'consonant' };
  }

  if (code >= 0x1200 && code < 0x1380) {
    const order = (code - 0x1200) % 8;
    const row = code - order;
    return { onset: ETHIOPIC_BILABIAL_ROWS.has(row) ? 'MBP' : undefined, nucleus: ETHIOPIC_ORDER[order] };
  }

  if (code >= 0xac00 && code <= 0xd7a3) {
    const index = code - 0xac00;
    const initial = Math.floor(index / 588);
    const medial = Math.floor((index % 588) / 28);
    const final = index % 28;
    return {
      onset: HANGUL_INITIAL_BILABIAL.has(initial) ? 'MBP' : undefined,
      nucleus: HANGUL_MEDIAL[medial],
      coda: HANGUL_FINAL_BILABIAL.has(final) ? 'MBP' : undefined,
    };
  }

  if (code >= 0x0600 && code < 0x0700) return { nucleus: ARABIC[code] ?? 'rest' };

  // Han, Thai, Lao, Khmer and anything else without a table: every character is
  // spoken, so give it an open mouth that varies deterministically, rather than
  // a frozen beak. A table per script can replace this one script at a time.
  const cycle: MouthShape[] = ['AA', 'O', 'E', 'AA', 'U'];
  return { nucleus: cycle[code % cycle.length] };
}

type Segment = { start: number; end: number; shape: MouthShape };

/** Merge neighbours that ended up with the same shape. */
function coalesce(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.shape === s.shape && Math.abs(last.end - s.start) < 1e-6) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

/** Timings arrive in milliseconds; anything within one is the same length. */
const TOLERANCE = 0.001;
const lengthOf = (s: Segment) => s.end - s.start;

/**
 * Rule 1. Anything shorter than the minimum hold merges into a neighbour.
 *
 * A CLOSURE (MBP) GOES LAST, NOT FIRST. It is the shape a viewer notices when
 * it is missing, and the first version of this merged it away whenever its
 * neighbours were short too: the "b" in "Karibu" (60 ms, between a 50 ms "i" and
 * a 50 ms "u") vanished from the real Swahili sample. So closures are grown to
 * the minimum first, borrowing spare time from their neighbours and swallowing
 * a vowel outright if they must, and only then is everything else merged.
 */
function enforceMinimumHold(segments: Segment[], minHold: number): Segment[] {
  const list = coalesce(segments);

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.shape !== 'MBP' || lengthOf(s) >= minHold - TOLERANCE) continue;
    let need = minHold - lengthOf(s);
    const next = list[i + 1];
    const prev = list[i - 1];
    if (next) {
      const spare = Math.max(0, Math.min(need, lengthOf(next) - minHold));
      next.start += spare;
      s.end += spare;
      need -= spare;
    }
    if (need > TOLERANCE && prev) {
      const spare = Math.max(0, Math.min(need, lengthOf(prev) - minHold));
      prev.end -= spare;
      s.start -= spare;
      need -= spare;
    }
    if (need > TOLERANCE && next && next.shape !== 'MBP') {
      s.end = next.end;
      list.splice(i + 1, 1);
      need = minHold - lengthOf(s);
    }
    if (need > TOLERANCE && prev && prev.shape !== 'MBP') {
      s.start = prev.start;
      list.splice(i - 1, 1);
      i--;
    }
  }

  const merged = coalesce(list);
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    if (s.shape === 'MBP' || lengthOf(s) >= minHold - TOLERANCE) continue;
    const prev = merged[i - 1];
    const next = merged[i + 1];
    if (prev && prev.shape !== 'MBP') prev.end = s.end;
    else if (next && next.shape !== 'MBP') next.start = s.start;
    else if (prev) prev.end = s.end;
    else if (next) next.start = s.start;
    else continue;
    merged.splice(i, 1);
    i--;
  }
  return coalesce(merged);
}

/** Tier 1: a mouth track from ElevenLabs' per-character alignment. */
export function mouthTrackFromAlignment(alignment: Alignment, minHold = MIN_HOLD_SECONDS): MouthKey[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const segments: Segment[] = [];
  let lastVowel: MouthShape | null = null;
  let lastVowelEnd = -Infinity;

  for (let i = 0; i < chars.length; i++) {
    const start = starts[i];
    const end = Math.max(ends[i], start);
    if (!(end > start)) continue;
    const sound = soundOf(chars[i], chars[i + 1]);
    // A pause ends the word. The first consonant after it must not reopen on
    // the previous word's vowel ("sana" opened on the U of "Karibu").
    if (sound.nucleus === 'silence') lastVowel = null;
    const resolve = (c: Class): MouthShape => {
      if (c === 'silence') return 'closed';
      if (c === 'consonant') return lastVowel && start - lastVowelEnd < 0.15 ? lastVowel : 'rest';
      return c;
    };
    const nucleus = resolve(sound.nucleus);
    const pieces: Segment[] = [];
    const span = end - start;
    if (sound.onset && sound.coda) {
      pieces.push({ start, end: start + span * 0.3, shape: 'MBP' });
      pieces.push({ start: start + span * 0.3, end: start + span * 0.8, shape: nucleus });
      pieces.push({ start: start + span * 0.8, end, shape: 'MBP' });
    } else if (sound.onset) {
      pieces.push({ start, end: start + span * 0.35, shape: 'MBP' });
      pieces.push({ start: start + span * 0.35, end, shape: nucleus });
    } else if (sound.coda) {
      pieces.push({ start, end: start + span * 0.75, shape: nucleus });
      pieces.push({ start: start + span * 0.75, end, shape: 'MBP' });
    } else {
      pieces.push({ start, end, shape: nucleus });
    }
    // Gaps between characters are silence.
    const previousEnd = segments.length ? segments[segments.length - 1].end : 0;
    if (start > previousEnd + 1e-6) segments.push({ start: previousEnd, end: start, shape: 'closed' });
    segments.push(...pieces);
    if (!['closed', 'rest', 'MBP'].includes(nucleus)) {
      lastVowel = nucleus;
      lastVowelEnd = end;
    }
  }

  const held = enforceMinimumHold(segments, minHold);
  return toKeys(held);
}

/**
 * Tier 2: no alignment (an OpenAI voice, a cached clip, an unknown script).
 * The beak opens and closes on a syllable rhythm and shuts exactly when the
 * audio does, which the old blind wiggle never did.
 */
export function mouthTrackFromDuration(durationSeconds: number, text = ''): MouthKey[] {
  if (!(durationSeconds > 0)) return [{ t: 0, shape: 'closed' }];
  const latinSyllables = (text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[aeiouy]+/g) ?? []).length;
  const visible = [...text].filter((ch) => !isSilence(ch)).length;
  const estimate = latinSyllables || Math.round(visible * 0.9) || Math.round(durationSeconds / 0.22);
  const period = Math.min(0.35, Math.max(0.14, durationSeconds / Math.max(1, estimate)));
  const cycle: MouthShape[] = ['AA', 'O', 'E', 'AA', 'U', 'I'];
  const segments: Segment[] = [];
  let t = 0;
  let k = 0;
  while (t + period * 0.5 < durationSeconds) {
    const open = Math.min(durationSeconds, t + period * 0.6);
    segments.push({ start: t, end: open, shape: cycle[k % cycle.length] });
    const close = Math.min(durationSeconds, t + period);
    if (close > open) segments.push({ start: open, end: close, shape: 'rest' });
    t += period;
    k++;
  }
  return toKeys(enforceMinimumHold(segments, MIN_HOLD_SECONDS));
}

function toKeys(segments: Segment[]): MouthKey[] {
  const keys: MouthKey[] = [];
  if (!segments.length || segments[0].start > 0) keys.push({ t: 0, shape: 'closed' });
  for (const s of segments) {
    const last = keys[keys.length - 1];
    if (last && last.shape === s.shape) continue;
    if (last && Math.abs(last.t - s.start) < 1e-9) {
      last.shape = s.shape;
      continue;
    }
    keys.push({ t: round(s.start), shape: s.shape });
  }
  // Rule 2: shut when the sound ends.
  const end = segments.length ? segments[segments.length - 1].end : 0;
  const last = keys[keys.length - 1];
  if (last.shape !== 'closed') keys.push({ t: round(end), shape: 'closed' });
  return keys;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** When the track's mouth last closes: the moment she should stop "talking". */
export function mouthTrackEnd(track: MouthKey[]): number {
  return track.length ? track[track.length - 1].t : 0;
}

/**
 * Rule 3: the mouth at time t, as weights per shape, cross-fading from the
 * previous shape over the first BLEND_SECONDS of each key.
 */
export function sampleMouth(track: MouthKey[], t: number, blend = BLEND_SECONDS): Partial<Record<MouthShape, number>> {
  if (!track.length || t < 0) return { closed: 1 };
  let i = 0;
  while (i + 1 < track.length && track[i + 1].t <= t) i++;
  const current = track[i];
  const previous = track[i - 1];
  const since = t - current.t;
  if (!previous || since >= blend || blend <= 0) return { [current.shape]: 1 };
  const mix = since / blend;
  const eased = mix * mix * (3 - 2 * mix);
  if (previous.shape === current.shape) return { [current.shape]: 1 };
  return { [previous.shape]: 1 - eased, [current.shape]: eased };
}

/** The beak's openness at time t, for a rig that opens a jaw instead of shape keys. */
export function opennessAt(track: MouthKey[], t: number): number {
  const weights = sampleMouth(track, t);
  let open = 0;
  for (const [shape, w] of Object.entries(weights)) open += MOUTH_OPENNESS[shape as MouthShape] * (w ?? 0);
  return open;
}
