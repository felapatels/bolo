// Zone capstone scenario definitions. Config-time content -- adding a zone's
// scenario is a content-only code change (no DB migration, no schema change).
// Scenarios are keyed by id and looked up by zone index at route time.
//
// Steering instructions are kept server-only (never sent to the client) so the
// learner cannot read ahead and the OpenAI prompt stays server-authoritative.
//
// LANGUAGE NEUTRAL BY CONSTRUCTION. The first version of this file carried the
// Gujarati target phrases inline, which meant a Hindi learner reaching zone 1
// was handed Gujarati chips and a prompt telling the model to speak Gujarati.
// A scene is now the language-independent part (where you are, who you are
// talking to, what a good conversation looks like) and the phrases are drawn
// from the SAME seeded content the learner practised in that zone, in their own
// language. Six scenes therefore cover all 22 languages rather than needing
// 132 hand-authored blocks, and a new language inherits every capstone the day
// its content lands.

import { eq, and, asc } from "drizzle-orm";
import { db, phrasesTable, categoriesTable } from "@workspace/db";

export interface Scenario {
  id: string;
  /** 0-based zone index; journey 1 is zones 0 through 5. */
  zoneIndex: number;
  /** The category whose phrases this scene draws its targets from. */
  categorySlug: string;
  title: string;
  /** One-sentence scene setter shown in the chat UI banner. */
  framingCopy: string;
  /**
   * How many target phrases to draw for this scene. Six is the tuned default:
   * enough that "the majority" is a real conversation rather than two lines,
   * few enough that the chip row does not wrap past two lines on a phone.
   */
  targetPhraseCount: number;
  /**
   * Role and steering instructions injected into the user message prompt.
   * Never sent to the client. `{{language}}` is replaced with the learner's
   * language name before the prompt is built.
   */
  steerInstructions: string;
}

/** A target phrase as the chat UI and the matcher see it. */
export type ScenarioTargetPhrase = { romanized: string; native: string };

/** A scene with its phrases and steering resolved for one specific language. */
export interface ResolvedScenario {
  id: string;
  zoneIndex: number;
  categorySlug: string;
  title: string;
  framingCopy: string;
  targetPhrases: ScenarioTargetPhrase[];
  steerInstructions: string;
}

/**
 * Shared tail of every scene's steering. Kept in one place so a change to how
 * the model treats target phrases, or to how a scene ends, cannot land on one
 * zone and miss the other five.
 */
const COMMON_STEER =
  "Speak to the learner in {{language}} and keep the conversation flowing naturally. " +
  // ASK, do not wait. The first version only said to make using the phrases
  // "feel natural", which left the learner to volunteer them unprompted: the
  // capstone then played exactly like ordinary free chat, which is what it was
  // reported as. A test asks questions. The scene still never says so.
  "ASK QUESTIONS. Lead each turn with a question whose most natural answer in {{language}} is one of the target phrases, one at a time, so the learner is answering you rather than having to think of something to say. " +
  // USE the words, do not merely fish for them. Only the LEARNER's turns are
  // matched against the target list (routes/openai.ts filters history to
  // role === "learner"), so Bolo saying a phrase never counts toward
  // completion. He can model every one of them in context for free, which is
  // how a learner finds out what a word sounds like inside a real sentence.
  "USE THE TARGET PHRASES YOURSELF, in your own sentences, the way a real person would -- not as vocabulary being presented, just as the words you naturally reach for. Hearing one used in context is what lets the learner use it back. " +
  "STAY ON THIS SCENE'S WORDS. Every turn should live inside the world the target phrases belong to. If the learner wanders onto something else, follow them for a single line out of politeness, then bring the conversation back to ground the target phrases cover. " +
  "Never list the target phrases as a list, never translate them into English, and never instruct the learner to say one: using a word in a sentence teaches it, while announcing it tests nothing. " +
  "If a turn goes by without the learner reaching a target phrase, come at the same one from a different angle rather than moving on. " +
  "Whenever the learner uses one of the target phrases -- even roughly -- acknowledge it warmly and naturally (never grade or score them; just react as a real person would). " +
  "When the majority of the target phrases have been used across the conversation, wrap up warmly with a closing line that signals this visit is complete. " +
  "Stay in character at all times; never mention scores, bands, or learning. This is a real conversation.";

