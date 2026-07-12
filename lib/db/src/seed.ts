import {
  db,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
} from "./index";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// The 22 official (Eighth Schedule) Indian languages.
// fontFamily = the Google "Noto" family that covers this language's script.
// ---------------------------------------------------------------------------
type SeedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  fontFamily: string;
  rtl?: boolean;
};

const LANGUAGES: SeedLanguage[] = [
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

// ---------------------------------------------------------------------------
// Language-agnostic topics. `iconName` maps to a lucide icon in the UI.
// ---------------------------------------------------------------------------
type SeedCategory = {
  slug: string;
  title: string;
  description: string;
  iconName: string;
  accent: string;
};

const CATEGORIES: SeedCategory[] = [
  { slug: "greetings", title: "Greetings & Manners", description: "The friendly words you use every day.", iconName: "HandHeart", accent: "#F5871F" },
  { slug: "family", title: "Family", description: "Name everyone you love at home.", iconName: "Users", accent: "#E84E8A" },
  { slug: "numbers", title: "Numbers 1-10", description: "Count all the way to ten.", iconName: "Hash", accent: "#1FA6A0" },
  { slug: "food", title: "Food & Eating", description: "Words for the dinner table.", iconName: "Utensils", accent: "#7A5AF8" },
  { slug: "everyday", title: "Everyday Words", description: "Handy things you say all the time.", iconName: "Sun", accent: "#F5871F" },
  { slug: "feelings", title: "Feelings", description: "Say how you feel inside.", iconName: "Smile", accent: "#1FA6A0" },
];

// ---------------------------------------------------------------------------
// Curated Gujarati content, pre-seeded as cached lessons so the default
// language has instant, high-quality phrases without waiting for AI. Every
// other language generates its lessons on first open.
// ---------------------------------------------------------------------------
type SeedPhrase = { nativeScript: string; romanized: string; english: string; difficulty: number };

const GUJARATI_LESSONS: Record<string, { titleNative: string; phrases: SeedPhrase[] }> = {
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

async function seed() {
  // 1. Languages (idempotent upsert).
  let langSort = 0;
  for (const lang of LANGUAGES) {
    await db
      .insert(languagesTable)
      .values({
        code: lang.code,
        name: lang.name,
        nativeName: lang.nativeName,
        script: lang.script,
        fontFamily: lang.fontFamily,
        rtl: lang.rtl ?? false,
        sortOrder: langSort++,
      })
      .onConflictDoUpdate({
        target: languagesTable.code,
        set: {
          name: lang.name,
          nativeName: lang.nativeName,
          script: lang.script,
          fontFamily: lang.fontFamily,
          rtl: lang.rtl ?? false,
          sortOrder: langSort - 1,
        },
      });
  }
  console.log(`Seeded ${LANGUAGES.length} languages.`);

  // 2. Topics (idempotent upsert by slug).
  const catIdBySlug = new Map<string, number>();
  let catSort = 0;
  for (const cat of CATEGORIES) {
    const [row] = await db
      .insert(categoriesTable)
      .values({
        slug: cat.slug,
        title: cat.title,
        description: cat.description,
        iconName: cat.iconName,
        accent: cat.accent,
        sortOrder: catSort++,
      })
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          title: cat.title,
          description: cat.description,
          iconName: cat.iconName,
          accent: cat.accent,
          sortOrder: catSort - 1,
        },
      })
      .returning();
    catIdBySlug.set(cat.slug, row.id);
  }
  console.log(`Seeded ${CATEGORIES.length} topics.`);

  // 3. Pre-seed curated Gujarati lessons (skip any that already exist).
  for (const [slug, lesson] of Object.entries(GUJARATI_LESSONS)) {
    const categoryId = catIdBySlug.get(slug);
    if (categoryId == null) continue;

    const existing = await db
      .select({ id: lessonsTable.id })
      .from(lessonsTable)
      .where(
        and(
          eq(lessonsTable.languageCode, "gu"),
          eq(lessonsTable.categoryId, categoryId),
        ),
      );
    if (existing.length > 0) continue;

    const [insertedLesson] = await db
      .insert(lessonsTable)
      .values({ languageCode: "gu", categoryId, titleNative: lesson.titleNative })
      .returning();

    let phraseSort = 0;
    await db.insert(phrasesTable).values(
      lesson.phrases.map((p) => ({
        lessonId: insertedLesson.id,
        languageCode: "gu",
        categoryId,
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
        difficulty: p.difficulty,
        sortOrder: phraseSort++,
      })),
    );
    console.log(`Seeded Gujarati "${slug}" with ${lesson.phrases.length} phrases.`);
  }

  console.log("Seeding complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
