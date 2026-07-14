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

// The "starter" set every learner — including Free — sees for a topic. This is
// the tier boundary: the first `starterPhraseCount(slug)` phrases of a curated
// lesson are free/starter and everything past them is Plus-only ("premium").
// Holding this at its historical value keeps the Free (Hindi) library unchanged.
export const PHRASES_PER_LESSON = 8;

// Most topics start with exactly PHRASES_PER_LESSON phrases, but a few teach a
// fixed sequence of a different length. "Numbers 1-10" must teach all ten
// numbers in order (matching the hand-curated Gujarati lesson) — a learner
// picking that topic should never get a gap-free count that stops at eight.
// Keyed by category slug; any slug not listed here uses PHRASES_PER_LESSON.
export const CATEGORY_PHRASE_COUNTS: Record<string, number> = {
  numbers: 10,
};

// The starter (free) phrase count for `categorySlug`: the size of the set every
// tier can access. Phrases beyond this index in a curated lesson are premium.
export function starterPhraseCount(categorySlug: string): number {
  return CATEGORY_PHRASE_COUNTS[categorySlug] ?? PHRASES_PER_LESSON;
}

// The full curated library size per topic (starter + premium). Pre-seeding this
// many phrases means a Bolo! Plus subscriber opens a much deeper, ready-to-use
// library with no first-open AI wait; everything past the starter is Plus-only.
export const EXTENDED_PHRASES_PER_LESSON = 24;

// Topics whose full library is a fixed length rather than
// EXTENDED_PHRASES_PER_LESSON. "Numbers 1-10" is an inherently fixed sequence of
// ten, so it has no premium extension — its starter set is the whole topic.
export const CATEGORY_EXTENDED_COUNTS: Record<string, number> = {
  numbers: 10,
};

// The full (starter + premium) phrase count a curated lesson for `categorySlug`
// must have in the frozen data.
export function extendedPhraseCount(categorySlug: string): number {
  return CATEGORY_EXTENDED_COUNTS[categorySlug] ?? EXTENDED_PHRASES_PER_LESSON;
}

