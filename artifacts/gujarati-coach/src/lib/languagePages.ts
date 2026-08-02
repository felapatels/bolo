// Public per-language marketing pages: the committed data behind /languages/<slug>.
//
// SOURCE + SYNC MECHANISM: this file is GENERATED from the canonical language
// catalog (lib/db/src/seedData.ts LANGUAGES) plus the committed curated free
// starter content (lib/db/src/data/curatedLessons.json; Gujarati's hand-curated
// greetings live in seedData.ts itself). Each entry carries the first three
// free starter greetings phrases. The public pages are client-rendered SPA
// routes (no server rendering); the live language list still comes from the
// public GET /languages API where the app is running, but these pages must
// render fully with zero API calls, so the samples are frozen here at build
// time. Regenerate by re-running the extraction against those two sources if
// the catalog or starter greetings change (see docs/CODEBASE-FACTS.md).
//
// Payloads are marketing-safe: native script, romanization, and English gloss
// only, all drawn from the FREE starter set (never premium rows).

export interface LanguagePagePhrase {
  nativeScript: string;
  romanized: string;
  english: string;
}

export interface LanguagePageEntry {
  slug: string;
  code: string;
  name: string;
  nativeName: string;
  fontFamily: string;
  rtl: boolean;
  phrases: LanguagePagePhrase[];
}

// Diaspora-priority order for the homepage showcase: the eight highest-demand
// diaspora languages lead, the rest follow alphabetically.
export const DIASPORA_LEADERS = [
  'hi', 'pa', 'ur', 'bn', 'ta', 'te', 'gu', 'mr',
] as const;

