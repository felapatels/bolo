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

test("every frozen lesson passes validation with an exact phrase count", () => {
  for (const code of generatedLanguageCodes) {
    const byCategory = curated[code] ?? {};
    for (const cat of CATEGORIES) {
      const lesson = byCategory[cat.slug];
      const invalid = validateSeedLesson(lesson, PHRASES_PER_LESSON);
      assert.equal(
        invalid,
        null,
        `${code}/${cat.slug} failed validation: ${invalid}`,
      );
      // Belt-and-suspenders on the specifics the validator enforces.
      assert.equal(lesson.phrases.length, PHRASES_PER_LESSON);
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
