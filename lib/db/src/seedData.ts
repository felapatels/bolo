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
  /**
   * Verified speech-recognition capability (see languages schema). Defaults to
   * "supported" when omitted. Verdicts come from the July 28, 2026 probe
   * (artifacts/api-server/scripts/probeSttLanguages.ts) — TTS-generated correct
   * speech through the real pronunciation pipeline:
   *  - ks  degraded    — correct speech scored 74/close.
   *  - sat degraded    — recognizer flips Ol Chiki to Latin transliteration.
   *  - mni unsupported — correct speech transcribed as Bengali gibberish (2/retry).
   *  - brx unsupported — correct speech scored 38/retry.
   */
  speechCapability?: "supported" | "degraded" | "unsupported";
};

export const LANGUAGES: SeedLanguage[] = [
  { code: "as", name: "Assamese", nativeName: "অসমীয়া", script: "Bengali-Assamese", fontFamily: "Noto Sans Bengali" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", script: "Bengali", fontFamily: "Noto Sans Bengali" },
  { code: "brx", name: "Bodo", nativeName: "बड़ो", script: "Devanagari", fontFamily: "Noto Sans Devanagari", speechCapability: "unsupported" },
  { code: "doi", name: "Dogri", nativeName: "डोगरी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", script: "Gujarati", fontFamily: "Noto Sans Gujarati" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", script: "Kannada", fontFamily: "Noto Sans Kannada" },
  { code: "ks", name: "Kashmiri", nativeName: "کٲشُر", script: "Perso-Arabic", fontFamily: "Noto Nastaliq Urdu", rtl: true, speechCapability: "degraded" },
  { code: "kok", name: "Konkani", nativeName: "कोंकणी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "mai", name: "Maithili", nativeName: "मैथिली", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", script: "Malayalam", fontFamily: "Noto Sans Malayalam" },
  { code: "mni", name: "Manipuri", nativeName: "ꯃꯤꯇꯩ ꯂꯣꯟ", script: "Meetei Mayek", fontFamily: "Noto Sans Meetei Mayek", speechCapability: "unsupported" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", script: "Odia", fontFamily: "Noto Sans Oriya" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", script: "Gurmukhi", fontFamily: "Noto Sans Gurmukhi" },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृतम्", script: "Devanagari", fontFamily: "Noto Sans Devanagari" },
  { code: "sat", name: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", script: "Ol Chiki", fontFamily: "Noto Sans Ol Chiki", speechCapability: "degraded" },
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
export const EXTENDED_PHRASES_PER_LESSON = 40;

// The fixed gloss sequence the Numbers topic teaches, in order: the free
// starter set is one..ten (NUMBER_WORDS_STARTER of them) and the Plus-only
// premium extension continues eleven..twenty. Shared by the offline generator
// and the seed test so the enforced sequence can never drift between them.
export const NUMBER_WORDS: string[] = [
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
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

// Topics whose full library is a fixed length rather than
// EXTENDED_PHRASES_PER_LESSON. "Numbers 1-10" is an inherently fixed sequence:
// its starter set stays the free one-through-ten, and its premium extension is
// the fixed continuation eleven-through-twenty rather than open vocabulary.
export const CATEGORY_EXTENDED_COUNTS: Record<string, number> = {
  numbers: NUMBER_WORDS.length,
};

// The full (starter + premium) phrase count a curated lesson for `categorySlug`
// must have in the frozen data.
export function extendedPhraseCount(categorySlug: string): number {
  return CATEGORY_EXTENDED_COUNTS[categorySlug] ?? EXTENDED_PHRASES_PER_LESSON;
}

// The Plus-only "sentence stage": every topic ends with this many full, natural
// sentences that build on the topic's vocabulary. Curated/frozen lessons must
// carry exactly this many sentences; every sentence is premium (Plus-only).
export const SENTENCES_PER_LESSON = 8;

// How many sentence-stage entries a curated lesson for `categorySlug` must
// have. Uniform today, but routed through a function (like the phrase counts)
// so a topic could diverge later without touching every call site.
export function sentenceCount(_categorySlug: string): number {
  return SENTENCES_PER_LESSON;
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

// `phrases` is the ranked starter+premium phrase list; `sentences` is the
// distinct Plus-only sentence stage of full, natural sentences a learner
// graduates to after the phrase list. Kept separate so the phrase ranking and
// tier boundary never shift when the sentence stage grows.
export type SeedLesson = {
  titleNative: string;
  phrases: SeedPhrase[];
  sentences?: SeedPhrase[];
};

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
      { nativeScript: "શું ચાલે છે?", romanized: "shu chaale chhe?", english: "What's going on?", difficulty: 1 },
      { nativeScript: "ઘણા વખતે મળ્યા", romanized: "ghana vakhte malya", english: "Long time no see", difficulty: 2 },
      { nativeScript: "ફરી મળીશું", romanized: "fari malishu", english: "See you again", difficulty: 2 },
      { nativeScript: "તમારો દિવસ કેવો રહ્યો?", romanized: "tamaro divas kevo rahyo?", english: "How was your day?", difficulty: 2 },
      { nativeScript: "બધું બરાબર છે", romanized: "badhu barabar chhe", english: "Everything is fine", difficulty: 1 },
      { nativeScript: "પધારો", romanized: "padhaaro", english: "Please come in (honorific)", difficulty: 2 },
      { nativeScript: "મળતા રહેજો", romanized: "malta rahejo", english: "Keep in touch", difficulty: 2 },
      { nativeScript: "શુભ બપોર", romanized: "shubh bapor", english: "Good afternoon", difficulty: 1 },
      { nativeScript: "કાલે મળીએ", romanized: "kaale malie", english: "See you tomorrow", difficulty: 2 },
      { nativeScript: "સાચવીને જજો", romanized: "saachvine jajo", english: "Take care on your way", difficulty: 2 },
      { nativeScript: "ખૂબ ખૂબ અભિનંદન", romanized: "khoob khoob abhinandan", english: "Congratulations", difficulty: 2 },
      { nativeScript: "જન્મદિવસની શુભેચ્છા", romanized: "janmadivasni shubhechchha", english: "Happy birthday", difficulty: 3 },
      { nativeScript: "ઘરે આવો", romanized: "ghare aavo", english: "Come over to our home", difficulty: 1 },
      { nativeScript: "મહેરબાની", romanized: "maherbaani", english: "Kindness / a favor", difficulty: 2 },
      { nativeScript: "પ્રણામ", romanized: "pranaam", english: "Respectful greeting", difficulty: 2 },
      { nativeScript: "ક્ષમા કરો", romanized: "kshama karo", english: "Forgive me", difficulty: 3 },
    ],
    sentences: [
      { nativeScript: "તમારું નામ શું છે?", romanized: "tamaru naam shu chhe?", english: "What is your name?", difficulty: 1 },
      { nativeScript: "મારું નામ રાજ છે.", romanized: "maru naam raj chhe.", english: "My name is Raj.", difficulty: 1 },
      { nativeScript: "આજે તમે કેમ છો?", romanized: "aaje tame kem chho?", english: "How are you today?", difficulty: 2 },
      { nativeScript: "તમને મળીને ખૂબ આનંદ થયો.", romanized: "tamne maline khoob aanand thayo.", english: "It was a real pleasure to meet you.", difficulty: 2 },
      { nativeScript: "મહેરબાની કરીને અંદર આવો.", romanized: "maherbaani karine andar aavo.", english: "Please come inside.", difficulty: 2 },
      { nativeScript: "માફ કરજો, મને મોડું થયું.", romanized: "maaf karjo, mane modu thayu.", english: "Sorry, I got late.", difficulty: 2 },
      { nativeScript: "આવજો, આપણે ફરી મળીશું.", romanized: "aavjo, aapne fari malishu.", english: "Goodbye, we will meet again.", difficulty: 2 },
      { nativeScript: "આપનો દિવસ શુભ રહે.", romanized: "aapno divas shubh rahe.", english: "May your day go well.", difficulty: 3 },
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
      { nativeScript: "વહુ", romanized: "vahu", english: "daughter-in-law", difficulty: 2 },
      { nativeScript: "સાસુ", romanized: "saasu", english: "mother-in-law", difficulty: 2 },
      { nativeScript: "સસરા", romanized: "sasra", english: "father-in-law", difficulty: 2 },
      { nativeScript: "સાળો", romanized: "saalo", english: "wife's brother", difficulty: 3 },
      { nativeScript: "બનેવી", romanized: "banevi", english: "sister's husband", difficulty: 3 },
      { nativeScript: "મોટા ભાઈ", romanized: "mota bhai", english: "elder brother", difficulty: 1 },
      { nativeScript: "નાની બહેન", romanized: "naani bahen", english: "younger sister", difficulty: 1 },
      { nativeScript: "ભત્રીજો", romanized: "bhatrijo", english: "nephew (brother's son)", difficulty: 2 },
      { nativeScript: "ભત્રીજી", romanized: "bhatriji", english: "niece (brother's daughter)", difficulty: 2 },
      { nativeScript: "ભાણેજ", romanized: "bhaanej", english: "sister's child", difficulty: 3 },
      { nativeScript: "પિતરાઈ", romanized: "pitarai", english: "cousin", difficulty: 2 },
      { nativeScript: "માસી", romanized: "maasi", english: "mother's sister", difficulty: 1 },
      { nativeScript: "માસા", romanized: "maasa", english: "mother's sister's husband", difficulty: 2 },
      { nativeScript: "કુટુંબીજનો", romanized: "kutumbijano", english: "relatives", difficulty: 3 },
      { nativeScript: "બાળક", romanized: "baalak", english: "child", difficulty: 1 },
      { nativeScript: "જોડિયા", romanized: "jodiya", english: "twins", difficulty: 2 },
    ],
    sentences: [
      { nativeScript: "મારા પરિવારમાં પાંચ લોકો છે.", romanized: "maara parivaarma paanch loko chhe.", english: "There are five people in my family.", difficulty: 2 },
      { nativeScript: "મમ્મી રસોડામાં રસોઈ કરે છે.", romanized: "mummy rasodama rasoi kare chhe.", english: "Mom is cooking in the kitchen.", difficulty: 2 },
      { nativeScript: "પપ્પા કામ પરથી ઘરે આવ્યા.", romanized: "pappa kaam parthi ghare aavya.", english: "Dad came home from work.", difficulty: 2 },
      { nativeScript: "મારો ભાઈ મારાથી મોટો છે.", romanized: "maro bhai maarathi moto chhe.", english: "My brother is older than me.", difficulty: 2 },
      { nativeScript: "મારી બહેન શાળામાં ભણે છે.", romanized: "maari bahen shaalama bhane chhe.", english: "My sister studies at school.", difficulty: 2 },
      { nativeScript: "નાની અમને વાર્તા કહે છે.", romanized: "nani amne vaarta kahe chhe.", english: "Grandma tells us stories.", difficulty: 2 },
      { nativeScript: "અમે બધા સાથે જમીએ છીએ.", romanized: "ame badha saathe jamie chhie.", english: "We all eat together.", difficulty: 2 },
      { nativeScript: "દાદા રોજ સવારે ચાલવા જાય છે.", romanized: "dada roj savare chaalva jaay chhe.", english: "Grandpa goes for a walk every morning.", difficulty: 3 },
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
      { nativeScript: "અગિયાર", romanized: "agiyaar", english: "Eleven", difficulty: 2 },
      { nativeScript: "બાર", romanized: "baar", english: "Twelve", difficulty: 2 },
      { nativeScript: "તેર", romanized: "ter", english: "Thirteen", difficulty: 2 },
      { nativeScript: "ચૌદ", romanized: "chaud", english: "Fourteen", difficulty: 2 },
      { nativeScript: "પંદર", romanized: "pandar", english: "Fifteen", difficulty: 2 },
      { nativeScript: "સોળ", romanized: "sol", english: "Sixteen", difficulty: 2 },
      { nativeScript: "સત્તર", romanized: "sattar", english: "Seventeen", difficulty: 2 },
      { nativeScript: "અઢાર", romanized: "adhaar", english: "Eighteen", difficulty: 2 },
      { nativeScript: "ઓગણીસ", romanized: "ognis", english: "Nineteen", difficulty: 2 },
      { nativeScript: "વીસ", romanized: "vees", english: "Twenty", difficulty: 2 },
    ],
    sentences: [
      { nativeScript: "મારી પાસે બે પુસ્તકો છે.", romanized: "maari paase be pustako chhe.", english: "I have two books.", difficulty: 1 },
      { nativeScript: "મને પાંચ મિનિટ આપો.", romanized: "mane paanch minit aapo.", english: "Give me five minutes.", difficulty: 1 },
      { nativeScript: "ટેબલ પર ત્રણ સફરજન છે.", romanized: "tebal par tran safarjan chhe.", english: "There are three apples on the table.", difficulty: 2 },
      { nativeScript: "અમારા ઘરમાં ચાર ઓરડા છે.", romanized: "amaara gharma chaar orda chhe.", english: "Our house has four rooms.", difficulty: 2 },
      { nativeScript: "બગીચામાં છ ઝાડ છે.", romanized: "bagichama chha jhaad chhe.", english: "There are six trees in the garden.", difficulty: 2 },
      { nativeScript: "અઠવાડિયામાં સાત દિવસ હોય છે.", romanized: "athvadiyama saat divas hoy chhe.", english: "There are seven days in a week.", difficulty: 2 },
      { nativeScript: "મેં દસ સુધી ગણતરી કરી.", romanized: "me das sudhi ganatri kari.", english: "I counted up to ten.", difficulty: 2 },
      { nativeScript: "વર્ગમાં નવ વિદ્યાર્થીઓ છે.", romanized: "vargma nav vidyarthio chhe.", english: "There are nine students in the class.", difficulty: 3 },
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
      { nativeScript: "ચા", romanized: "chaa", english: "Tea", difficulty: 1 },
      { nativeScript: "છાશ", romanized: "chhaash", english: "Buttermilk", difficulty: 1 },
      { nativeScript: "ખીચડી", romanized: "khichdi", english: "Khichdi (rice-lentil dish)", difficulty: 1 },
      { nativeScript: "ઢોકળા", romanized: "dhokla", english: "Dhokla", difficulty: 1 },
      { nativeScript: "થેપલા", romanized: "thepla", english: "Thepla", difficulty: 1 },
      { nativeScript: "શીરો", romanized: "shiro", english: "Sweet semolina pudding", difficulty: 2 },
      { nativeScript: "ખાંડ", romanized: "khaand", english: "Sugar", difficulty: 1 },
      { nativeScript: "હળદર", romanized: "haldar", english: "Turmeric", difficulty: 2 },
      { nativeScript: "જીરું", romanized: "jeeru", english: "Cumin", difficulty: 2 },
      { nativeScript: "ફળ", romanized: "fal", english: "Fruit", difficulty: 1 },
      { nativeScript: "કેરી", romanized: "keri", english: "Mango", difficulty: 1 },
      { nativeScript: "કેળું", romanized: "kelu", english: "Banana", difficulty: 1 },
      { nativeScript: "બટાકા", romanized: "bataka", english: "Potato", difficulty: 1 },
      { nativeScript: "ડુંગળી", romanized: "dungli", english: "Onion", difficulty: 2 },
      { nativeScript: "સ્વાદિષ્ટ", romanized: "swaadisht", english: "Delicious", difficulty: 2 },
      { nativeScript: "પીવું", romanized: "pivu", english: "To drink", difficulty: 1 },
    ],
    sentences: [
      { nativeScript: "કૃપા કરીને મને પાણી આપો.", romanized: "krupa karine mane paani aapo.", english: "Please give me some water.", difficulty: 1 },
      { nativeScript: "મને થોડું દૂધ જોઈએ છે.", romanized: "mane thodu doodh joie chhe.", english: "I need a little milk.", difficulty: 1 },
      { nativeScript: "ચાલો, જમવા બેસીએ.", romanized: "chaalo, jamva besie.", english: "Come, let's sit down to eat.", difficulty: 1 },
      { nativeScript: "આજે જમવામાં દાળ ભાત છે.", romanized: "aaje jamvama daal bhaat chhe.", english: "Today's meal is dal and rice.", difficulty: 2 },
      { nativeScript: "રોટલી ગરમ છે, ધ્યાન રાખજો.", romanized: "rotli garam chhe, dhyaan raakhjo.", english: "The roti is hot, be careful.", difficulty: 2 },
      { nativeScript: "મમ્મીએ સ્વાદિષ્ટ શાક બનાવ્યું.", romanized: "mummy-e swadisht shaak banavyu.", english: "Mom made a delicious vegetable dish.", difficulty: 2 },
      { nativeScript: "મને ગુજરાતી ખાવાનું બહુ ભાવે છે.", romanized: "mane gujarati khaavaanu bahu bhaave chhe.", english: "I really love Gujarati food.", difficulty: 2 },
      { nativeScript: "જમ્યા પછી આપણે મીઠાઈ ખાઈશું.", romanized: "jamya pachhi aapne mithai khaishu.", english: "We will eat dessert after the meal.", difficulty: 3 },
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
      { nativeScript: "આજે", romanized: "aaje", english: "Today", difficulty: 1 },
      { nativeScript: "કાલે", romanized: "kaale", english: "Tomorrow", difficulty: 1 },
      { nativeScript: "અત્યારે", romanized: "atyaare", english: "Right now", difficulty: 1 },
      { nativeScript: "ધીમે ધીમે", romanized: "dhime dhime", english: "Slowly", difficulty: 1 },
      { nativeScript: "જલદી", romanized: "jaldi", english: "Quickly", difficulty: 1 },
      { nativeScript: "ક્યાં?", romanized: "kyaan?", english: "Where?", difficulty: 1 },
      { nativeScript: "શું?", romanized: "shu?", english: "What?", difficulty: 1 },
      { nativeScript: "કોણ?", romanized: "kon?", english: "Who?", difficulty: 1 },
      { nativeScript: "ક્યારે?", romanized: "kyaare?", english: "When?", difficulty: 2 },
      { nativeScript: "કેટલું?", romanized: "ketlu?", english: "How much?", difficulty: 2 },
      { nativeScript: "ખુલ્લું", romanized: "khullu", english: "Open", difficulty: 1 },
      { nativeScript: "બંધ", romanized: "bandh", english: "Closed", difficulty: 1 },
      { nativeScript: "મોટું", romanized: "motu", english: "Big", difficulty: 1 },
      { nativeScript: "નાનું", romanized: "naanu", english: "Small", difficulty: 1 },
      { nativeScript: "પુસ્તક", romanized: "pustak", english: "Book", difficulty: 1 },
      { nativeScript: "શાળા", romanized: "shaala", english: "School", difficulty: 1 },
    ],
    sentences: [
      { nativeScript: "મને થોડી મદદ જોઈએ છે.", romanized: "mane thodi madad joie chhe.", english: "I need some help.", difficulty: 1 },
      { nativeScript: "થોડી વાર અહીં બેસો.", romanized: "thodi vaar ahin beso.", english: "Sit here for a little while.", difficulty: 1 },
      { nativeScript: "ચાલો, આપણે બહાર ફરવા જઈએ.", romanized: "chaalo, aapne bahaar farva jaie.", english: "Come on, let's go out for a stroll.", difficulty: 2 },
      { nativeScript: "હું હમણાં ઘરે જાઉં છું.", romanized: "hu hamnaa ghare jaau chhu.", english: "I am going home now.", difficulty: 2 },
      { nativeScript: "આજે હવામાન બહુ સરસ છે.", romanized: "aaje havaamaan bahu saras chhe.", english: "The weather is very nice today.", difficulty: 2 },
      { nativeScript: "મહેરબાની કરીને બારણું બંધ કરજો.", romanized: "maherbaani karine baarnu bandh karjo.", english: "Please close the door.", difficulty: 2 },
      { nativeScript: "મને એ ફરીથી કહો.", romanized: "mane e farithi kaho.", english: "Tell me that again.", difficulty: 2 },
      { nativeScript: "હું કાલે તમને મળીશ.", romanized: "hu kaale tamne malish.", english: "I will meet you tomorrow.", difficulty: 2 },
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
      { nativeScript: "તરસ લાગી છે", romanized: "taras laagi chhe", english: "I am thirsty", difficulty: 1 },
      { nativeScript: "ઊંઘ આવે છે", romanized: "oongh aave chhe", english: "I feel sleepy", difficulty: 1 },
      { nativeScript: "શરમ આવે છે", romanized: "sharam aave chhe", english: "I feel shy", difficulty: 2 },
      { nativeScript: "ઈર્ષ્યા થાય છે", romanized: "irshya thaay chhe", english: "I feel jealous", difficulty: 3 },
      { nativeScript: "હિંમત", romanized: "himmat", english: "Courage", difficulty: 2 },
      { nativeScript: "આનંદ", romanized: "aanand", english: "Joy", difficulty: 1 },
      { nativeScript: "પ્રેમ", romanized: "prem", english: "Love", difficulty: 1 },
      { nativeScript: "દુઃખ", romanized: "dukh", english: "Grief", difficulty: 2 },
      { nativeScript: "ગુસ્સો", romanized: "gusso", english: "Anger", difficulty: 1 },
      { nativeScript: "શાંતિ થાય છે", romanized: "shaanti thaay chhe", english: "I feel at peace", difficulty: 2 },
      { nativeScript: "મન થાય છે", romanized: "man thaay chhe", english: "I feel like it", difficulty: 2 },
      { nativeScript: "મન નથી", romanized: "man nathi", english: "I don't feel like it", difficulty: 2 },
      { nativeScript: "વિશ્વાસ છે", romanized: "vishwaas chhe", english: "I have faith", difficulty: 2 },
      { nativeScript: "આશા છે", romanized: "aasha chhe", english: "I am hopeful", difficulty: 2 },
      { nativeScript: "મૂંઝવણ થાય છે", romanized: "moonjhvan thaay chhe", english: "I feel puzzled", difficulty: 3 },
      { nativeScript: "ખુશખુશાલ", romanized: "khushkhushaal", english: "Overjoyed", difficulty: 2 },
    ],
    sentences: [
      { nativeScript: "આજે હું ખૂબ ખુશ છું.", romanized: "aaje hu khoob khush chhu.", english: "I am very happy today.", difficulty: 1 },
      { nativeScript: "મને આ ગીત બહુ ગમે છે.", romanized: "mane aa geet bahu game chhe.", english: "I like this song a lot.", difficulty: 2 },
      { nativeScript: "કામ કરીને હું થાકી ગયો છું.", romanized: "kaam karine hu thaki gayo chhu.", english: "I am tired from working.", difficulty: 2 },
      { nativeScript: "અંધારામાં મને ડર લાગે છે.", romanized: "andhaarama mane dar laage chhe.", english: "I feel scared in the dark.", difficulty: 2 },
      { nativeScript: "મારા ભાઈ પર મને ગર્વ છે.", romanized: "maara bhai par mane garv chhe.", english: "I am proud of my brother.", difficulty: 2 },
      { nativeScript: "આજે મન થોડું ઉદાસ છે.", romanized: "aaje man thodu udaas chhe.", english: "My heart feels a little sad today.", difficulty: 2 },
      { nativeScript: "પરીક્ષા પહેલા હું ગભરાઉં છું.", romanized: "parikshaa pahela hu gabhraau chhu.", english: "I get nervous before an exam.", difficulty: 2 },
      { nativeScript: "તમને જોઈને મને આનંદ થયો.", romanized: "tamne joine mane aanand thayo.", english: "I felt joy on seeing you.", difficulty: 3 },
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
  return validateSeedPhraseFields(lesson.phrases, "phrase");
}

// Field-level validation shared by the phrase list and the sentence stage:
// every entry needs non-empty nativeScript/romanized/english and an integer
// difficulty in [1, 3]. Returns an error string or null.
function validateSeedPhraseFields(
  entries: SeedPhrase[],
  label: string,
): string | null {
  for (let i = 0; i < entries.length; i++) {
    const p = entries[i];
    if (!p || typeof p.nativeScript !== "string" || p.nativeScript.trim() === "") {
      return `${label} ${i}: missing nativeScript`;
    }
    if (typeof p.romanized !== "string" || p.romanized.trim() === "") {
      return `${label} ${i}: missing romanized`;
    }
    if (typeof p.english !== "string" || p.english.trim() === "") {
      return `${label} ${i}: missing english`;
    }
    if (!Number.isInteger(p.difficulty) || p.difficulty < 1 || p.difficulty > 3) {
      return `${label} ${i}: difficulty ${p.difficulty} out of range 1-3`;
    }
  }
  return null;
}

// Validates a lesson's Plus-only sentence stage. `exactCount` enforces the
// exact sentence count the curated data must carry (sentenceCount(slug));
// leave it undefined to only require the stage to be present and non-empty.
export function validateSeedSentences(
  lesson: SeedLesson | undefined,
  exactCount?: number,
): string | null {
  if (!lesson) return "missing lesson";
  const sentences = lesson.sentences;
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return "lesson has no sentence stage";
  }
  if (exactCount != null && sentences.length !== exactCount) {
    return `expected ${exactCount} sentences, got ${sentences.length}`;
  }
  return validateSeedPhraseFields(sentences, "sentence");
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
      // The sentence stage is part of the frozen contract too: every present
      // lesson must carry its full, well-formed set of Plus-only sentences.
      const invalidSentences = validateSeedSentences(
        lesson,
        sentenceCount(cat.slug),
      );
      if (invalidSentences) {
        errors.push(`${lang.code}/${cat.slug}: ${invalidSentences}`);
        continue;
      }
      // Sentences go through the same content-quality rules as phrases,
      // checked among themselves (a sentence may legitimately build on a word
      // the phrase list already teaches). Allowlist key: "<lesson>#sentences".
      for (const issue of checkLessonQuality(
        { titleNative: lesson.titleNative, phrases: lesson.sentences ?? [] },
        LESSON_QUALITY_ALLOWLISTS[`${lang.code}/${cat.slug}#sentences`],
      )) {
        errors.push(`${lang.code}/${cat.slug} (sentences): ${issue}`);
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
