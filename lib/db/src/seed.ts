import { db, categoriesTable, phrasesTable, profilesTable } from "./index";

const PROFILES: { name: string; color: string; avatar: string }[] = [
  { name: "Liam", color: "#F5871F", avatar: "L" },
  { name: "Rylan", color: "#2A9D8F", avatar: "R" },
  { name: "Anya", color: "#E63946", avatar: "A" },
  { name: "Reina", color: "#9B5DE5", avatar: "R" },
  { name: "Jai", color: "#3A86FF", avatar: "J" },
  { name: "Gia", color: "#F15BB5", avatar: "G" },
];

async function seedProfiles() {
  const existing = await db.select({ id: profilesTable.id }).from(profilesTable);
  if (existing.length > 0) {
    console.log(`Profile seed skipped: ${existing.length} profiles already exist.`);
    return;
  }
  await db.insert(profilesTable).values(
    PROFILES.map((p) => ({
      name: p.name,
      color: p.color,
      avatar: p.avatar,
      pinHash: null,
    })),
  );
  console.log(`Seeded ${PROFILES.length} kid profiles.`);
}

type SeedPhrase = {
  gujaratiScript: string;
  romanized: string;
  english: string;
  hint?: string;
  difficulty: number;
};

type SeedCategory = {
  slug: string;
  title: string;
  titleGujarati: string;
  description: string;
  iconName: string;
  accent: string;
  phrases: SeedPhrase[];
};

