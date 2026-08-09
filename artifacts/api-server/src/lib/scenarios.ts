// Zone capstone scenario definitions. Config-time content — adding a new zone's
// scenario is a content-only code change (no DB migration, no schema change).
// Scenarios are keyed by id and looked up by zone index at route time.
//
// Steering instructions are kept server-only (never sent to the client) so the
// learner cannot read ahead and the OpenAI prompt stays server-authoritative.

export interface Scenario {
  id: string;
  zoneIndex: number;
  categorySlug: string;
  title: string;
  /** One-sentence scene setter shown in the chat UI banner. */
  framingCopy: string;
  /**
   * Target phrases the learner should use naturally. The romanized form is
   * shown as chips in the UI; the native form is a rendering hint only.
   */
  targetPhrases: Array<{ romanized: string; native: string }>;
  /**
   * Role and steering instructions injected into the user message prompt.
   * Never sent to the client.
   */
  steerInstructions: string;
}

// Zone 1: Greetings and Manners -- at the platform chai stall in Ahmedabad.
// Phrases drawn from the Gujarati Greetings category seed data.
const ZONE_1_SCENARIO: Scenario = {
  id: "greetings-manners",
  zoneIndex: 0,
  categorySlug: "greetings",
  title: "At the platform chai stall",
  framingCopy:
    "You have just arrived at Ahmedabad Junction and stop for chai at the busy platform stall -- the friendly attendant greets you first.",
  targetPhrases: [
    { romanized: "namaste", native: "નમસ્તે" },
    { romanized: "kem cho?", native: "કેમ છો?" },
    { romanized: "majaa-maan", native: "મજામાં" },
    { romanized: "aabhaar", native: "આભાર" },
    { romanized: "jay shri krishna", native: "જય શ્રી કૃષ્ણ" },
    { romanized: "tamaro divas kevo rahyo?", native: "તમારો દિવસ કેવો રહ્યો?" },
  ],
  steerInstructions:
    "You are the warm, chatty chai-stall attendant at the platform. Greet the traveller in Gujarati and keep the conversation flowing naturally around their journey, the chai, and everyday pleasantries. " +
    "Whenever the learner uses one of the target phrases -- even roughly -- acknowledge it warmly and naturally (never grade or score them; just react as a real person would). " +
    "Steer the conversation so using the target phrases feels natural: ask how they are, thank them if they thank you, offer a friendly farewell phrase. " +
    "When the majority of the target phrases have been used across the conversation, wrap up warmly with a closing line like a real chai-stall farewell -- something that signals this little visit is complete. " +
    "Stay in character at all times; never mention scores, bands, or learning. This is a real conversation.",
};

// Map of all available scenarios, keyed by scenario id.
export const SCENARIOS: Record<string, Scenario> = {
  [ZONE_1_SCENARIO.id]: ZONE_1_SCENARIO,
};

/**
 * Look up the scenario for a given zone index (0-based).
 * Returns undefined when no scenario is defined for that zone yet.
 */
export function getScenarioByZoneIndex(zoneIndex: number): Scenario | undefined {
  return Object.values(SCENARIOS).find((s) => s.zoneIndex === zoneIndex);
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
  targetPhrases: Array<{ romanized: string; native: string }>;
}

export function toPublicScenario(s: Scenario): ScenarioPublic {
  return {
    id: s.id,
    zoneIndex: s.zoneIndex,
    title: s.title,
    framingCopy: s.framingCopy,
    targetPhrases: s.targetPhrases,
  };
}
