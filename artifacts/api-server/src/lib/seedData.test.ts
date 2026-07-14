import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  LANGUAGES,
  CATEGORIES,
  CURATED_LANGUAGE_CODE,
  PHRASES_PER_LESSON,
  GUJARATI_LESSONS,
  starterPhraseCount,
  extendedPhraseCount,
  premiumPhraseCount,
  validateSeedLesson,
  validateCuratedLessons,
  type CuratedLessonsFile,
  type SeedLesson,
} from "@workspace/db/seed-data";

// Guards the frozen seed content the seeder ships to every learner. A future
// edit to curatedLessons.json — or to the validator — could silently
// reintroduce an empty or malformed lesson, and nobody would notice until a
// learner opened a blank lesson. These tests fail first instead.
//
// The frozen file lives next to the seedData module (lib/db/src/data/), exactly
// where the seeder reads it from, so we resolve it the same way rather than
// hard-coding a cross-package path.
const require = createRequire(import.meta.url);
const seedDataPath = require.resolve("@workspace/db/seed-data");
const curatedPath = path.join(
  path.dirname(seedDataPath),
  "data",
  "curatedLessons.json",
);
const curated = JSON.parse(
  readFileSync(curatedPath, "utf8"),
) as CuratedLessonsFile;

// The non-Gujarati languages the frozen file is expected to cover.
const generatedLanguageCodes = LANGUAGES.map((l) => l.code).filter(
  (c) => c !== CURATED_LANGUAGE_CODE,
);

test("frozen data covers every non-Gujarati language × every category", () => {
  // 21 languages (22 official minus the hand-curated Gujarati).
  assert.equal(generatedLanguageCodes.length, 21);

  for (const code of generatedLanguageCodes) {
    const byCategory = curated[code];
    assert.ok(byCategory, `frozen file is missing language "${code}"`);
    for (const cat of CATEGORIES) {
      assert.ok(
        byCategory[cat.slug],
        `frozen file is missing ${code}/${cat.slug}`,
      );
    }
  }

  // No stray/unknown language codes leaked into the file.
  for (const code of Object.keys(curated)) {
    assert.ok(
      generatedLanguageCodes.includes(code),
      `frozen file has unexpected language "${code}"`,
    );
  }

  // The shared seeder gate agrees: nothing malformed and nothing missing.
  const { errors, missing } = validateCuratedLessons(curated);
  assert.deepEqual(
    errors,
    [],
    `frozen lessons failed validation:\n${errors.join("\n")}`,
  );
  assert.deepEqual(
    missing,
    [],
    `frozen file is missing combinations:\n${missing.join("\n")}`,
  );
});

test("every frozen lesson holds the full starter + premium library", () => {
  for (const code of generatedLanguageCodes) {
    const byCategory = curated[code] ?? {};
    for (const cat of CATEGORIES) {
      const lesson = byCategory[cat.slug];
      // The frozen file must carry the *extended* library (starter + premium),
      // so a Bolo! Plus subscriber opens a deep, ready lesson with no AI wait.
      const count = extendedPhraseCount(cat.slug);
      const invalid = validateSeedLesson(lesson, count);
      assert.equal(
        invalid,
        null,
        `${code}/${cat.slug} failed validation: ${invalid}`,
      );
      // Belt-and-suspenders on the specifics the validator enforces.
      assert.equal(lesson.phrases.length, count);
      // The free starter set must fit inside the lesson so the seeder can carve
      // starter (free) from premium (Plus-only) by index.
      assert.ok(starterPhraseCount(cat.slug) <= lesson.phrases.length);
      assert.equal(
        premiumPhraseCount(cat.slug),
        count - starterPhraseCount(cat.slug),
      );
      assert.ok(lesson.titleNative.trim() !== "");
      for (const p of lesson.phrases) {
        assert.ok(p.nativeScript.trim() !== "");
        assert.ok(p.romanized.trim() !== "");
        assert.ok(p.english.trim() !== "");
        assert.ok(Number.isInteger(p.difficulty));
        assert.ok(p.difficulty >= 1 && p.difficulty <= 3);
      }
    }
  }
});

