// Shared static mock data for the Spec D1b journey-map mockups.
// ~27 lesson nodes on a learner's path through Gujarat, grouped by region.

export type NodeStatus = "completed" | "current" | "locked";

export interface JourneyNode {
  id: number;
  title: string;
  topic: string;
  status: NodeStatus;
  region: string;
  /** 0-3 stars for completed nodes */
  stars?: number;
}

export interface JourneyRegion {
  name: string;
  gujarati: string;
  tagline: string;
  emoji: string;
}

export const REGIONS: JourneyRegion[] = [
  {
    name: "Ahmedabad",
    gujarati: "અમદાવાદ",
    tagline: "Old city lanes, street food & first words",
    emoji: "🕌",
  },
  {
    name: "Kutch",
    gujarati: "કચ્છ",
    tagline: "White desert, handicrafts & haggling",
    emoji: "🏜️",
  },
  {
    name: "Gir Forest",
    gujarati: "ગીર",
    tagline: "Lions, safaris & asking directions",
    emoji: "🦁",
  },
  {
    name: "Coastal Saurashtra",
    gujarati: "સૌરાષ્ટ્ર",
    tagline: "Temples, ports & long conversations",
    emoji: "🌊",
  },
];

export const JOURNEY_NODES: JourneyNode[] = [
  // ── Ahmedabad (1–7), all completed
  { id: 1, title: "Namaste!", topic: "Greetings", status: "completed", region: "Ahmedabad", stars: 3 },
  { id: 2, title: "Kem cho?", topic: "Small talk", status: "completed", region: "Ahmedabad", stars: 3 },
  { id: 3, title: "My name is…", topic: "Introductions", status: "completed", region: "Ahmedabad", stars: 2 },
  { id: 4, title: "One chai, please", topic: "Ordering food", status: "completed", region: "Ahmedabad", stars: 3 },
  { id: 5, title: "Counting to ten", topic: "Numbers", status: "completed", region: "Ahmedabad", stars: 2 },
  { id: 6, title: "How much is this?", topic: "Shopping", status: "completed", region: "Ahmedabad", stars: 3 },
  { id: 7, title: "Street food tour", topic: "Food & drink", status: "completed", region: "Ahmedabad", stars: 2 },
  // ── Kutch (8–14), completed up to 12, current at 13
  { id: 8, title: "Family words", topic: "Family", status: "completed", region: "Kutch", stars: 3 },
  { id: 9, title: "This & that", topic: "Demonstratives", status: "completed", region: "Kutch", stars: 2 },
  { id: 10, title: "Bargain at the bazaar", topic: "Shopping", status: "completed", region: "Kutch", stars: 1 },
  { id: 11, title: "Colours of the Rann", topic: "Colours", status: "completed", region: "Kutch", stars: 3 },
  { id: 12, title: "What time is it?", topic: "Time", status: "completed", region: "Kutch", stars: 2 },
  { id: 13, title: "Days of the week", topic: "Calendar", status: "current", region: "Kutch" },
  { id: 14, title: "Desert weather", topic: "Weather", status: "locked", region: "Kutch" },
  // ── Gir Forest (15–21), locked
  { id: 15, title: "Which way to Gir?", topic: "Directions", status: "locked", region: "Gir Forest" },
  { id: 16, title: "Animal names", topic: "Animals", status: "locked", region: "Gir Forest" },
  { id: 17, title: "On safari", topic: "Verbs of motion", status: "locked", region: "Gir Forest" },
  { id: 18, title: "I like / I don't like", topic: "Preferences", status: "locked", region: "Gir Forest" },
  { id: 19, title: "Describing things", topic: "Adjectives", status: "locked", region: "Gir Forest" },
  { id: 20, title: "Yesterday & tomorrow", topic: "Past & future", status: "locked", region: "Gir Forest" },
  { id: 21, title: "Campfire stories", topic: "Simple past", status: "locked", region: "Gir Forest" },
  // ── Coastal Saurashtra (22–27), locked
  { id: 22, title: "At the temple", topic: "Culture", status: "locked", region: "Coastal Saurashtra" },
  { id: 23, title: "By the sea", topic: "Nature", status: "locked", region: "Coastal Saurashtra" },
  { id: 24, title: "Making plans", topic: "Future tense", status: "locked", region: "Coastal Saurashtra" },
  { id: 25, title: "Feelings & moods", topic: "Emotions", status: "locked", region: "Coastal Saurashtra" },
  { id: 26, title: "Long conversations", topic: "Fluency", status: "locked", region: "Coastal Saurashtra" },
  { id: 27, title: "Farewell, Gujarat", topic: "Review", status: "locked", region: "Coastal Saurashtra" },
];

export const CURRENT_NODE = JOURNEY_NODES.find((n) => n.status === "current")!;

export function mascotUrl(name: string): string {
  return `${import.meta.env.BASE_URL}mascot/${name}.png`;
}