export const LANGUAGE_PAGES: LanguagePageEntry[] = [
  {"slug":"assamese","code":"as","name":"Assamese","nativeName":"অসমীয়া","fontFamily":"Noto Sans Bengali","rtl":false,"phrases":[{"nativeScript":"নমস্কাৰ","romanized":"nomoskar","english":"Hello"},{"nativeScript":"বিদায়","romanized":"biday","english":"Goodbye"},{"nativeScript":"ধন্যবাদ","romanized":"dhonyobad","english":"Thank you"}]},
  {"slug":"bengali","code":"bn","name":"Bengali","nativeName":"বাংলা","fontFamily":"Noto Sans Bengali","rtl":false,"phrases":[{"nativeScript":"এই যে","romanized":"ei je","english":"hello / hey there"},{"nativeScript":"নমস্কার","romanized":"nomoshkar","english":"hello / greetings"},{"nativeScript":"ধন্যবাদ","romanized":"dhonnobad","english":"thank you"}]},
  {"slug":"bodo","code":"brx","name":"Bodo","nativeName":"बड़ो","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"जों","romanized":"jong","english":"hello"},{"nativeScript":"खराब बा?","romanized":"khorab ba?","english":"How are you?"},{"nativeScript":"धन्यबाद","romanized":"dhonyabad","english":"thank you"}]},
  {"slug":"dogri","code":"doi","name":"Dogri","nativeName":"डोगरी","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्ते","romanized":"namaste","english":"Hello"},{"nativeScript":"शुभ प्रभात","romanized":"shubh prabhat","english":"Good morning"},{"nativeScript":"धन्यवाद","romanized":"dhanyavaad","english":"Thank you"}]},
  {"slug":"gujarati","code":"gu","name":"Gujarati","nativeName":"ગુજરાતી","fontFamily":"Noto Sans Gujarati","rtl":false,"phrases":[{"nativeScript":"કેમ છો?","romanized":"kem chho?","english":"How are you?"},{"nativeScript":"નમસ્તે","romanized":"namaste","english":"Hello"},{"nativeScript":"આભાર","romanized":"aabhaar","english":"Thank you"}]},
  {"slug":"hindi","code":"hi","name":"Hindi","nativeName":"हिन्दी","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्ते","romanized":"namaste","english":"Hello"},{"nativeScript":"धन्यवाद","romanized":"dhanyavaad","english":"Thank you"},{"nativeScript":"माफ़ कीजिए","romanized":"maaf kijiye","english":"Excuse me / Sorry"}]},
  {"slug":"kannada","code":"kn","name":"Kannada","nativeName":"ಕನ್ನಡ","fontFamily":"Noto Sans Kannada","rtl":false,"phrases":[{"nativeScript":"ನಮಸ್ಕಾರ","romanized":"namaskara","english":"hello"},{"nativeScript":"ವಂದನೆಗಳು","romanized":"vandanegaloo","english":"greetings"},{"nativeScript":"ಧನ್ಯವಾದಗಳು","romanized":"dhanyavadagalu","english":"thank you"}]},
  {"slug":"kashmiri","code":"ks","name":"Kashmiri","nativeName":"کٲشُر","fontFamily":"Noto Nastaliq Urdu","rtl":true,"phrases":[{"nativeScript":"آداب","romanized":"aadaab","english":"hello; greetings"},{"nativeScript":"سُپرا بھَت","romanized":"suprā bhat","english":"good morning"},{"nativeScript":"خُدا حافظ","romanized":"khuda haafiz","english":"goodbye"}]},
  {"slug":"konkani","code":"kok","name":"Konkani","nativeName":"कोंकणी","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्कार","romanized":"namaskar","english":"hello / greetings"},{"nativeScript":"देव बरें करूं","romanized":"dev barem karun","english":"goodbye"},{"nativeScript":"आभार","romanized":"abhaar","english":"thank you"}]},
  {"slug":"maithili","code":"mai","name":"Maithili","nativeName":"मैथिली","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्कार","romanized":"namaskar","english":"hello"},{"nativeScript":"धन्यवाद","romanized":"dhanyavad","english":"thank you"},{"nativeScript":"कृपया","romanized":"kripaya","english":"please"}]},
  {"slug":"malayalam","code":"ml","name":"Malayalam","nativeName":"മലയാളം","fontFamily":"Noto Sans Malayalam","rtl":false,"phrases":[{"nativeScript":"നമസ്കാരം","romanized":"namaskaram","english":"hello"},{"nativeScript":"ശുഭദിനം","romanized":"shubhadinam","english":"good day"},{"nativeScript":"സുപ്രഭാതം","romanized":"suprabhaatam","english":"good morning"}]},
  {"slug":"manipuri","code":"mni","name":"Manipuri","nativeName":"ꯃꯤꯇꯩ ꯂꯣꯟ","fontFamily":"Noto Sans Meetei Mayek","rtl":false,"phrases":[{"nativeScript":"ꯎꯏ","romanized":"ui","english":"Hello"},{"nativeScript":"ꯍꯣ","romanized":"ho","english":"Yes"},{"nativeScript":"ꯌꯦꯃꯥ","romanized":"yema","english":"Okay"}]},
  {"slug":"marathi","code":"mr","name":"Marathi","nativeName":"मराठी","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्कार","romanized":"namaskaar","english":"hello"},{"nativeScript":"धन्यवाद","romanized":"dhanyavaad","english":"thank you"},{"nativeScript":"कृपया","romanized":"krupayaa","english":"please"}]},
  {"slug":"nepali","code":"ne","name":"Nepali","nativeName":"नेपाली","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्ते","romanized":"namaste","english":"Hello"},{"nativeScript":"धन्यवाद","romanized":"dhanyabad","english":"Thank you"},{"nativeScript":"कृपया","romanized":"kripaya","english":"Please"}]},
  {"slug":"odia","code":"or","name":"Odia","nativeName":"ଓଡ଼ିଆ","fontFamily":"Noto Sans Oriya","rtl":false,"phrases":[{"nativeScript":"ନମସ୍କାର","romanized":"namaskara","english":"Hello"},{"nativeScript":"ଧନ୍ୟବାଦ","romanized":"dhanyabad","english":"Thank you"},{"nativeScript":"ସୁପ୍ରଭାତ","romanized":"suprabhat","english":"Good morning"}]},
  {"slug":"punjabi","code":"pa","name":"Punjabi","nativeName":"ਪੰਜਾਬੀ","fontFamily":"Noto Sans Gurmukhi","rtl":false,"phrases":[{"nativeScript":"ਨਮਸਤੇ","romanized":"namaste","english":"hello"},{"nativeScript":"ਸਤ ਸ੍ਰੀ ਅਕਾਲ","romanized":"sat sri akal","english":"hello / greetings"},{"nativeScript":"ਧੰਨਵਾਦ","romanized":"dhannvaad","english":"thank you"}]},
  {"slug":"sanskrit","code":"sa","name":"Sanskrit","nativeName":"संस्कृतम्","fontFamily":"Noto Sans Devanagari","rtl":false,"phrases":[{"nativeScript":"नमस्ते","romanized":"namaste","english":"hello"},{"nativeScript":"धन्यवादः","romanized":"dhanyavādaḥ","english":"thank you"},{"nativeScript":"कृपया","romanized":"kṛpayā","english":"please"}]},
  {"slug":"santali","code":"sat","name":"Santali","nativeName":"ᱥᱟᱱᱛᱟᱲᱤ","fontFamily":"Noto Sans Ol Chiki","rtl":false,"phrases":[{"nativeScript":"ᱥᱟᱞᱟᱢ","romanized":"salam","english":"hello"},{"nativeScript":"ᱡᱚᱦᱟᱨ","romanized":"johar","english":"hello; respect greeting"},{"nativeScript":"ᱴᱩᱫᱩᱞ ᱵᱚᱦᱟᱫᱟᱜ","romanized":"tudul bohadag","english":"good morning"}]},
  {"slug":"sindhi","code":"sd","name":"Sindhi","nativeName":"سنڌي","fontFamily":"Noto Naskh Arabic","rtl":true,"phrases":[{"nativeScript":"سلام","romanized":"salaam","english":"hello"},{"nativeScript":"صبح جو سلام","romanized":"subah jo salaam","english":"good morning"},{"nativeScript":"شب بخير","romanized":"shab bakhair","english":"good night"}]},
  {"slug":"tamil","code":"ta","name":"Tamil","nativeName":"தமிழ்","fontFamily":"Noto Sans Tamil","rtl":false,"phrases":[{"nativeScript":"வணக்கம்","romanized":"vanakkam","english":"hello"},{"nativeScript":"நன்றி","romanized":"nandri","english":"thank you"},{"nativeScript":"தயவு செய்து","romanized":"thayavu seydhu","english":"please"}]},
  {"slug":"telugu","code":"te","name":"Telugu","nativeName":"తెలుగు","fontFamily":"Noto Sans Telugu","rtl":false,"phrases":[{"nativeScript":"బాగున్నారా?","romanized":"baagunnaaraa?","english":"are you well?"},{"nativeScript":"నమస్తే","romanized":"namaste","english":"hello / greetings"},{"nativeScript":"శుభోదయం","romanized":"shubhodayam","english":"good morning"}]},
  {"slug":"urdu","code":"ur","name":"Urdu","nativeName":"اردو","fontFamily":"Noto Nastaliq Urdu","rtl":true,"phrases":[{"nativeScript":"سلام","romanized":"salaam","english":"hello"},{"nativeScript":"خدا حافظ","romanized":"khuda hafiz","english":"goodbye"},{"nativeScript":"شکریہ","romanized":"shukriya","english":"thank you"}]}
];

const bySlug = new Map(LANGUAGE_PAGES.map((l) => [l.slug, l]));

export function languagePageBySlug(slug: string): LanguagePageEntry | undefined {
  return bySlug.get(slug.toLowerCase());
}

/** All 22 entries reordered so the diaspora leaders come first, in order. */
export function diasporaOrdered<T extends { code: string }>(langs: T[]): T[] {
  const rank = new Map(DIASPORA_LEADERS.map((c, i) => [c as string, i]));
  return [...langs].sort((a, b) => {
    const ra = rank.get(a.code) ?? DIASPORA_LEADERS.length;
    const rb = rank.get(b.code) ?? DIASPORA_LEADERS.length;
    return ra - rb;
  });
}