test("the Numbers topic teaches a gap-free one-through-ten in every language", () => {
  const expectedSequence = [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  // The topic is titled "Numbers 1-10" and must actually teach all ten in
  // order — no lesson may stop short at eight or skip a number mid-sequence.
  assert.equal(extendedPhraseCount("numbers"), expectedSequence.length);

  for (const code of generatedLanguageCodes) {
    const lesson = curated[code]?.numbers;
    assert.ok(lesson, `frozen file is missing ${code}/numbers`);
    const english = lesson.phrases.map((p) => p.english.trim().toLowerCase());
    assert.deepEqual(
      english,
      expectedSequence,
      `${code}/numbers should teach one..ten in order, got: ${english.join(", ")}`,
    );
  }
});

test("a malformed or empty frozen lesson makes the seed refuse to run", () => {
  const good: SeedLesson = {
    titleNative: "ok",
    phrases: Array.from({ length: PHRASES_PER_LESSON }, (_, i) => ({
      nativeScript: `n${i}`,
      romanized: `r${i}`,
      english: `e${i}`,
      difficulty: 1,
    })),
  };

  // validateSeedLesson is the exact gate the seeder runs before inserting a
  // lesson (see seed.ts). Each of these malformations must be rejected — a
  // returned error string, never null — so the seeder throws instead of
  // writing a blank or broken lesson.
  const badLessons: Array<[string, SeedLesson | undefined]> = [
    ["missing lesson", undefined],
    ["empty phrase list", { ...good, phrases: [] }],
    ["blank title", { ...good, titleNative: "   " }],
    [
      "too few phrases",
      { ...good, phrases: good.phrases.slice(0, PHRASES_PER_LESSON - 1) },
    ],
    [
      "too many phrases",
      { ...good, phrases: [...good.phrases, good.phrases[0]] },
    ],
    [
      "blank nativeScript",
      {
        ...good,
        phrases: [{ ...good.phrases[0], nativeScript: "" }, ...good.phrases.slice(1)],
      },
    ],
    [
      "blank english",
      {
        ...good,
        phrases: [{ ...good.phrases[0], english: "  " }, ...good.phrases.slice(1)],
      },
    ],
    [
      "difficulty out of range",
      {
        ...good,
        phrases: [{ ...good.phrases[0], difficulty: 4 }, ...good.phrases.slice(1)],
      },
    ],
    [
      "non-integer difficulty",
      {
        ...good,
        phrases: [{ ...good.phrases[0], difficulty: 1.5 }, ...good.phrases.slice(1)],
      },
    ],
  ];

  for (const [label, lesson] of badLessons) {
    const result = validateSeedLesson(lesson, PHRASES_PER_LESSON);
    assert.notEqual(result, null, `expected "${label}" to be rejected`);
  }

  // The sanity check: the valid control lesson passes, so the assertions above
  // are catching real defects rather than a validator that rejects everything.
  assert.equal(validateSeedLesson(good, PHRASES_PER_LESSON), null);

  // And the whole-file gate surfaces a malformed lesson as a fatal error rather
  // than silently skipping it: inject one bad lesson into a copy of the real
  // file and confirm validateCuratedLessons reports it.
  const victimCode = generatedLanguageCodes[0];
  const victimCat = CATEGORIES[0].slug;
  const tampered: CuratedLessonsFile = {
    ...curated,
    [victimCode]: {
      ...curated[victimCode],
      [victimCat]: { ...good, phrases: [] },
    },
  };
  const { errors } = validateCuratedLessons(tampered);
  assert.ok(
    errors.some((e) => e.startsWith(`${victimCode}/${victimCat}`)),
    `expected a fatal error for the tampered ${victimCode}/${victimCat} lesson`,
  );
});

// The hand-curated Gujarati lessons live in code (GUJARATI_LESSONS), not in the
// frozen JSON, and are the very first lessons every new learner sees — Gujarati
// is the default language. A bad edit there (dropped topic, blank phrase,
// out-of-range difficulty) would ship silently and greet a learner with a blank
// or malformed starter lesson. These tests fail first instead.
test("Gujarati lessons cover every category slug", () => {
  for (const cat of CATEGORIES) {
    assert.ok(
      GUJARATI_LESSONS[cat.slug],
      `GUJARATI_LESSONS is missing category "${cat.slug}"`,
    );
  }

  // And no stray/unknown category slugs leaked into the curated set.
  const knownSlugs = new Set(CATEGORIES.map((c) => c.slug));
  for (const slug of Object.keys(GUJARATI_LESSONS)) {
    assert.ok(
      knownSlugs.has(slug),
      `GUJARATI_LESSONS has unexpected category "${slug}"`,
    );
  }
});

test("every Gujarati lesson holds the full starter + premium library", () => {
  for (const cat of CATEGORIES) {
    const lesson = GUJARATI_LESSONS[cat.slug];
    // Gujarati now ships the same extended library as every other language:
    // the full starter + premium set per topic (Numbers 1-10 stays at ten).
    const count = extendedPhraseCount(cat.slug);
    const invalid = validateSeedLesson(lesson, count);
    assert.equal(
      invalid,
      null,
      `Gujarati ${cat.slug} failed validation: ${invalid}`,
    );
    // Belt-and-suspenders on the specifics the validator enforces.
    assert.equal(lesson.phrases.length, count);
    assert.ok(starterPhraseCount(cat.slug) <= lesson.phrases.length);
    assert.ok(lesson.titleNative.trim() !== "");
    for (const p of lesson.phrases) {
      assert.ok(p.nativeScript.trim() !== "");
      assert.ok(p.romanized.trim() !== "");
      assert.ok(p.english.trim() !== "");
      assert.ok(Number.isInteger(p.difficulty));
      assert.ok(p.difficulty >= 1 && p.difficulty <= 3);
    }
  }
});

// ---------------------------------------------------------------------------
// Content-quality guards. The count/shape checks above happily pass a lesson
// that is technically well-formed but pedagogically broken: the premium tail
// re-listing the same phrase the starter set already taught, or an English
// loanword typed in native script ("नर्वस" for "nervous") where a real native
// term exists. The premium-phrase review kept catching both by hand; these
// tests catch them first so a regeneration via the generate-lessons script
// can't silently reintroduce them.
//
// Both sources are checked with the same rules: the frozen JSON for every
// non-Gujarati language, and GUJARATI_LESSONS (the default language, in code).
// ---------------------------------------------------------------------------

// Every (label, lesson) pair the quality guards scan. The label is
// "<lang>/<category>" so a failure points straight at the offending lesson.
const allSeedLessons: Array<[string, SeedLesson]> = [
  ...generatedLanguageCodes.flatMap((code) =>
    CATEGORIES.map(
      (cat) => [`${code}/${cat.slug}`, curated[code][cat.slug]] as [string, SeedLesson],
    ),
  ),
  ...CATEGORIES.map(
    (cat) =>
      [`${CURATED_LANGUAGE_CODE}/${cat.slug}`, GUJARATI_LESSONS[cat.slug]] as [
        string,
        SeedLesson,
      ],
  ),
];

// Known, human-reviewed exceptions that would otherwise trip a guard. Each key
// is a lesson label ("<lang>/<category>"); the arrays list the exact strings a
// reviewer has confirmed are acceptable there. Keep this empty unless a real
// linguistic reason forces it (e.g. a native script that legitimately embeds a
// digit), and always leave a comment explaining why. An allowlisted string is
// exempt only within its own lesson.
const DUPLICATE_ENGLISH_ALLOWLIST: Record<string, string[]> = {};
const DUPLICATE_NATIVE_ALLOWLIST: Record<string, string[]> = {};
const LATIN_IN_NATIVE_ALLOWLIST: Record<string, string[]> = {};

test("no lesson repeats the same phrase (duplicate english gloss or native script)", () => {
  const failures: string[] = [];

  for (const [label, lesson] of allSeedLessons) {
    const engAllow = new Set(
      (DUPLICATE_ENGLISH_ALLOWLIST[label] ?? []).map((s) => s.trim().toLowerCase()),
    );
    const nativeAllow = new Set(
      (DUPLICATE_NATIVE_ALLOWLIST[label] ?? []).map((s) => s.trim()),
    );

    const seenEnglish = new Map<string, number>();
    const seenNative = new Map<string, number>();

    lesson.phrases.forEach((p, i) => {
      const english = p.english.trim().toLowerCase();
      const native = p.nativeScript.trim();

      if (seenEnglish.has(english) && !engAllow.has(english)) {
        failures.push(
          `${label}: phrases ${seenEnglish.get(english)} and ${i} share the english gloss "${p.english.trim()}"`,
        );
      } else if (!seenEnglish.has(english)) {
        seenEnglish.set(english, i);
      }

      if (seenNative.has(native) && !nativeAllow.has(native)) {
        failures.push(
          `${label}: phrases ${seenNative.get(native)} and ${i} share the native script "${native}"`,
        );
      } else if (!seenNative.has(native)) {
        seenNative.set(native, i);
      }
    });
  }

  assert.deepEqual(
    failures,
    [],
    `Found duplicate phrases within a lesson:\n${failures.join("\n")}`,
  );
});

test("no native script value contains Latin letters or ASCII digits (loanword/typo signal)", () => {
  // A Latin letter or ASCII digit inside a nativeScript value is a strong
  // signal of an English loanword typed in the wrong script or a copy-paste
  // slip — nativeScript should be entirely in the language's own script. This
  // is a heuristic: a hit is surfaced for a human to eyeball, and a genuinely
  // acceptable one can be added to LATIN_IN_NATIVE_ALLOWLIST with a reason.
  const latinOrDigit = /[A-Za-z0-9]/;
  const failures: string[] = [];

  for (const [label, lesson] of allSeedLessons) {
    const allow = new Set((LATIN_IN_NATIVE_ALLOWLIST[label] ?? []).map((s) => s.trim()));
    lesson.phrases.forEach((p, i) => {
      const native = p.nativeScript.trim();
      if (latinOrDigit.test(native) && !allow.has(native)) {
        failures.push(
          `${label}: phrase ${i} nativeScript "${native}" (${p.english.trim()}) contains Latin letters or ASCII digits`,
        );
      }
    });
  }

  assert.deepEqual(
    failures,
    [],
    `Found Latin/ASCII characters in native script values:\n${failures.join("\n")}`,
  );
});
