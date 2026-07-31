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

export interface JourneyLine {
  /** Themed line name, e.g. "Gujarat Express". */
  lineName: string;
  /** Per-line rail accent color (postcards, markers, rail segments). */
  accent: string;
  /** Z1..Z6 geographic names, positionally matching JOURNEY_ZONES. */
  zones: readonly [string, string, string, string, string, string];
}

/** All 22 lines from the approved naming table, keyed by DB language code. */
export const JOURNEY_LINES: Record<string, JourneyLine> = {
  gu: {
    lineName: "Gujarat Express",
    accent: "#ea580c",
    zones: ["Ahmedabad Junction", "Anand", "Vadodara", "Surat", "Rajkot", "Dwarka"],
  },
  bn: {
    lineName: "Howrah Line",
    accent: "#16a34a",
    zones: ["Howrah Junction", "Chandannagar", "Bolpur Shantiniketan", "Murshidabad", "Malda Town", "Kalighat"],
  },
  mr: {
    lineName: "Deccan Queen",
    accent: "#7c3aed",
    zones: ["CST Mumbai", "Karjat", "Lonavala", "Shivajinagar", "Pune Junction", "Lalbaug"],
  },
  ta: {
    lineName: "Nilgiri Mountain Railway",
    accent: "#0284c7",
    zones: ["Chennai Egmore", "Mettupalayam", "Coonoor", "Wellington", "Lovedale", "Ooty"],
  },
  kok: {
    lineName: "Konkan Railway",
    accent: "#0d9488",
    zones: ["Madgaon Junction", "Karmali", "Thivim", "Sawantwadi", "Ratnagiri", "Panjim Carnival"],
  },
  ne: {
    lineName: "Darjeeling Himalayan Railway",
    accent: "#4f46e5",
    zones: ["New Jalpaiguri", "Siliguri", "Kurseong", "Sonada", "Ghum", "Darjeeling"],
  },
  ks: {
    lineName: "Banihal Valley Line",
    accent: "#b45309",
    zones: ["Banihal", "Anantnag", "Awantipora", "Srinagar", "Sopore", "Baramulla"],
  },
  pa: {
    lineName: "Golden Temple Mail",
    accent: "#d97706",
    zones: ["Ludhiana", "Phagwara", "Jalandhar City", "Beas", "Amritsar Junction", "Anandpur Sahib"],
  },
  ml: {
    lineName: "Kerala Coast Line",
    accent: "#059669",
    zones: ["Thiruvananthapuram Central", "Kollam", "Alappuzha", "Ernakulam Junction", "Kozhikode", "Thrissur"],
  },
  te: {
    lineName: "Godavari Express",
    accent: "#dc2626",
    zones: ["Secunderabad", "Warangal", "Vijayawada", "Rajahmundry", "Samalkot", "Visakhapatnam"],
  },
  kn: {
    lineName: "Mysuru Line",
    accent: "#9333ea",
    zones: ["Bengaluru City", "Kengeri", "Ramanagara", "Mandya", "Srirangapatna", "Mysuru Palace"],
  },
  or: {
    lineName: "Puri Line",
    accent: "#0ea5e9",
    zones: ["Cuttack", "Bhubaneswar", "Khurda Road", "Pipili", "Sakhigopal", "Puri"],
  },
  as: {
    lineName: "Kamrupa Express",
    accent: "#65a30d",
    zones: ["Guwahati Junction", "Tezpur", "Kaziranga", "Jorhat", "Majuli", "Dibrugarh"],
  },
  hi: {
    lineName: "Ganga Line",
    accent: "#e11d48",
    zones: ["New Delhi", "Aligarh", "Kanpur Central", "Prayagraj", "Mirzapur", "Varanasi"],
  },
  ur: {
    lineName: "Awadh Line",
    accent: "#047857",
    zones: ["Lucknow Charbagh", "Malihabad", "Kakori", "Barabanki", "Faizabad", "Rampur"],
  },
  mai: {
    lineName: "Mithila Line",
    accent: "#c026d3",
    zones: ["Samastipur", "Darbhanga", "Madhubani", "Sitamarhi", "Jaynagar", "Janakpur"],
  },
  doi: {
    lineName: "Jammu Tawi Line",
    accent: "#2563eb",
    zones: ["Pathankot", "Kathua", "Samba", "Jammu Tawi", "Udhampur", "Katra"],
  },
  mni: {
    lineName: "Imphal Valley Line",
    accent: "#db2777",
    zones: ["Jiribam", "Noney", "Khongsang", "Bishnupur", "Moirang", "Imphal"],
  },
  brx: {
    lineName: "Bodoland Line",
    accent: "#15803d",
    zones: ["Fakiragram Junction", "Gossaigaon", "Kokrajhar", "Bongaigaon", "Udalguri", "Tamulpur"],
  },
  sat: {
    lineName: "Santhal Parganas Line",
    accent: "#a16207",
    zones: ["Jasidih Junction", "Deoghar", "Dumka", "Godda", "Pakur", "Sahibganj"],
  },
  sa: {
    lineName: "Heritage Line",
    accent: "#b91c1c",
    zones: ["Rishikesh", "Haridwar", "Ayodhya", "Ujjain", "Nashik", "Kashi"],
  },
  sd: {
    lineName: "Kutch Line",
    accent: "#0891b2",
    zones: ["Gandhidham", "Adipur", "Anjar", "Bhachau", "Bhuj", "Lakhpat"],
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
