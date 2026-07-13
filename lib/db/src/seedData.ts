// ---------------------------------------------------------------------------
// Shared, committed seed metadata: the 22 official (Eighth Schedule) Indian
// languages, the language-agnostic topics, and the hand-curated Gujarati
// lessons. This module is the single source of truth consumed both by the
// seeder (lib/db/src/seed.ts) and by the offline lesson pre-generation runner
// (artifacts/api-server/scripts/generateCuratedLessons.ts), so the two never
// drift out of sync.
// ---------------------------------------------------------------------------

// fontFamily = the Google "Noto" family that covers this language's script.
export type SeedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  fontFamily: string;
  rtl?: boolean;
};

export const LANGUAGES: SeedLanguage[] = [
  { code: "as", name: "Assamese", nativeName: "অসমীয়া", script: "Bengali-Assamese", fontFamily: "Noto Sans Bengali" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", script: "Bengali", fontFamily: "Noto Sans Bengali" },
  { code: "brx", name: "Bodo", nativeName: "बड़ो", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "doi", name: "Dogri", nativeName: "डोगरी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", script: "Gujarati", fontFamily: "Noto Sans Gujarati" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", script: "Kannada", fontFamily: "Noto Sans Kannada" },
  { code: "ks", name: "Kashmiri", nativeName: "کٲشُر", script: "Perso-Arabic", fontFamily: "Noto Nastaliq Urdu", rtl: true },
  { code: "kok", name: "Konkani", nativeName: "कोंकणी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "mai", name: "Maithili", nativeName: "मैथिली", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", script: "Malayalam", fontFamily: "Noto Sans Malayalam" },
  { code: "mni", name: "Manipuri", nativeName: "ꯃꯤꯇꯩ ꯂꯣꯟ", script: "Meetei Mayek", fontFamily: "Noto Sans Meetei Mayek" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", script: "Odia", fontFamily: "Noto Sans Oriya" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", script: "Gurmukhi", fontFamily: "Noto Sans Gurmukhi" },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृतम्", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "sat", name: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", script: "Ol Chiki", fontFamily: "Noto Sans Ol Chiki" },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", script: "Perso-Arabic", fontFamily: "Noto Naskh Arabic", rtl: true },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", script: "Tamil", fontFamily: "Noto Sans Tamil" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", script: "Telugu", fontFamily: "Noto Sans Telugu" },
  { code: "ur", name: "Urdu", nativeName: "اردو", script: "Perso-Arabic", fontFamily: "Noto Nastaliq Urdu", rtl: true },
];

// The default language whose lessons are hand-curated below rather than
// AI-generated. The pre-generation runner skips this code.
export const CURATED_LANGUAGE_CODE = "gu";

// ---------------------------------------------------------------------------
// Language-agnostic topics. `iconName` maps to a lucide icon in the UI.
// ---------------------------------------------------------------------------
export type SeedCategory = {
  slug: string;
  title: string;
  description: string;
  iconName: string;
  accent: string;
};

export const CATEGORIES: SeedCategory[] = [
  { slug: "greetings", title: "Greetings & Manners", description: "The friendly words you use every day.", iconName: "HandHeart", accent: "#F5871F" },
  { slug: "family", title: "Family", description: "Name everyone you love at home.", iconName: "Users", accent: "#E84E8A" },
  { slug: "numbers", title: "Numbers 1-10", description: "Count all the way to ten.", iconName: "Hash", accent: "#1FA6A0" },
  { slug: "food", title: "Food & Eating", description: "Words for the dinner table.", iconName: "Utensils", accent: "#7A5AF8" },
  { slug: "everyday", title: "Everyday Words", description: "Handy things you say all the time.", iconName: "Sun", accent: "#F5871F" },
  { slug: "feelings", title: "Feelings", description: "Say how you feel inside.", iconName: "Smile", accent: "#1FA6A0" },
];

export const PHRASES_PER_LESSON = 8;

// Most topics teach exactly PHRASES_PER_LESSON phrases, but a few teach a fixed
// sequence of a different length. "Numbers 1-10" must teach all ten numbers in
// order (matching the hand-curated Gujarati lesson) — a learner picking that
// topic should never get a gap-free count that stops at eight. Keyed by
// category slug; any slug not listed here uses PHRASES_PER_LESSON.
export const CATEGORY_PHRASE_COUNTS: Record<string, number> = {
  numbers: 10,
};

// The exact phrase count a curated lesson for `categorySlug` must have.
export function expectedPhraseCount(categorySlug: string): number {
  return CATEGORY_PHRASE_COUNTS[categorySlug] ?? PHRASES_PER_LESSON;
}

// ---------------------------------------------------------------------------
// Curated Gujarati content, pre-seeded as cached lessons so the default
// language has instant, high-quality phrases. Every other language is
// pre-generated offline and frozen into ./data/curatedLessons.json.
// ---------------------------------------------------------------------------
export type SeedPhrase = {
  nativeScript: string;
  romanized: string;
  english: string;
  difficulty: number;
};

export type SeedLesson = { titleNative: string; phrases: SeedPhrase[] };

export const GUJARATI_LESSONS: Record<string, SeedLesson> = {
  greetings: {
    titleNative: "અભિવાદન",
    phrases: [
      { nativeScript: "કેમ છો?", romanized: "kem chho?", english: "How are you?", difficulty: 1 },
      { nativeScript: "નમસ્તે", romanized: "namaste", english: "Hello", difficulty: 1 },
      { nativeScript: "મજામાં", romanized: "majaa-maan", english: "I'm doing well", difficulty: 1 },
      { nativeScript: "આભાર", romanized: "aabhaar", english: "Thank you", difficulty: 1 },
      { nativeScript: "હા", romanized: "ha", english: "Yes", difficulty: 1 },
      { nativeScript: "ના", romanized: "na", english: "No", difficulty: 1 },
      { nativeScript: "માફ કરજો", romanized: "maaf karjo", english: "Sorry / Excuse me", difficulty: 2 },
      { nativeScript: "આવજો", romanized: "aavjo", english: "Goodbye", difficulty: 1 },
    ],
  },
  family: {
    titleNative: "કુટુંબ",
    phrases: [
      { nativeScript: "મમ્મી", romanized: "mummy", english: "Mom", difficulty: 1 },
      { nativeScript: "પપ્પા", romanized: "pappa", english: "Dad", difficulty: 1 },
      { nativeScript: "ભાઈ", romanized: "bhai", english: "Brother", difficulty: 1 },
      { nativeScript: "બહેન", romanized: "bahen", english: "Sister", difficulty: 1 },
      { nativeScript: "દાદા", romanized: "dada", english: "Grandpa (dad's side)", difficulty: 2 },
      { nativeScript: "દાદી", romanized: "dadi", english: "Grandma (dad's side)", difficulty: 2 },
      { nativeScript: "નાના", romanized: "nana", english: "Grandpa (mom's side)", difficulty: 2 },
      { nativeScript: "નાની", romanized: "nani", english: "Grandma (mom's side)", difficulty: 2 },
    ],
  },
  numbers: {
    titleNative: "સંખ્યા",
    phrases: [
      { nativeScript: "એક", romanized: "ek", english: "One", difficulty: 1 },
      { nativeScript: "બે", romanized: "be", english: "Two", difficulty: 1 },
      { nativeScript: "ત્રણ", romanized: "tran", english: "Three", difficulty: 1 },
      { nativeScript: "ચાર", romanized: "chaar", english: "Four", difficulty: 1 },
      { nativeScript: "પાંચ", romanized: "paanch", english: "Five", difficulty: 1 },
      { nativeScript: "છ", romanized: "chha", english: "Six", difficulty: 1 },
      { nativeScript: "સાત", romanized: "saat", english: "Seven", difficulty: 1 },
      { nativeScript: "આઠ", romanized: "aath", english: "Eight", difficulty: 1 },
      { nativeScript: "નવ", romanized: "nav", english: "Nine", difficulty: 1 },
      { nativeScript: "દસ", romanized: "das", english: "Ten", difficulty: 1 },
    ],
  },
  food: {
    titleNative: "ખોરાક",
    phrases: [
      { nativeScript: "પાણી", romanized: "paani", english: "Water", difficulty: 1 },
      { nativeScript: "દૂધ", romanized: "doodh", english: "Milk", difficulty: 1 },
      { nativeScript: "રોટલી", romanized: "rotli", english: "Flatbread (roti)", difficulty: 2 },
      { nativeScript: "ભાત", romanized: "bhaat", english: "Rice", difficulty: 1 },
      { nativeScript: "દાળ", romanized: "daal", english: "Lentils (dal)", difficulty: 1 },
      { nativeScript: "શાક", romanized: "shaak", english: "Vegetable dish", difficulty: 2 },
      { nativeScript: "ખાવાનું", romanized: "khaavaanu", english: "Food", difficulty: 2 },
      { nativeScript: "મને ભૂખ લાગી છે", romanized: "mane bhookh laagi chhe", english: "I am hungry", difficulty: 3 },
    ],
  },
  everyday: {
    titleNative: "રોજિંદા શબ્દો",
    phrases: [
      { nativeScript: "ઘર", romanized: "ghar", english: "Home", difficulty: 1 },
      { nativeScript: "ચાલો", romanized: "chaalo", english: "Let's go", difficulty: 1 },
      { nativeScript: "બેસો", romanized: "beso", english: "Sit down", difficulty: 1 },
      { nativeScript: "જુઓ", romanized: "juo", english: "Look", difficulty: 1 },
      { nativeScript: "સાંભળો", romanized: "saambhlo", english: "Listen", difficulty: 2 },
      { nativeScript: "અહીં આવો", romanized: "ahin aavo", english: "Come here", difficulty: 2 },
      { nativeScript: "સરસ", romanized: "saras", english: "Nice / Great", difficulty: 1 },
      { nativeScript: "પાણી પીવું છે", romanized: "paani peevu chhe", english: "I want to drink water", difficulty: 3 },
    ],
  },
  feelings: {
    titleNative: "લાગણી",
    phrases: [
      { nativeScript: "ખુશ", romanized: "khush", english: "Happy", difficulty: 1 },
      { nativeScript: "ઉદાસ", romanized: "udaas", english: "Sad", difficulty: 1 },
      { nativeScript: "મને ગમે છે", romanized: "mane game chhe", english: "I like it", difficulty: 2 },
      { nativeScript: "મને પ્રેમ છે", romanized: "mane prem chhe", english: "I love you", difficulty: 2 },
      { nativeScript: "થાકી ગયો", romanized: "thaaki gayo", english: "I'm tired", difficulty: 2 },
      { nativeScript: "ડર લાગે છે", romanized: "dar laage chhe", english: "I'm scared", difficulty: 3 },
      { nativeScript: "મજા આવી", romanized: "majaa aavi", english: "That was fun", difficulty: 2 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Frozen, pre-generated lessons for every non-curated language, keyed by
// language code then category slug. Produced by the offline runner and
// committed to ./data/curatedLessons.json so a fresh database seeds populated
// lessons for all 22 languages with no runtime AI call.
// ---------------------------------------------------------------------------
export type CuratedLessonsFile = Record<string, Record<string, SeedLesson>>;

// Validates a single seed lesson: title present, every phrase with the required
// non-empty string fields and an integer difficulty within [1, 3], and never
// zero phrases. Returns an error string, or null when the lesson is valid.
//
// `exactCount` enforces an exact phrase count — pass the category's
// expectedPhraseCount for the pre-generated lessons, which must each be the
// length their topic teaches. Leave it undefined for the hand-curated Gujarati
// lessons, whose counts vary by topic (Numbers 1-10 has ten, Feelings has
// seven); those only require at least one phrase.
export function validateSeedLesson(
  lesson: SeedLesson | undefined,
  exactCount?: number,
): string | null {
  if (!lesson) return "missing lesson";
  if (typeof lesson.titleNative !== "string" || lesson.titleNative.trim() === "") {
    return "missing titleNative";
  }
  if (!Array.isArray(lesson.phrases) || lesson.phrases.length === 0) {
    return "lesson has zero phrases";
  }
  if (exactCount != null && lesson.phrases.length !== exactCount) {
    return `expected ${exactCount} phrases, got ${lesson.phrases.length}`;
  }
  for (let i = 0; i < lesson.phrases.length; i++) {
    const p = lesson.phrases[i];
    if (!p || typeof p.nativeScript !== "string" || p.nativeScript.trim() === "") {
      return `phrase ${i}: missing nativeScript`;
    }
    if (typeof p.romanized !== "string" || p.romanized.trim() === "") {
      return `phrase ${i}: missing romanized`;
    }
    if (typeof p.english !== "string" || p.english.trim() === "") {
      return `phrase ${i}: missing english`;
    }
    if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 3) {
      return `phrase ${i}: difficulty ${p.difficulty} out of range 1-3`;
    }
  }
  return null;
}

// The outcome of validating a whole frozen curated-lessons file against the
// expected (non-Gujarati language × category) matrix.
export type CuratedLessonsValidation = {
  // A present lesson that failed validation. Each entry is
  // "<lang>/<category>: <reason>". A non-empty list means the seeder must
  // refuse to run rather than ship a broken or empty lesson.
  errors: string[];
  // A (language, category) combination with no frozen lesson at all. Tolerated:
  // the seeder skips it and it generates on first open.
  missing: string[];
};

// Validates the frozen, pre-generated lessons for every non-curated language.
// This is the single gate the seeder uses (see seed.ts) so the two never drift:
// every present lesson must pass validateSeedLesson with an exact phrase count,
// and every (language, category) combination is accounted for. Returns the
// fatal `errors` (malformed/empty lessons the seeder must reject) and the
// tolerated `missing` combinations.
export function validateCuratedLessons(
  curated: CuratedLessonsFile,
): CuratedLessonsValidation {
  const errors: string[] = [];
  const missing: string[] = [];
  for (const lang of LANGUAGES) {
    if (lang.code === CURATED_LANGUAGE_CODE) continue;
    const byCategory = curated[lang.code];
    for (const cat of CATEGORIES) {
      const lesson = byCategory?.[cat.slug];
      if (!lesson) {
        missing.push(`${lang.code}/${cat.slug}`);
        continue;
      }
      const invalid = validateSeedLesson(lesson, expectedPhraseCount(cat.slug));
      if (invalid) errors.push(`${lang.code}/${cat.slug}: ${invalid}`);
    }
  }
  return { errors, missing };
}