// How many premium (Plus-only) phrases a fully-populated `categorySlug` lesson
// carries: everything past the starter boundary. Zero for fixed-length topics.
export function premiumPhraseCount(categorySlug: string): number {
  return Math.max(
    0,
    extendedPhraseCount(categorySlug) - starterPhraseCount(categorySlug),
  );
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
      { nativeScript: "સુપ્રભાત", romanized: "suprabhaat", english: "Good morning", difficulty: 1 },
      { nativeScript: "શુભ રાત્રી", romanized: "shubh raatri", english: "Good night", difficulty: 1 },
      { nativeScript: "કૃપા કરીને", romanized: "krupa kari-ne", english: "Please", difficulty: 2 },
      { nativeScript: "સ્વાગત છે", romanized: "svaagat chhe", english: "You're welcome", difficulty: 2 },
      { nativeScript: "અલવિદા", romanized: "alvida", english: "Farewell", difficulty: 2 },
      { nativeScript: "શુભ સાંજ", romanized: "shubh saanj", english: "Good evening", difficulty: 1 },
      { nativeScript: "મળી ને આનંદ થયો", romanized: "mali ne aanand thayo", english: "Nice to meet you", difficulty: 2 },
      { nativeScript: "સવાર", romanized: "savaar", english: "morning", difficulty: 1 },
      { nativeScript: "સાંજ", romanized: "saanj", english: "evening", difficulty: 1 },
      { nativeScript: "રાત", romanized: "raat", english: "night", difficulty: 1 },
      { nativeScript: "જય શ્રી કૃષ્ણ", romanized: "jay shri krushna", english: "Hello / greetings", difficulty: 1 },
      { nativeScript: "શુભેચ્છા", romanized: "shubhechchha", english: "Best wishes", difficulty: 2 },
      { nativeScript: "કોઈ વાત નહીં", romanized: "koi vaat nahi", english: "It's okay / No problem", difficulty: 1 },
      { nativeScript: "શુભ દિન", romanized: "shubh din", english: "Good day", difficulty: 1 },
      { nativeScript: "કૃપા કરીને બેસો", romanized: "krupa kari-ne beso", english: "Please sit down", difficulty: 2 },
      { nativeScript: "આવતા રહો", romanized: "aavta raho", english: "Come again / Keep coming", difficulty: 2 },
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
      { nativeScript: "કાકા", romanized: "kaka", english: "Uncle", difficulty: 1 },
      { nativeScript: "કાકી", romanized: "kaki", english: "Aunt", difficulty: 1 },
      { nativeScript: "મામા", romanized: "mama", english: "Maternal uncle", difficulty: 1 },
      { nativeScript: "મામી", romanized: "mami", english: "Maternal aunt", difficulty: 1 },
      { nativeScript: "પરિવાર", romanized: "parivar", english: "Family", difficulty: 1 },
      { nativeScript: "દીકરો", romanized: "dikaro", english: "son", difficulty: 1 },
      { nativeScript: "દીકરી", romanized: "dikari", english: "daughter", difficulty: 1 },
      { nativeScript: "પતિ", romanized: "pati", english: "husband", difficulty: 2 },
      { nativeScript: "પત્ની", romanized: "patni", english: "wife", difficulty: 2 },
      { nativeScript: "પૌત્ર", romanized: "pautra", english: "grandson", difficulty: 3 },
      { nativeScript: "ફોઇ", romanized: "foi", english: "paternal aunt", difficulty: 2 },
      { nativeScript: "ફુવા", romanized: "fuva", english: "paternal aunt's husband", difficulty: 2 },
      { nativeScript: "ભાભી", romanized: "bhabhi", english: "brother's wife", difficulty: 2 },
      { nativeScript: "જમાઈ", romanized: "jamai", english: "son-in-law", difficulty: 2 },
      { nativeScript: "પૌત્રી", romanized: "pautri", english: "granddaughter", difficulty: 1 },
      { nativeScript: "પૌત્રવધૂ", romanized: "pautra-vadhu", english: "grandson's wife", difficulty: 3 },
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
      { nativeScript: "પ્લેટ", romanized: "plate", english: "Plate", difficulty: 1 },
      { nativeScript: "વાટકી", romanized: "vaatki", english: "Small bowl", difficulty: 1 },
      { nativeScript: "ચમચી", romanized: "chamchi", english: "Spoon", difficulty: 1 },
      { nativeScript: "કાંટો", romanized: "kaanto", english: "Fork", difficulty: 1 },
      { nativeScript: "છરી", romanized: "chhari", english: "Knife", difficulty: 1 },
      { nativeScript: "થાળી", romanized: "thaali", english: "Dinner plate", difficulty: 1 },
      { nativeScript: "ગ્લાસ", romanized: "glaas", english: "Glass", difficulty: 1 },
      { nativeScript: "મીઠું", romanized: "mithu", english: "Salt", difficulty: 1 },
      { nativeScript: "મરચું", romanized: "marchu", english: "Chili pepper", difficulty: 2 },
      { nativeScript: "ભોજન", romanized: "bhojan", english: "Meal", difficulty: 2 },
      { nativeScript: "ચોખા", romanized: "chokha", english: "Uncooked rice", difficulty: 1 },
      { nativeScript: "દહીં", romanized: "dahi", english: "Yogurt", difficulty: 1 },
      { nativeScript: "ચટણી", romanized: "chatni", english: "Chutney", difficulty: 1 },
      { nativeScript: "પરોઠું", romanized: "parothu", english: "Stuffed flatbread", difficulty: 2 },
      { nativeScript: "લોટી", romanized: "loti", english: "Jug", difficulty: 1 },
      { nativeScript: "મીઠાઈ", romanized: "mithai", english: "Sweet (dessert)", difficulty: 1 },
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
      { nativeScript: "હા", romanized: "ha", english: "Yes", difficulty: 1 },
      { nativeScript: "ના", romanized: "na", english: "No", difficulty: 1 },
      { nativeScript: "કૃપા કરીને", romanized: "krupa karee-ne", english: "Please", difficulty: 2 },
      { nativeScript: "આભાર", romanized: "aabhar", english: "Thank you", difficulty: 1 },
      { nativeScript: "માફ કરશો", romanized: "maaf karsho", english: "Sorry / Excuse me", difficulty: 2 },
      { nativeScript: "કેવું છે?", romanized: "kevu chhe?", english: "How is it?", difficulty: 1 },
      { nativeScript: "મને જોઈએ", romanized: "mane joie", english: "I want / I need", difficulty: 1 },
      { nativeScript: "રોકો", romanized: "roko", english: "Stop", difficulty: 1 },
      { nativeScript: "ચાલે", romanized: "chaale", english: "Okay / It works", difficulty: 1 },
      { nativeScript: "પછી", romanized: "pachi", english: "Later / Then", difficulty: 1 },
      { nativeScript: "કેમ છો?", romanized: "kem cho?", english: "How are you?", difficulty: 1 },
      { nativeScript: "મારે છે", romanized: "maare chhe", english: "I have", difficulty: 2 },
      { nativeScript: "અહીં", romanized: "ahin", english: "Here", difficulty: 1 },
      { nativeScript: "ત્યાં", romanized: "tyaan", english: "There", difficulty: 1 },
      { nativeScript: "શુભ સવાર", romanized: "shubh savaar", english: "Good morning", difficulty: 2 },
      { nativeScript: "શુભ રાત્રી", romanized: "shubh raatri", english: "Good night", difficulty: 1 },
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
      { nativeScript: "ગુસ્સો આવ્યો", romanized: "gusso aavyo", english: "I got angry", difficulty: 1 },
      { nativeScript: "ચિંતા થાય છે", romanized: "chinta thaay chhe", english: "I feel worried", difficulty: 2 },
      { nativeScript: "આશ્ચર્ય થયું", romanized: "aashcharya thayu", english: "I was surprised", difficulty: 2 },
      { nativeScript: "એકલું લાગે છે", romanized: "eklu laage chhe", english: "I feel lonely", difficulty: 2 },
      { nativeScript: "ઉત્સાહિત છું", romanized: "utsahit chhu", english: "I am excited", difficulty: 2 },
      { nativeScript: "સુખી", romanized: "sukhi", english: "content; happy inside", difficulty: 1 },
      { nativeScript: "શાંત", romanized: "shaant", english: "calm", difficulty: 1 },
      { nativeScript: "ગર્વ છે", romanized: "garv chhe", english: "I am proud", difficulty: 2 },
      { nativeScript: "ભૂખ લાગી છે", romanized: "bhukh laagi chhe", english: "I am hungry", difficulty: 1 },
      { nativeScript: "અસ્વસ્થ છું", romanized: "asvasth chhu", english: "I feel unwell", difficulty: 2 },
      { nativeScript: "ગૂંચવણમાં છું", romanized: "goonchavanma chhu", english: "I am confused", difficulty: 2 },
      { nativeScript: "કંટાળો આવે છે", romanized: "kantalo aave chhe", english: "I feel bored", difficulty: 2 },
      { nativeScript: "ગભરાટ થાય છે", romanized: "gabharaat thaay chhe", english: "I feel nervous", difficulty: 2 },
      { nativeScript: "આરામદાયક લાગે છે", romanized: "aaramdhaayak laage chhe", english: "It feels comfortable", difficulty: 3 },
      { nativeScript: "પ્રફુલ્લિત છું", romanized: "prafullit chhu", english: "I feel cheerful", difficulty: 3 },
      { nativeScript: "નિરાશ", romanized: "niraash", english: "disappointed", difficulty: 2 },
      { nativeScript: "રાહત થઈ", romanized: "raahat thai", english: "I feel relieved", difficulty: 2 },
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
// extendedPhraseCount for the pre-generated lessons, which must each hold the
// full starter+premium library their topic teaches. Leave it undefined to only
// require at least one phrase.
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

// ---------------------------------------------------------------------------
// Content-quality checks that go beyond validateSeedLesson's shape validation.
// A lesson can be perfectly well-formed (right count, non-empty fields, valid
// difficulty) yet pedagogically broken: two phrases teaching the same word, or
// an English loanword typed in native script ("नर्वस" for "nervous"). These
// helpers are the single source of truth for those rules, shared by the offline
// generator (so a bad batch is never written to curatedLessons.json) and by the
// seed test (so the two can't drift).
// ---------------------------------------------------------------------------

// True when a native-script value contains Latin letters or ASCII digits — a
// strong signal of an English loanword typed in the wrong script or a
// copy-paste slip. nativeScript should be entirely in the language's own script.
export function nativeScriptHasLatinOrDigit(nativeScript: string): boolean {
  return /[A-Za-z0-9]/.test(nativeScript.trim());
}

// Human-reviewed exceptions that would otherwise trip a quality check. Populate
// only for a genuine linguistic reason (e.g. a native script that legitimately
// embeds a digit) and always with a comment. Each list is scoped to one lesson.
export type LessonQualityAllowlist = {
  // English glosses allowed to repeat within the lesson (case-insensitive).
  duplicateEnglish?: string[];
  // Native-script values allowed to repeat within the lesson.
  duplicateNative?: string[];
  // Native-script values allowed to contain Latin letters / ASCII digits.
  latinInNative?: string[];
};

// Human-reviewed quality exceptions for the seeded content, keyed by lesson
// label ("<lang>/<category>", with CURATED_LANGUAGE_CODE for the hand-curated
// lessons). This is the single allowlist the seeder gate and the seed test both
// consult, so an exception approved once holds everywhere. Keep it empty unless
// a genuine linguistic reason forces an entry, and always leave a comment.
export const LESSON_QUALITY_ALLOWLISTS: Record<string, LessonQualityAllowlist> =
  {};

// Scans a lesson for content-quality problems the shape validator ignores:
//   - two phrases sharing an english gloss (case-insensitive), or
//   - two phrases sharing a native-script value, or
//   - a native-script value containing Latin letters or ASCII digits.
// Returns a list of human-readable issue strings (empty when the lesson is
// clean). Pass an allowlist to exempt human-reviewed exceptions.
export function checkLessonQuality(
  lesson: SeedLesson,
  allow: LessonQualityAllowlist = {},
): string[] {
  const engAllow = new Set(
    (allow.duplicateEnglish ?? []).map((s) => s.trim().toLowerCase()),
  );
  const nativeAllow = new Set((allow.duplicateNative ?? []).map((s) => s.trim()));
  const latinAllow = new Set((allow.latinInNative ?? []).map((s) => s.trim()));

  const issues: string[] = [];
  const seenEnglish = new Map<string, number>();
  const seenNative = new Map<string, number>();

  lesson.phrases.forEach((p, i) => {
    const english = p.english.trim().toLowerCase();
    const native = p.nativeScript.trim();

    if (seenEnglish.has(english) && !engAllow.has(english)) {
      issues.push(
        `phrases ${seenEnglish.get(english)} and ${i} share the english gloss "${p.english.trim()}"`,
      );
    } else if (!seenEnglish.has(english)) {
      seenEnglish.set(english, i);
    }

    if (seenNative.has(native) && !nativeAllow.has(native)) {
      issues.push(
        `phrases ${seenNative.get(native)} and ${i} share the native script "${native}"`,
      );
    } else if (!seenNative.has(native)) {
      seenNative.set(native, i);
    }

    if (nativeScriptHasLatinOrDigit(native) && !latinAllow.has(native)) {
      issues.push(
        `phrase ${i} nativeScript "${native}" (${p.english.trim()}) contains Latin letters or ASCII digits`,
      );
    }
  });

  return issues;
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
      const invalid = validateSeedLesson(lesson, extendedPhraseCount(cat.slug));
      if (invalid) {
        errors.push(`${lang.code}/${cat.slug}: ${invalid}`);
        continue;
      }
      // Shape is fine — now reject well-formed-but-broken content: a lesson
      // that repeats a phrase (two entries both meaning "happy") or types an
      // English word in native script. A bad regeneration must not ship.
      for (const issue of checkLessonQuality(
        lesson,
        LESSON_QUALITY_ALLOWLISTS[`${lang.code}/${cat.slug}`],
      )) {
        errors.push(`${lang.code}/${cat.slug}: ${issue}`);
      }
    }
  }
  return { errors, missing };
}
