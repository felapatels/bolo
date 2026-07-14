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
  checkLessonQuality,
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

// The generator runs this exact same checkLessonQuality rule set before it
// writes curatedLessons.json, so a bad batch is rejected at generation time —
// not just here, after the fact. Sharing the helper keeps the two from drifting.
test("no lesson repeats the same phrase or types a loanword in native script", () => {
  const failures: string[] = [];

  for (const [label, lesson] of allSeedLessons) {
    const issues = checkLessonQuality(lesson, {
      duplicateEnglish: DUPLICATE_ENGLISH_ALLOWLIST[label],
      duplicateNative: DUPLICATE_NATIVE_ALLOWLIST[label],
      latinInNative: LATIN_IN_NATIVE_ALLOWLIST[label],
    });
    for (const issue of issues) failures.push(`${label}: ${issue}`);
  }

  assert.deepEqual(
    failures,
    [],
    `Found content-quality problems in a lesson:\n${failures.join("\n")}`,
  );
});

// ---------------------------------------------------------------------------
// Transliterated English-loanword guard.
//
// The Latin-in-native check above only catches an English word that still has
// Latin letters/digits in it. The far more common defect is an English word
// *transliterated* into the correct native script — "नर्वस"/nervas for
// "nervous", "बोर"/bor for "bored" — which is written entirely in the right
// script and sails past that check, yet teaches a learner the English word
// dressed up in native letters instead of the language's own term.
//
// We catch these with a curated blocklist of glosses that a language app must
// teach with a *native* word (abstract feelings, everyday concepts — never a
// borrowed English label), confirmed by a phonetic match between the phrase's
// romanization and that gloss. The blocklist keeps the check precise: genuine,
// naturalized loanwords a learner really says (plate, glass, fork, menu) and
// native dish names English itself borrowed (idli, chapati, sambar) are simply
// not on it, so they never trip the guard and need no allowlisting.
//
// The phonetic confirmation is deliberately lenient because the gloss is
// already high-signal: a phrase only trips the guard when its romanization
// actually *sounds like* the blocklisted English word (so a correct native
// translation of the same gloss is left alone).
// ---------------------------------------------------------------------------

// English glosses that must be taught with the language's own word, never an
// English word spelled phonetically in native script. Kept intentionally small
// and focused on concepts every Indian language has a native term for; add a
// gloss here only when transliterating it is clearly a defect (a learner should
// never be taught the English word for a basic feeling or relation).
const LOANWORD_GLOSS_BLOCKLIST = new Set(
  [
    // feelings — every Indian language has native words for basic emotions
    "nervous",
    "bored",
    "happy",
    "sad",
    "angry",
    "tired",
    "excited",
    "worried",
    "scared",
    "lonely",
    "proud",
    "confused",
    "surprised",
    "hungry",
    "thirsty",
    "sleepy",
    "calm",
    "upset",
    "shy",
    "jealous",
    "disappointed",
    "relieved",
    // greetings & manners — "hello"/"bye"/"sorry" typed in native script are
    // the most common lazy borrowings a regeneration reintroduces
    "goodbye",
    "hello",
    "hi",
    "bye",
    "sorry",
    "please",
    "welcome",
    "thanks",
    "thank",
    "excuse",
    "morning",
    "night",
    "evening",
    // family — kinship terms are core native vocabulary everywhere
    "aunt",
    "uncle",
    "mother",
    "father",
    "brother",
    "sister",
    "cousin",
    "grandmother",
    "grandfather",
    "nephew",
    "niece",
    "husband",
    "wife",
    "son",
    "daughter",
    "family",
    "baby",
    // everyday verbs — basic actions must never be taught as English words
    "come",
    "go",
    "stop",
    "wait",
    "look",
    "listen",
    "sit",
    "stand",
    "eat",
    "drink",
    "sleep",
    "walk",
    "run",
    "help",
    "give",
    "take",
  ].map((g) => g.toLowerCase()),
);

// Human-reviewed exceptions: lesson label ("<lang>/<category>") → native-script
// strings a reviewer has confirmed are acceptable there despite matching a
// blocklisted gloss (e.g. a language that genuinely uses the borrowed word).
// Keep empty unless a real linguistic reason forces it, and leave a comment.
const LOANWORD_ALLOWLIST: Record<string, string[]> = {
  // "बिरागो" (birago) is a genuine native Bodo word for "bored", not English
  // "bored" transliterated — it follows the same native adjectival pattern as
  // its neighbours in this lesson ("उरागो"/urago = sad, "अलागो"/alago = lonely,
  // "लाजो"/lajo = shy). Its consonant skeleton (brg) only coincidentally
  // resembles "bored" (brd); a real transliteration would be "बोर"/"बोर्ड".
  "brx/feelings": ["बिरागो"],
  // "ਭਰਾ" (bharaa) is the genuine native Punjabi word for "brother" — an
  // Indo-Aryan cognate of Sanskrit "भ्रातृ"/bhrātṛ. Its consonant skeleton
  // (bhr) resembles English "brother" (brthr) only because both descend from
  // the same Proto-Indo-European root, not because it was borrowed.
  "pa/family": ["ਭਰਾ"],
  // "सूनुः" (sūnuḥ) is the classical Sanskrit word for "son" — again a shared
  // Proto-Indo-European inheritance (cf. English "son", German "Sohn"), not an
  // English loanword.
  "sa/family": ["सूनुः"],
};

// Levenshtein distance — the edit distance used for the phonetic ratio below.
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

// Keep only ASCII letters, lowercased — the comparable phonetic core.
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// Drop vowels too: a consonant skeleton, which stays stable across the vowel
// drift transliteration introduces ("nervous" → "narvas" both reduce to "nrvs").
const consonants = (s: string) => letters(s).replace(/[aeiou]/g, "");
const similarity = (a: string, b: string) =>
  a === "" && b === "" ? 1 : 1 - editDistance(a, b) / Math.max(a.length, b.length);

// True when `romanized` sounds like the English `gloss` — i.e. the native-script
// phrase is really that English word transliterated, not a native translation.
function romanizationSoundsLike(romanized: string, gloss: string): boolean {
  const r = letters(romanized);
  const g = letters(gloss);
  if (r === "" || g === "") return false;
  // Either the full forms are close, or their consonant skeletons match well —
  // the latter survives the vowel changes transliteration adds.
  return similarity(r, g) >= 0.55 || similarity(consonants(romanized), consonants(gloss)) >= 0.6;
}

test("no native script value is a transliterated English loanword (e.g. नर्वस for 'nervous')", () => {
  const failures: string[] = [];

  for (const [label, lesson] of allSeedLessons) {
    const allow = new Set((LOANWORD_ALLOWLIST[label] ?? []).map((s) => s.trim()));
    lesson.phrases.forEach((p, i) => {
      const native = p.nativeScript.trim();
      if (allow.has(native)) return;
      // Tokenise the english gloss so a blocklisted word is caught even inside a
      // longer phrase ("I feel nervous" → token "nervous").
      const tokens = p.english.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      for (const token of tokens) {
        if (
          LOANWORD_GLOSS_BLOCKLIST.has(token) &&
          romanizationSoundsLike(p.romanized, token)
        ) {
          failures.push(
            `${label}: phrase ${i} nativeScript "${native}" (romanized "${p.romanized}") is the English loanword "${token}" transliterated — use the native word`,
          );
          break;
        }
      }
    });
  }

  assert.deepEqual(
    failures,
    [],
    `Found transliterated English loanwords in native script values:\n${failures.join("\n")}`,
  );
});
