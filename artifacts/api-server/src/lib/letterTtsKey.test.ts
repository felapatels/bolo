// THE LETTER CACHE KEY, and the one property that saves a 10 GiB database.
//
// A letter's sound belongs to its SCRIPT. Devanagari serves nine languages
// (Hindi, Marathi, Nepali, Sanskrit, Konkani, Bodo, Maithili, Dogri, Sindhi)
// and क sounds the same in all of them, so a language-keyed letter stores one
// identical clip nine times. Against a tts_cache already at 98% of a 10 GiB
// ceiling and climbing a gigabyte a month, that turns a bounded 529-clip set
// into something over 1,400 for no gain (owner ruling, 2026-09-04).
//
// PURE, so it runs anywhere including a Mac, which is deliberate: this is the
// one part of the audio work whose failure is invisible. A key that quietly
// went back to being language-shaped would look exactly like a working feature
// while the cache filled nine times over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { phraseTtsCacheKey } from "./ttsCache";

/** Exactly what routes/openai.ts builds when `script` is present or absent. */
function keyFor(text: string, identifier: string): string {
  return phraseTtsCacheKey(text, "gpt-4o-mini-tts", "gpt-4o-mini-tts", "nova", identifier);
}

const DEVANAGARI = [
  "Hindi",
  "Marathi",
  "Nepali",
  "Sanskrit",
  "Konkani",
  "Bodo",
  "Maithili",
  "Dogri",
  "Sindhi",
];

test("nine Devanagari languages share ONE key for the same letter", () => {
  const keys = new Set(DEVANAGARI.map(() => keyFor("क", "script:devanagari")));
  assert.equal(keys.size, 1, "one script, one clip, nine languages");
});

test("and would have had nine keys if it were language-shaped", () => {
  // The assertion that gives the one above its meaning: this is the behaviour
  // the script key replaced, not a hypothetical.
  const keys = new Set(DEVANAGARI.map((name) => keyFor("क", name)));
  assert.equal(keys.size, DEVANAGARI.length);
});

test("two scripts never share a key for the same glyph", () => {
  // Some glyphs really are shared across scripts. Collapsing those would serve
  // one script's pronunciation for another's letter, which is worse than
  // storing two clips.
  assert.notEqual(
    keyFor("ॐ", "script:devanagari"),
    keyFor("ॐ", "script:gujarati"),
  );
});

test("a new voice is a new clip, which is the half that stays in the key", () => {
  const nova = phraseTtsCacheKey("क", "p", "m", "nova", "script:devanagari");
  const other = phraseTtsCacheKey("क", "p", "m", "shimmer", "script:devanagari");
  assert.notEqual(nova, other);
});

test("the script namespace cannot collide with a language display name", () => {
  // "script:" is a prefix no language in the catalogue carries, so a phrase and
  // a letter can never land on each other however the two sets grow.
  assert.notEqual(keyFor("क", "script:devanagari"), keyFor("क", "devanagari"));
});

test("phrases are untouched: no script, no change", () => {
  // Every caller that existed before the letter stop sends no `script`, so its
  // key is byte-for-byte what it was. A cache full of warm phrase audio must
  // not be invalidated by this.
  assert.equal(keyFor("નમસ્તે", "Gujarati"), keyFor("નમસ્તે", "Gujarati"));
  assert.notEqual(keyFor("નમસ્તે", "Gujarati"), keyFor("નમસ્તે", "script:gujarati"));
});