const CATEGORIES: SeedCategory[] = [
  {
    slug: "greetings",
    title: "Greetings & Manners",
    titleGujarati: "અભિવાદન",
    description: "The friendly words you use every day.",
    iconName: "HandHeart",
    accent: "#F5871F",
    phrases: [
      { gujaratiScript: "કેમ છો?", romanized: "kem chho?", english: "How are you?", difficulty: 1 },
      { gujaratiScript: "નમસ્તે", romanized: "namaste", english: "Hello", difficulty: 1 },
      { gujaratiScript: "મજામાં", romanized: "majaa-maan", english: "I'm doing well", difficulty: 1 },
      { gujaratiScript: "આભાર", romanized: "aabhaar", english: "Thank you", difficulty: 1 },
      { gujaratiScript: "હા", romanized: "ha", english: "Yes", difficulty: 1 },
      { gujaratiScript: "ના", romanized: "na", english: "No", difficulty: 1 },
      { gujaratiScript: "માફ કરજો", romanized: "maaf karjo", english: "Sorry / Excuse me", difficulty: 2 },
      { gujaratiScript: "આવજો", romanized: "aavjo", english: "Goodbye", difficulty: 1 },
    ],
  },
  {
    slug: "family",
    title: "Family",
    titleGujarati: "કુટુંબ",
    description: "Name everyone you love at home.",
    iconName: "Users",
    accent: "#E84E8A",
    phrases: [
      { gujaratiScript: "મમ્મી", romanized: "mummy", english: "Mom", difficulty: 1 },
      { gujaratiScript: "પપ્પા", romanized: "pappa", english: "Dad", difficulty: 1 },
      { gujaratiScript: "ભાઈ", romanized: "bhai", english: "Brother", difficulty: 1 },
      { gujaratiScript: "બહેન", romanized: "bahen", english: "Sister", difficulty: 1 },
      { gujaratiScript: "દાદા", romanized: "dada", english: "Grandpa (dad's side)", difficulty: 2 },
      { gujaratiScript: "દાદી", romanized: "dadi", english: "Grandma (dad's side)", difficulty: 2 },
      { gujaratiScript: "નાના", romanized: "nana", english: "Grandpa (mom's side)", difficulty: 2 },
      { gujaratiScript: "નાની", romanized: "nani", english: "Grandma (mom's side)", difficulty: 2 },
    ],
  },
  {
    slug: "numbers",
    title: "Numbers 1-10",
    titleGujarati: "સંખ્યા",
    description: "Count all the way to ten.",
    iconName: "Hash",
    accent: "#1FA6A0",
    phrases: [
      { gujaratiScript: "એક", romanized: "ek", english: "One", difficulty: 1 },
      { gujaratiScript: "બે", romanized: "be", english: "Two", difficulty: 1 },
      { gujaratiScript: "ત્રણ", romanized: "tran", english: "Three", difficulty: 1 },
      { gujaratiScript: "ચાર", romanized: "chaar", english: "Four", difficulty: 1 },
      { gujaratiScript: "પાંચ", romanized: "paanch", english: "Five", difficulty: 1 },
      { gujaratiScript: "છ", romanized: "chha", english: "Six", difficulty: 1 },
      { gujaratiScript: "સાત", romanized: "saat", english: "Seven", difficulty: 1 },
      { gujaratiScript: "આઠ", romanized: "aath", english: "Eight", difficulty: 1 },
      { gujaratiScript: "નવ", romanized: "nav", english: "Nine", difficulty: 1 },
      { gujaratiScript: "દસ", romanized: "das", english: "Ten", difficulty: 1 },
    ],
  },
  {
    slug: "food",
    title: "Food & Eating",
    titleGujarati: "ખોરાક",
    description: "Words for the dinner table.",
    iconName: "Utensils",
    accent: "#7A5AF8",
    phrases: [
      { gujaratiScript: "પાણી", romanized: "paani", english: "Water", difficulty: 1 },
      { gujaratiScript: "દૂધ", romanized: "doodh", english: "Milk", difficulty: 1 },
      { gujaratiScript: "રોટલી", romanized: "rotli", english: "Flatbread (roti)", difficulty: 2 },
      { gujaratiScript: "ભાત", romanized: "bhaat", english: "Rice", difficulty: 1 },
      { gujaratiScript: "દાળ", romanized: "daal", english: "Lentils (dal)", difficulty: 1 },
      { gujaratiScript: "શાક", romanized: "shaak", english: "Vegetable dish", difficulty: 2 },
      { gujaratiScript: "ખાવાનું", romanized: "khaavaanu", english: "Food", difficulty: 2 },
      { gujaratiScript: "મને ભૂખ લાગી છે", romanized: "mane bhookh laagi chhe", english: "I am hungry", difficulty: 3 },
    ],
  },
  {
    slug: "everyday",
    title: "Everyday Words",
    titleGujarati: "રોજિંદા શબ્દો",
    description: "Handy things you say all the time.",
    iconName: "Sun",
    accent: "#F5871F",
    phrases: [
      { gujaratiScript: "ઘર", romanized: "ghar", english: "Home", difficulty: 1 },
      { gujaratiScript: "ચાલો", romanized: "chaalo", english: "Let's go", difficulty: 1 },
      { gujaratiScript: "બેસો", romanized: "beso", english: "Sit down", difficulty: 1 },
      { gujaratiScript: "જુઓ", romanized: "juo", english: "Look", difficulty: 1 },
      { gujaratiScript: "સાંભળો", romanized: "saambhlo", english: "Listen", difficulty: 2 },
      { gujaratiScript: "અહીં આવો", romanized: "ahin aavo", english: "Come here", difficulty: 2 },
      { gujaratiScript: "સરસ", romanized: "saras", english: "Nice / Great", difficulty: 1 },
      { gujaratiScript: "પાણી પીવું છે", romanized: "paani peevu chhe", english: "I want to drink water", difficulty: 3 },
    ],
  },
  {
    slug: "feelings",
    title: "Feelings",
    titleGujarati: "લાગણી",
    description: "Say how you feel inside.",
    iconName: "Smile",
    accent: "#1FA6A0",
    phrases: [
      { gujaratiScript: "ખુશ", romanized: "khush", english: "Happy", difficulty: 1 },
      { gujaratiScript: "ઉદાસ", romanized: "udaas", english: "Sad", difficulty: 1 },
      { gujaratiScript: "મને ગમે છે", romanized: "mane game chhe", english: "I like it", difficulty: 2 },
      { gujaratiScript: "મને પ્રેમ છે", romanized: "mane prem chhe", english: "I love you", difficulty: 2 },
      { gujaratiScript: "થાકી ગયો", romanized: "thaaki gayo", english: "I'm tired", difficulty: 2 },
      { gujaratiScript: "ડર લાગે છે", romanized: "dar laage chhe", english: "I'm scared", difficulty: 3 },
      { gujaratiScript: "મજા આવી", romanized: "majaa aavi", english: "That was fun", difficulty: 2 },
    ],
  },
];

async function seed() {
  await seedProfiles();

  const existing = await db.select({ id: categoriesTable.id }).from(categoriesTable);
  if (existing.length > 0) {
    console.log(
      `Seed skipped: ${existing.length} categories already exist.`,
    );
    return;
  }

  let categorySort = 0;
  for (const cat of CATEGORIES) {
    const [insertedCat] = await db
      .insert(categoriesTable)
      .values({
        slug: cat.slug,
        title: cat.title,
        titleGujarati: cat.titleGujarati,
        description: cat.description,
        iconName: cat.iconName,
        accent: cat.accent,
        sortOrder: categorySort++,
      })
      .returning();

    let phraseSort = 0;
    await db.insert(phrasesTable).values(
      cat.phrases.map((p) => ({
        categoryId: insertedCat.id,
        gujaratiScript: p.gujaratiScript,
        romanized: p.romanized,
        english: p.english,
        hint: p.hint ?? null,
        difficulty: p.difficulty,
        sortOrder: phraseSort++,
      })),
    );

    console.log(`Seeded "${cat.title}" with ${cat.phrases.length} phrases.`);
  }

  console.log("Seeding complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
