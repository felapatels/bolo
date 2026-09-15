/**
 * Scored by hearing it back (referenceScoring.ts, owner 2026-09-14): the
 * closed-set verdict over a lesson's reference audio.
 *
 * Synthetic "words" rather than fixtures, for the reason pronunciationCompare's
 * suite gives: no binaries, runs anywhere. Each word is two vowels in sequence,
 * the smallest sound with a spectral trajectory, which is what the comparer
 * needs (a held vowel is invisible to it after mean normalisation).
 *
 * WHY speechCapability ARRIVES BY DYNAMIC IMPORT UNDER A DATABASE MOCK
 * (2026-09-15). It imports @workspace/db, whose index throws when DATABASE_URL
 * is unset, and this file is in pure-tests.txt, which runs with no database.
 * Imported statically, the file failed to load and none of its tests ran, and
 * the pure run's summary does not say so (the X77 shape). Found by Bolo East
 * porting this file. gatesOnScoreFor is pure, so the mock's db is never read.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  judgeTakeAgainstReferences,
  isReferenceScored,
  CLEAR_MATCH_FLOOR,
  OTHER_PHRASE_CEILING,
  REFERENCE_SCORED_LANGUAGES,
} from "./referenceScoring";
import { compareToReference, compareToReferences } from "./pronunciationCompare";
import { createDbMockExports } from "../test/dbMock";

mock.module("@workspace/db", { namedExports: createDbMockExports({}) });

const { gatesOnScoreFor } = await import("./speechCapability");

function wav(samples: Int16Array, sampleRate = 16000): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i]!, i * 2);
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

/** Harmonics of f0 weighted toward fixed formants: a crude vowel (see pronunciationCompare.test.ts). */
function vowel(f0: number, formants: number[], seconds: number, sampleRate = 16000): Int16Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Int16Array(n);
  const bw = 120;
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

function word(f0: number, first: number[], second: number[], seconds = 0.6): Buffer {
  const a = vowel(f0, first, seconds / 2);
  const b = vowel(f0, second, seconds / 2);
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return wav(out);
}

const A = [730, 1090];
const I = [270, 2290];
const U = [300, 870];

/** A three-phrase "lesson" in one reference voice. */
const lesson = [
  { phraseId: 1, wav: word(150, A, I) },
  { phraseId: 2, wav: word(150, I, U) },
  { phraseId: 3, wav: word(150, U, A) },
];

test("the languages scored this way are India's two unscored ones", () => {
  assert.deepEqual([...REFERENCE_SCORED_LANGUAGES].sort(), ["brx", "mni"]);
  assert.equal(isReferenceScored("brx"), true);
  assert.equal(isReferenceScored("hi"), false);
  assert.equal(isReferenceScored(undefined), false);
});

test("a different voice saying the target line lands on it, clearly, at full credit", () => {
  // A higher learner voice than the reference: the vocal tract warp search is
  // what keeps this a match rather than a different word.
  const take = word(210, A, I, 0.7);
  const v = judgeTakeAgainstReferences(take, 1, lesson);
  assert.equal(v.outcome, "matched");
  assert.equal(v.nearestPhraseId, 1);
  assert.ok(v.score >= CLEAR_MATCH_FLOOR, `clear match should be full credit, got ${v.score}`);
});

test("saying a neighbouring line instead is a miss, never full or half credit", () => {
  const take = word(150, I, U);
  const v = judgeTakeAgainstReferences(take, 1, lesson);
  assert.equal(v.outcome, "other_phrase");
  assert.equal(v.nearestPhraseId, 2);
  assert.ok(v.score <= OTHER_PHRASE_CEILING, `a wrong line must stay in retry, got ${v.score}`);
});

test("silence is unmeasurable, which the route turns into nocatch, not a bad score", () => {
  const silence = wav(new Int16Array(16000));
  const v = judgeTakeAgainstReferences(silence, 1, lesson);
  assert.equal(v.outcome, "unmeasurable");
  assert.equal(v.score, 0);
  assert.equal(v.nearestPhraseId, null);
});

test("no usable reference for the target is unmeasurable, even with neighbours", () => {
  const take = word(150, A, I);
  const v = judgeTakeAgainstReferences(take, 1, lesson.filter((r) => r.phraseId !== 1));
  assert.equal(v.outcome, "unmeasurable");
});

test("a lone phrase with no neighbours falls back to the absolute scale", () => {
  const take = word(150, A, I);
  const v = judgeTakeAgainstReferences(take, 1, [lesson[0]!]);
  assert.equal(v.nearestPhraseId, 1);
  assert.equal(v.runnerUpDistance, null);
  assert.ok(v.outcome === "matched" || v.outcome === "unclear");
});

test("compareToReferences is compareToReference, once per reference", () => {
  // The closed set must measure exactly what the single comparison measures,
  // or the 29-clip Bodo numbers the constants rest on stop applying.
  const take = word(190, U, A, 0.5);
  const many = compareToReferences(take, lesson.map((r) => r.wav));
  lesson.forEach((r, i) => {
    const one = compareToReference(r.wav, take);
    assert.ok(one && many[i]);
    assert.equal(many[i]!.distance, one!.distance);
    assert.equal(many[i]!.warp, one!.warp);
  });
});

test("a language scored by hearing it back keeps its stops open", () => {
  // Existing Bodo and Manipuri learners reached later stops while nothing was
  // scored; gating them on this approximate score would lock them out.
  assert.equal(gatesOnScoreFor("brx", "degraded"), false);
  assert.equal(gatesOnScoreFor("mni", "unsupported"), false);
  assert.equal(gatesOnScoreFor("hi", "supported"), true);
  assert.equal(gatesOnScoreFor("ks", "degraded"), true);
  assert.equal(gatesOnScoreFor("sat", null), true);
  assert.equal(gatesOnScoreFor("xx", "unsupported"), false);
});
