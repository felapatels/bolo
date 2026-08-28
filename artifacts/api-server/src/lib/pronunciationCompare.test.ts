/**
 * Reference-comparison scoring: the properties that make it usable, and the
 * one that nearly sank it.
 *
 * Built with synthetic audio rather than fixtures so the suite carries no
 * binary and runs anywhere. The real separation numbers quoted in
 * pronunciationCompare.ts came from 29 native Bodo clips, 841 pairings; these
 * tests pin the behaviour those measurements depend on.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  compareToReference,
  scoreFromDistance,
  DISTANCE_AT_100,
  DISTANCE_AT_0,
} from "./pronunciationCompare";

/** Minimal 16 kHz mono s16le WAV around the given samples. */
function wav(samples: Int16Array, sampleRate = 16000): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i], i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/**
 * A crude vowel: harmonics of `f0`, each weighted by how near it falls to one of
 * the given formant frequencies.
 *
 * A PLAIN HARMONIC STACK IS THE WRONG TEST SIGNAL AND IT MISLED ME ONCE. Two
 * bare tones at 200 Hz and 700 Hz came out 2.02 apart, i.e. nearly identical,
 * and that is CORRECT behaviour rather than a bug: a tone stack has no
 * resonances, so scaling its pitch scales the entire spectrum, and vocal tract
 * normalisation maps one exactly onto the other. Real speech does not work that
 * way. Formants are fixed resonances of the tract; they move with the SPEAKER
 * and not with the note being sung. So the signal here holds f0 and formants
 * separately, which is the only way to tell "different vowel" apart from
 * "different person".
 */
function vowel(
  f0: number,
  formants: number[],
  seconds: number,
  sampleRate = 16000,
): Int16Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Int16Array(n);
  const bw = 120; // resonance width, in hertz
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / n);
    let v = 0;
    for (let h = 1; h * f0 < sampleRate / 2; h++) {
      const hz = h * f0;
      let gain = 0.02;
      for (const f of formants) gain += 1 / (1 + ((hz - f) / bw) ** 2);
      v += (gain / h) * Math.sin(2 * Math.PI * hz * t);
    }
    out[i] = Math.max(-32000, Math.min(32000, Math.round(env * v * 2500)));
  }
  return out;
}

/** Three vowels with clearly different resonances: roughly /a/, /i/, /u/. */
const A_FORMANTS = [730, 1090];
const I_FORMANTS = [270, 2290];
const U_FORMANTS = [300, 870];

/**
 * A word-shaped sound: two vowels in sequence, which is the smallest thing with
 * a spectral TRAJECTORY rather than a fixed spectrum.
 *
 * A held single vowel is the wrong test signal and it is worth knowing why.
 * Cepstral mean normalisation subtracts the utterance's own average spectrum,
 * and for an unchanging sound that average is the whole sound, so two held
 * vowels with entirely different formants came out 0.31 apart. That is a real
 * property of the method rather than a defect, it is written up in the module,
 * and every actual word has the variation that makes it a non-issue.
 */
function word(f0: number, first: number[], second: number[], seconds: number): Int16Array {
  const a = vowel(f0, first, seconds / 2);
  const b = vowel(f0, second, seconds / 2);
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const scale = (fs: number[], k: number) => fs.map((f) => f * k);

test("a clip against itself is a perfect match", () => {
  // The identity case, and it is not free: the VTLN grid has to land exactly on
  // a warp of 1.0 or the best available analysis is always slightly wrong. An
  // earlier grid stepped 0.985 then 1.01 and scored identical audio at 1.45.
  const clip = wav(word(180, A_FORMANTS, I_FORMANTS, 0.6));
  const r = compareToReference(clip, clip);
  assert.ok(r);
  assert.equal(r.distance, 0);
  assert.equal(scoreFromDistance(r.distance), 100);
  assert.equal(r.warp, 1);
});

test("speaking rate is absorbed, not punished", () => {
  // DTW exists for exactly this. The same sound held twice as long must not
  // read as a different sound. Measured on real clips at 0.8x and 1.25x tempo:
  // distance 4.1 and 5.2, both scoring 100.
  const slow = wav(word(180, A_FORMANTS, I_FORMANTS, 0.8));
  const fast = wav(word(180, A_FORMANTS, I_FORMANTS, 0.4));
  const r = compareToReference(slow, fast);
  assert.ok(r);
  assert.ok(r.distance < 6, `rate change should stay small, got ${r.distance}`);
  assert.ok(r.durationRatio < 1, "the shorter attempt should report a ratio under 1");
});

test("a different vowel is far away, even at the same pitch", () => {
  // Same voice, same note, different resonances. This is the contrast that
  // actually matters: it is what separates a mispronounced vowel from a
  // correctly pronounced one, and VTLN must NOT be able to warp it away.
  const ai = wav(word(180, A_FORMANTS, I_FORMANTS, 0.6));
  const iu = wav(word(180, I_FORMANTS, U_FORMANTS, 0.6));
  const r = compareToReference(ai, iu);
  assert.ok(r);
  assert.ok(r.distance > 6, `a different vowel should not look close, got ${r.distance}`);
});

test("a higher voice saying the same thing is not treated as a different word", () => {
  // THE TEST THIS MODULE EXISTS FOR. Without vocal tract normalisation a three
  // semitone shift took a correct word to 21.7 while a completely different
  // word sat at 23.3, leaving 0.63 of headroom and failing every child against
  // an adult reference. The warp search took the same pair to 8.5.
  // A smaller vocal tract raises f0 AND every formant with it, which is the
  // whole reason a naive spectral distance fails children.
  const adult = wav(word(180, A_FORMANTS, I_FORMANTS, 0.6));
  const child = wav(
    word(180 * 1.19, scale(A_FORMANTS, 1.19), scale(I_FORMANTS, 1.19), 0.6),
  );
  const r = compareToReference(adult, child);
  assert.ok(r);
  assert.ok(
    r.distance < 20,
    `a pitch difference must not read as a wrong word, got ${r.distance}`,
  );
  assert.notEqual(r.warp, 1, "the search should have chosen a non-identity warp");
});

test("silence and undecodable input return null, never a bad score", () => {
  // A null means "I could not measure this". A caller that renders it as zero
  // tells a learner they got it wrong when nothing was ever heard, which is
  // what the nocatch band exists to prevent.
  const real = wav(word(180, A_FORMANTS, I_FORMANTS, 0.6));
  assert.equal(compareToReference(real, wav(new Int16Array(8000))), null);
  assert.equal(compareToReference(Buffer.from("not a wav at all"), real), null);
});

test("the score mapping is monotonic and clamped at both ends", () => {
  assert.equal(scoreFromDistance(0), 100);
  assert.equal(scoreFromDistance(DISTANCE_AT_100), 100);
  assert.equal(scoreFromDistance(DISTANCE_AT_0), 0);
  assert.equal(scoreFromDistance(1e6), 0);
  assert.equal(scoreFromDistance(Infinity), 0);
  assert.equal(scoreFromDistance(NaN), 0);
  const mid = (DISTANCE_AT_100 + DISTANCE_AT_0) / 2;
  assert.ok(scoreFromDistance(mid) > 0 && scoreFromDistance(mid) < 100);
  for (let d = 0; d < DISTANCE_AT_0; d += 1) {
    assert.ok(scoreFromDistance(d) >= scoreFromDistance(d + 1), `not monotonic at ${d}`);
  }
});
