// Spec D1b: the 22 themed rail lines of the journey map — structured content,
// never hardcoded in components (acceptance 9). Each language renders as one
// line; the six zones map positionally onto the six categories in DB
// sort_order. The id joins in JOURNEY_ZONES are authoritative; its title
// strings are a loading-state fallback only — live zone titles come from the
// categories listing the journey clients already fetch (Task #906), so a
// server-side rename needs no client release. Zone geographic names are
// category-independent:
// Z1-Z6 columns of the approved naming table apply in category order, the
// zone's name appears on its sign/postcard, and inner stations are numbered
// ("Stop N of M" — decision 4). Labels are English-only for v1 (decision 6);
// the single Gujarati accent string "બોલો રેલ" lives on the boarding-pass
// header, nowhere else.

/** The authoritative zone <-> category mapping (DB ids and titles, in order). */
export const JOURNEY_ZONES = [
  { id: 1, title: "Greetings & Manners" },
  { id: 2, title: "Family" },
  { id: 3, title: "Numbers 1-10" },
  { id: 4, title: "Food & Eating" },
  { id: 5, title: "Everyday Words" },
  { id: 6, title: "Feelings" }, // the festival-city finale
] as const;

/**
 * Journey 2: the onward leg, six more fare zones past journey 1's terminus.
 *
 * The curriculum steps out of the house and into the world. Journey 1 is who
 * you are and what you feel; journey 2 is moving through a place and dealing
 * with the people in it, finishing on festivals the same way journey 1
 * finishes on a festival city.
 *
 * Category ids continue from journey 1 (7-12) and MUST match the seeded rows.
 * Nothing here is live until those categories carry phrases: see
 * journeyIsReady() below, which is what gates the map.
 */
export const JOURNEY_2_ZONES = [
  { id: 7, title: "Travel & Directions" },
  { id: 8, title: "Shopping & Money" },
  { id: 9, title: "Time & Days" },
  { id: 10, title: "Work & Study" },
  { id: 11, title: "Health & Body" },
  { id: 12, title: "Celebrations & Festivals" }, // the festival finale, again
] as const;

/** Every journey, in order. Index + 1 is the journey number. */
export const JOURNEYS = [JOURNEY_ZONES, JOURNEY_2_ZONES] as const;

/** Zones for a journey number (1-based). Falls back to journey 1. */
export function zonesForJourney(journey: number): readonly { id: number; title: string }[] {
  return JOURNEYS[journey - 1] ?? JOURNEY_ZONES;
}

export interface JourneyLine {
  /** Themed line name, e.g. "Gujarat Express". */
  lineName: string;
  /** Per-line rail accent color (postcards, markers, rail segments). */
  accent: string;
  /** Z1..Z6 geographic names, positionally matching JOURNEY_ZONES. */
  zones: readonly [string, string, string, string, string, string];
  /**
   * Journey 2's six stations, continuing ONWARD from where `zones` ends: the
   * same railway, further along, rather than a second unrelated line. Chosen
   * to stay in the region the line already travels.
   *
   * Geography rather than language content, which is why it could be authored
   * here at all — but a local eye should still check them before they ship.
   */
  zones2: readonly [string, string, string, string, string, string];
}

/**
 * Whether a journey has enough content to be offered at all.
 *
 * THE GATE THAT MATTERS. Journey 2's structure, geography and category ids
 * land before its phrases do, and an empty journey is worse than no journey: a
 * learner rides to a zone, opens a stop, and finds nothing. So the map asks
 * this first, and journey 2 stays invisible until every one of its six
 * categories actually carries phrases in the language being learned.
 *
 * Deliberately ALL six rather than "some": a journey that runs out at zone 4 is
 * the same broken promise, just later.
 *
 * `categories` is the listing both clients already fetch, so this costs no
 * extra request.
 */
export function journeyIsReady(
  journey: number,
  categories: readonly { id: number; phraseCount?: number }[] | undefined,
): boolean {
  if (journey === 1) return true; // journey 1 is the shipped content
  if (!categories || categories.length === 0) return false;
  const byId = new Map(categories.map((c) => [c.id, c.phraseCount ?? 0]));
  return zonesForJourney(journey).every((z) => (byId.get(z.id) ?? 0) > 0);
}