// The six scenes of journey 1, one per fare zone, each seated in the railway
// world the map already tells: you arrive, you are received, you pay your way,
// you are fed, you find your feet, and you ride home. Category slugs match the
// seeded categories exactly; the phrases come from there.
const SCENES: Scenario[] = [
  {
    id: "greetings-manners",
    zoneIndex: 0,
    categorySlug: "greetings",
    title: "At the platform chai stall",
    framingCopy:
      "You have just arrived at the junction and stop for chai at the busy platform stall -- the friendly attendant greets you first.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are the warm, chatty chai-stall attendant on the platform. Greet the traveller, ask how they are, and talk easily about their journey, the chai, and everyday pleasantries. " +
      COMMON_STEER,
  },
  {
    id: "family-introductions",
    zoneIndex: 1,
    categorySlug: "family",
    title: "Meeting the family at the wedding",
    framingCopy:
      "You have been brought to a cousin's wedding and an aunt has decided you must be introduced to absolutely everyone.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are a delighted, slightly overwhelming aunt at a family wedding. Introduce relatives, ask the traveller who they came with and who is in their family, and fuss over them affectionately. " +
      COMMON_STEER,
  },
  {
    id: "ticket-counter",
    zoneIndex: 2,
    categorySlug: "numbers",
    title: "At the ticket counter",
    framingCopy:
      "The queue has finally moved and you are at the window. The clerk wants a number: how many tickets, which platform, what time.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are a brisk but kind ticket clerk behind the counter. Ask how many tickets, quote platform numbers and times, and hand back change -- keep numbers at the centre of every exchange. " +
      COMMON_STEER,
  },
  {
    id: "station-canteen",
    zoneIndex: 3,
    categorySlug: "food",
    title: "Ordering at the station canteen",
    framingCopy:
      "The canteen is loud and the thali is going fast. The cook wants your order, and an opinion on it afterwards.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are the busy, proud cook at a station canteen. Take the traveller's order, recommend what is fresh, ask whether they liked it, and press a second helping on them. " +
      COMMON_STEER,
  },
  {
    id: "bazaar-directions",
    zoneIndex: 4,
    categorySlug: "everyday",
    title: "Finding your way in the bazaar",
    framingCopy:
      "You have stepped out of the station into the bazaar and lost your bearings almost immediately. A shopkeeper waves you over.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are a helpful shopkeeper at the edge of the bazaar. Give directions, ask what the traveller is looking for, and fill the gaps with ordinary everyday talk about the town. " +
      COMMON_STEER,
  },
  {
    id: "long-ride-home",
    zoneIndex: 5,
    categorySlug: "feelings",
    title: "The long ride home",
    framingCopy:
      "The train has settled into its rhythm and the passenger across from you wants to know how the trip really went.",
    targetPhraseCount: 6,
    steerInstructions:
      "You are a companionable fellow passenger on a long night train. Ask how the traveller found the journey, share how you feel about yours, and let the conversation sit with tiredness, happiness, and homesickness. " +
      COMMON_STEER,
  },
];

/** Map of all available scenarios, keyed by scenario id. */
export const SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  SCENES.map((s) => [s.id, s]),
);

/**
 * Look up the scenario for a given zone index (0-based).
 * Returns undefined when no scenario is defined for that zone yet.
 */
export function getScenarioByZoneIndex(zoneIndex: number): Scenario | undefined {
  return SCENES.find((s) => s.zoneIndex === zoneIndex);
}

/**
 * The target phrases for one scene in one language, drawn from the seeded
 * content for that scene's category.
 *
 * Ordered by the category's own sort_order and capped at the scene's count, so
 * the chips are the phrases the learner met FIRST in that zone rather than an
 * arbitrary slice. Deterministic on purpose: the same learner returning to a
 * capstone sees the same chips, and the majority threshold cannot move under
 * them mid-conversation.
 *
 * Returns [] when a language has no content for that category. The caller
 * treats that as "no scene", which is the honest outcome: a capstone with no
 * phrases to aim at cannot be completed and must not be offered.
 */
export async function targetPhrasesForScenario(
  scenario: Scenario,
  languageCode: string,
): Promise<ScenarioTargetPhrase[]> {
  const rows = await db
    .select({
      romanized: phrasesTable.romanized,
      native: phrasesTable.nativeScript,
    })
    .from(phrasesTable)
    .innerJoin(categoriesTable, eq(phrasesTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(phrasesTable.languageCode, languageCode),
        eq(categoriesTable.slug, scenario.categorySlug),
        // The Plus-only sentence stage is a different exercise; capstone chips
        // are the phrases themselves.
        eq(phrasesTable.stage, "phrase"),
      ),
    )
    .orderBy(asc(phrasesTable.sortOrder), asc(phrasesTable.id))
    .limit(scenario.targetPhraseCount);

  return rows.filter((r) => r.romanized && r.native) as ScenarioTargetPhrase[];
}

/**
 * Resolves a scene for one language: real phrases, and steering that names the
 * language the model is meant to speak. Returns null when the language has no
 * content for the scene's category, so callers fail closed rather than opening
 * a capstone nobody can finish.
 */
export async function resolveScenario(
  scenario: Scenario,
  languageCode: string,
  languageName: string,
): Promise<ResolvedScenario | null> {
  const targetPhrases = await targetPhrasesForScenario(scenario, languageCode);
  if (targetPhrases.length === 0) return null;

  return {
    id: scenario.id,
    zoneIndex: scenario.zoneIndex,
    categorySlug: scenario.categorySlug,
    title: scenario.title,
    framingCopy: scenario.framingCopy,
    targetPhrases,
    steerInstructions: scenario.steerInstructions.replaceAll(
      "{{language}}",
      languageName,
    ),
  };
}

/**
 * The client-safe subset of a scenario (no steering instructions).
 * Returned by GET /scenarios/:id.
 */
export interface ScenarioPublic {
  id: string;
  zoneIndex: number;
  title: string;
  framingCopy: string;
  targetPhrases: ScenarioTargetPhrase[];
}

export function toPublicScenario(s: ResolvedScenario): ScenarioPublic {
  return {
    id: s.id,
    zoneIndex: s.zoneIndex,
    title: s.title,
    framingCopy: s.framingCopy,
    targetPhrases: s.targetPhrases,
  };
}