/** Journeys a learner can actually be offered, in order. */
export function availableJourneys(
  categories: readonly { id: number; phraseCount?: number }[] | undefined,
): number[] {
  return JOURNEYS.map((_, i) => i + 1).filter((j) => journeyIsReady(j, categories));
}

/** A line's station names for a journey number (1-based). */
export function stationsForJourney(
  line: JourneyLine,
  journey: number,
): readonly [string, string, string, string, string, string] {
  return journey === 2 ? line.zones2 : line.zones;
}

/** All 22 lines from the approved naming table, keyed by DB language code. */
export const JOURNEY_LINES: Record<string, JourneyLine> = {
  gu: {
    lineName: "Gujarat Express",
    accent: "#ea580c",
    zones: ["Ahmedabad Junction", "Anand", "Vadodara", "Surat", "Rajkot", "Dwarka"],
    zones2: ["Porbandar", "Somnath", "Junagadh", "Bhavnagar", "Palitana", "Gir"],
  },
  bn: {
    lineName: "Howrah Line",
    accent: "#16a34a",
    zones: ["Howrah Junction", "Chandannagar", "Bolpur Shantiniketan", "Murshidabad", "Malda Town", "Kalighat"],
    zones2: ["Sealdah", "Barrackpore", "Krishnanagar", "Bishnupur", "Digha", "Sundarbans"],
  },
  mr: {
    lineName: "Deccan Queen",
    accent: "#7c3aed",
    zones: ["CST Mumbai", "Karjat", "Lonavala", "Shivajinagar", "Pune Junction", "Lalbaug"],
    zones2: ["Panvel", "Alibaug", "Mahabaleshwar", "Kolhapur", "Nashik", "Ajanta"],
  },
  ta: {
    lineName: "Nilgiri Mountain Railway",
    accent: "#0284c7",
    zones: ["Chennai Egmore", "Mettupalayam", "Coonoor", "Wellington", "Lovedale", "Ooty"],
    zones2: ["Coimbatore", "Madurai", "Rameswaram", "Thanjavur", "Chidambaram", "Kanyakumari"],
  },
  kok: {
    lineName: "Konkan Railway",
    accent: "#0d9488",
    zones: ["Madgaon Junction", "Karmali", "Thivim", "Sawantwadi", "Ratnagiri", "Panjim Carnival"],
    zones2: ["Vasco da Gama", "Canacona", "Karwar", "Gokarna", "Udupi", "Mangaluru"],
  },
  ne: {
    lineName: "Darjeeling Himalayan Railway",
    accent: "#4f46e5",
    zones: ["New Jalpaiguri", "Siliguri", "Kurseong", "Sonada", "Ghum", "Darjeeling"],
    zones2: ["Kalimpong", "Gangtok", "Pelling", "Namchi", "Rangpo", "Lachung"],
  },
  ks: {
    lineName: "Banihal Valley Line",
    accent: "#b45309",
    zones: ["Banihal", "Anantnag", "Awantipora", "Srinagar", "Sopore", "Baramulla"],
    zones2: ["Gulmarg", "Pahalgam", "Sonamarg", "Kupwara", "Kargil", "Leh"],
  },
  pa: {
    lineName: "Golden Temple Mail",
    accent: "#d97706",
    zones: ["Ludhiana", "Phagwara", "Jalandhar City", "Beas", "Amritsar Junction", "Anandpur Sahib"],
    zones2: ["Patiala", "Bathinda", "Kapurthala", "Firozpur", "Faridkot", "Wagah"],
  },
  ml: {
    lineName: "Kerala Coast Line",
    accent: "#059669",
    zones: ["Thiruvananthapuram Central", "Kollam", "Alappuzha", "Ernakulam Junction", "Kozhikode", "Thrissur"],
    zones2: ["Palakkad", "Guruvayur", "Kannur", "Kasaragod", "Munnar", "Varkala"],
  },
  te: {
    lineName: "Godavari Express",
    accent: "#dc2626",
    zones: ["Secunderabad", "Warangal", "Vijayawada", "Rajahmundry", "Samalkot", "Visakhapatnam"],
    zones2: ["Guntur", "Tirupati", "Nellore", "Kurnool", "Bhadrachalam", "Araku"],
  },
  kn: {
    lineName: "Mysuru Line",
    accent: "#9333ea",
    zones: ["Bengaluru City", "Kengeri", "Ramanagara", "Mandya", "Srirangapatna", "Mysuru Palace"],
    zones2: ["Hassan", "Chikkamagaluru", "Belur", "Badami", "Hampi", "Gokarna"],
  },
  or: {
    lineName: "Puri Line",
    accent: "#0ea5e9",
    zones: ["Cuttack", "Bhubaneswar", "Khurda Road", "Pipili", "Sakhigopal", "Puri"],
    zones2: ["Konark", "Chilika", "Sambalpur", "Koraput", "Rourkela", "Gopalpur"],
  },
  as: {
    lineName: "Kamrupa Express",
    accent: "#f43f5e",
    zones: ["Guwahati Junction", "Tezpur", "Kaziranga", "Jorhat", "Majuli", "Dibrugarh"],
    zones2: ["Tinsukia", "Sivasagar", "Digboi", "Margherita", "Hailakandi", "Silchar"],
  },
  hi: {
    lineName: "Ganga Line",
    accent: "#65a30d",
    zones: ["New Delhi", "Aligarh", "Kanpur Central", "Prayagraj", "Mirzapur", "Varanasi"],
    zones2: ["Sarnath", "Ayodhya", "Lucknow", "Mathura", "Agra", "Gorakhpur"],
  },
  ur: {
    lineName: "Awadh Line",
    accent: "#047857",
    zones: ["Lucknow Charbagh", "Malihabad", "Kakori", "Barabanki", "Faizabad", "Rampur"],
    zones2: ["Bareilly", "Moradabad", "Amroha", "Sambhal", "Deva Sharif", "Bahraich"],
  },
  mai: {
    lineName: "Mithila Line",
    accent: "#c026d3",
    zones: ["Samastipur", "Darbhanga", "Madhubani", "Sitamarhi", "Jaynagar", "Janakpur"],
    zones2: ["Muzaffarpur", "Rajnagar", "Benipatti", "Pupri", "Laukaha", "Nirmali"],
  },
  doi: {
    lineName: "Jammu Tawi Line",
    accent: "#2563eb",
    zones: ["Pathankot", "Kathua", "Samba", "Jammu Tawi", "Udhampur", "Katra"],
    zones2: ["Patnitop", "Reasi", "Bhaderwah", "Kishtwar", "Akhnoor", "Basohli"],
  },
  mni: {
    lineName: "Imphal Valley Line",
    accent: "#db2777",
    zones: ["Jiribam", "Noney", "Khongsang", "Bishnupur", "Moirang", "Imphal"],
    zones2: ["Loktak", "Ukhrul", "Churachandpur", "Kangla", "Senapati", "Thoubal"],
  },
  brx: {
    lineName: "Bodoland Line",
    accent: "#15803d",
    zones: ["Fakiragram Junction", "Gossaigaon", "Kokrajhar", "Bongaigaon", "Udalguri", "Tamulpur"],
    zones2: ["Chirang", "Baksa", "Manas", "Bhairabkunda", "Salakati", "Basugaon"],
  },
  sat: {
    lineName: "Santhal Parganas Line",
    accent: "#a16207",
    zones: ["Jasidih Junction", "Deoghar", "Dumka", "Godda", "Pakur", "Sahibganj"],
    zones2: ["Rajmahal", "Massanjore", "Barhait", "Jamtara", "Madhupur", "Shikaripara"],
  },
  sa: {
    lineName: "Heritage Line",
    accent: "#b91c1c",
    zones: ["Rishikesh", "Haridwar", "Ayodhya", "Ujjain", "Nashik", "Kashi"],
    zones2: ["Nalanda", "Kanchipuram", "Pushkar", "Badrinath", "Rameswaram", "Kurukshetra"],
  },
  sd: {
    lineName: "Kutch Line",
    accent: "#0891b2",
    zones: ["Gandhidham", "Adipur", "Anjar", "Bhachau", "Bhuj", "Lakhpat"],
    zones2: ["Mandvi", "Dholavira", "Narayan Sarovar", "Mundra", "Nakhatrana", "Khavda"],
  },
};

/**
 * The line for a language code. Every shipped language has an entry; a code
 * outside the table (future language before its naming lands) degrades to a
 * generic line rather than crashing the map.
 */
export function getJourneyLine(code: string): JourneyLine {
  return (
    JOURNEY_LINES[code] ?? {
      lineName: "Bolo Line",
      accent: "#4F46E5",
      zones: ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5", "Zone 6"],
    }
  );
}
