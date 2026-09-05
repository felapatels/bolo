// Chunk 6B: the quick-game roster and trackside-signal memory.
//
// EVERY QUICK GAME RECORDS UNDER ITS OWN ID since 2026-09-04. The generated
// enum used to be closed at four (speed-round, phrase-builder, word-match,
// listen-and-pick) and every quick game POSTed under one of them, which made a
// Ticket Check row indistinguishable from a Listen & Pick one: per-game
// reporting was wrong for five games, and the free taste's count could not be
// derived at all. The enum was widened and `serverGame` is now the game's own
// id. THE CORRECTNESS MODEL IS UNCHANGED, and it is still the server's:
//   Model A (selection): correct when selectedPhraseId === phraseId.
//   Model B (assembly):  correct when submittedText matches nativeScript.
// Every game here is Model A, which is what both ids it used to ride already
// were, and the server derives that from its own list rather than naming ids
// by hand. Scoped phrase
// sets stay inside the session's category so existing validation passes
// unchanged (a Wrong Platform stray from another category is never submitted;
// each round is represented by an in-category anchor phrase instead).

export type QuickGameId =
  | "ticket-check"
  | "wrong-platform"
  | "wrong-platform-2"
  | "luggage-match"
  | "express-listening"
  | "signal-lights";

export type QuickGameDef = {
  id: QuickGameId;
  title: string;
  path: string;
  /** Minimum plan-visible phrases the category needs for this game. */
  floor: number;
  /** The id this game records under. Its own since 2026-09-04. */
  serverGame: QuickGameId;
  /**
   * Journeys this game appears in. Absent means every journey.
   *
   * Journey 2 opens the roster to games that would not have suited journey 1:
   * its topics are travel, money, time, work, health and festivals, where a
   * learner is dealing with the world rather than naming it.
   */
  journeys?: readonly number[];
  /**
   * All-Access only. Kept OUT of the trackside signal rotation: a signal is a
   * free-visible encounter offered mid-journey, and offering a locked game
   * there would be an upsell wearing a game's clothes. The hub still shows it,
   * with its own lock.
   */
  plusOnly?: boolean;
};

/** Roster order is the deterministic signal rotation order. */
export const QUICK_GAMES: readonly QuickGameDef[] = [
  {
    id: "ticket-check",
    title: "Ticket Check",
    path: "/games/ticket-check",
    floor: 4,
    serverGame: "ticket-check",
  },
  {
    id: "wrong-platform",
    title: "Wrong Platform",
    path: "/games/wrong-platform",
    floor: 3,
    serverGame: "wrong-platform",
  },
  {
    // PART 2, All-Access. A separate roster entry rather than a mode flag on
    // the first, because the hub shows one tile per entry and the split was
    // asked for as two tiles: "add a free version and a Part 2 for
    // All-Access. Show 2 different tiles on the games page."
    //
    // FLOOR 5, not 3: a round deals five in-topic cards plus the stray, and a
    // topic that cannot fill the board would repeat a phrase inside one round,
    // which turns the odd-one-out into a guess between two identical cards.
    id: "wrong-platform-2",
    title: "Wrong Platform 2",
    path: "/games/wrong-platform-2",
    floor: 5,
    serverGame: "wrong-platform-2",
    plusOnly: true,
  },
  {
    id: "luggage-match",
    title: "Luggage Match",
    path: "/games/luggage-match",
    floor: 4,
    serverGame: "luggage-match",
  },
  {
    id: "express-listening",
    title: "Express Listening",
    path: "/games/express-listening",
    floor: 4,
    serverGame: "express-listening",
  },
  {
    id: "signal-lights",
    title: "Signal Lights",
    path: "/games/signal-lights",
    floor: 2,
    serverGame: "signal-lights",
  },
] as const;

/** The lowest floor across the roster. A category under this supports no
 *  quick game at all, which is the auto-wave condition at a signal. */
export const QUICK_GAME_MIN_FLOOR = Math.min(...QUICK_GAMES.map((g) => g.floor));

export function quickGameById(id: string): QuickGameDef | undefined {
  return QUICK_GAMES.find((g) => g.id === id);
}

/**
 * Games playable with `visibleCount` plan-visible phrases, roster order.
 *
 * `journey` defaults to 1 so every existing caller keeps the exact roster it
 * had: a game with no `journeys` list appears everywhere, and nothing in the
 * shipped roster declares one.
 */
export function eligibleQuickGames(
  visibleCount: number,
  journey = 1,
): QuickGameDef[] {
  return QUICK_GAMES.filter(
    (g) =>
      !g.plusOnly &&
      g.floor <= visibleCount &&
      (!g.journeys || g.journeys.includes(journey)),
  );
}

// ---------------------------------------------------------------------------
// WHY SCRIPT TRACE IS NOT IN THIS ROSTER YET.
//
// It was asked for as a journey 2 mini game and it cannot join on the current
// contract. Every entry here rides a frozen server game id, and the server's
// enum is [speed-round, phrase-builder, word-match, listen-and-pick]; a session
// carries phraseResults which the server validates against real phrase ids.
//
// Script Trace has no phrases. It has glyphs, and its result is a stroke score
// with named faults. Filing a trace run as "listen-and-pick" with invented
// phraseResults would be lying to a server that checks, and the token and XP
// economy hangs off game sessions.
//
// Joining needs a server-side game type: a new enum value and a results shape
// carrying glyph id, score and faults. That is an API change to a graded path,
// and it should be a deliberate one rather than a ride-along. The journey
// scoping above is the half that was safe to build now.
// ---------------------------------------------------------------------------

/**
 * Deterministic rotation: the game offered at a signal is picked by the
 * signal's ordinal index over the caller's plan-visible game roster (the
 * quick games whose floor the category's visible set meets). Returns null
 * when no game fits, which is the auto-wave case.
 */
export function gameForSignal(
  signalIndex: number,
  visibleCount: number,
  journey = 1,
): QuickGameDef | null {
  const eligible = eligibleQuickGames(visibleCount, journey);
  if (eligible.length === 0) return null;
  return eligible[signalIndex % eligible.length]!;
}

// ---------------------------------------------------------------------------
// Signal memory.
// Wave-through is SESSION-remembered (sessionStorage): waving is never shamed
// and never permanent, so an unclaimed first-clear Chai grant stays claimable
// by returning later (the signal stays tappable in every state).
// A cleared signal (quick game finished from that signal at least once on
// this device) is remembered in localStorage purely as display state; the
// server's once-ever Chai grant is the real idempotency boundary.
// ---------------------------------------------------------------------------

const waveKey = (lang: string) => `bolo-signal-waved:${lang}`;
const clearedKey = (lang: string) => `bolo-signal-cleared:${lang}`;

function readGapSet(storage: Storage, key: string): Set<number> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function writeGapSet(storage: Storage, key: string, set: Set<number>): void {
  try {
    storage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Best-effort nicety; losing it only re-offers the encounter.
  }
}

export function isSignalWaved(lang: string, gap: number): boolean {
  try {
    return readGapSet(sessionStorage, waveKey(lang)).has(gap);
  } catch {
    return false;
  }
}

export function markSignalWaved(lang: string, gap: number): void {
  try {
    const set = readGapSet(sessionStorage, waveKey(lang));
    set.add(gap);
    writeGapSet(sessionStorage, waveKey(lang), set);
  } catch {
    // Ignore: the wave simply is not remembered this session.
  }
}

/** The encounter dialog auto-opens ONCE per signal, ever, on this device
 *  (localStorage, like clears — not sessionStorage like waves). A learner
 *  whose journey resumes at a signal was otherwise met by the same dialog on
 *  every single sign-in; after the first offer the signal is theirs to tap. */
const stopSeenKey = (lang: string) => `bolo-signal-stop-shown:${lang}`;

export function isSignalStopSeen(lang: string, gap: number): boolean {
  try {
    return readGapSet(localStorage, stopSeenKey(lang)).has(gap);
  } catch {
    return false;
  }
}

export function markSignalStopSeen(lang: string, gap: number): void {
  try {
    const set = readGapSet(localStorage, stopSeenKey(lang));
    set.add(gap);
    writeGapSet(localStorage, stopSeenKey(lang), set);
  } catch {
    // Ignore: the soft stop may simply auto-open again on a later visit.
  }
}

export function isSignalCleared(lang: string, gap: number): boolean {
  try {
    return readGapSet(localStorage, clearedKey(lang)).has(gap);
  } catch {
    return false;
  }
}

export function markSignalCleared(lang: string, gap: number): void {
  try {
    const set = readGapSet(localStorage, clearedKey(lang));
    set.add(gap);
    writeGapSet(localStorage, clearedKey(lang), set);
  } catch {
    // Ignore: display state only.
  }
}

// ---------------------------------------------------------------------------
// Zone closeout memory (Story 4). Per language, per zone index:
//   absent  = closeout not offered yet
//   "beat2" = closeout game launched or skipped; capstone offer still owed
//   "done"  = the two-beat celebration fully dismissed
// The key is seeded on first sight of a map so zones completed BEFORE this
// feature shipped never retro-celebrate.
// ---------------------------------------------------------------------------

export type CloseoutStage = "beat2" | "done";

const closeoutKey = (lang: string) => `bolo-zone-closeout:${lang}`;

export function readCloseoutStages(lang: string): Record<number, CloseoutStage> {
  try {
    const raw = localStorage.getItem(closeoutKey(lang));
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
    const out: Record<number, CloseoutStage> = {};
    for (const [k, v] of Object.entries(obj)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && (v === "beat2" || v === "done")) out[idx] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeCloseoutStage(
  lang: string,
  zoneIndex: number,
  stage: CloseoutStage,
): void {
  try {
    const stages = readCloseoutStages(lang);
    stages[zoneIndex] = stage;
    localStorage.setItem(closeoutKey(lang), JSON.stringify(stages));
  } catch {
    // Ignore: the celebration may show again next visit.
  }
}

/** True when the closeout key has never been written for this language. */
export function closeoutStateUnseeded(lang: string): boolean {
  try {
    return localStorage.getItem(closeoutKey(lang)) === null;
  } catch {
    return true;
  }
}

/** Seed already-done zones as "done" without celebrating them (first sight
 *  of the map after this feature ships, or a fresh device). */
export function seedCloseoutStages(lang: string, doneZoneIndices: number[]): void {
  try {
    const stages: Record<number, CloseoutStage> = {};
    for (const zi of doneZoneIndices) stages[zi] = "done";
    localStorage.setItem(closeoutKey(lang), JSON.stringify(stages));
  } catch {
    // Ignore.
  }
}

/**
 * Chacha-ji turns up trackside at every fourth station from the third, counted
 * on the flattened global station list (3, 7, 11, ...). The server owns the
 * same rule (api-server lib/chachaEncounters.ts); this copy only decides when
 * the client bothers to ask, so a drift can never mint or skip a gift.
 */
export function isChachaEncounterStation(station: number): boolean {
  return station >= 3 && (station - 3) % 4 === 0;
}

export function isChachaStopSeen(lang: string, station: number): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(`chacha-${lang}-${station}`) === "1";
}

export function markChachaStopSeen(lang: string, station: number): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`chacha-${lang}-${station}`, "1");
}

/**
 * HOW MANY PHRASES A TOPIC CAN ACTUALLY PLAY, which is not how many it holds.
 *
 * Every game's topic picker used to gate on `phraseCount`, the topic's TOTAL.
 * The phrases route serves only phrases in unlocked lesson groups and a journey
 * stop IS a lesson group, so a topic with ten phrases can hand a game none of
 * them. The picker offered the topic un-greyed, the learner tapped it, and the
 * game answered "Need at least 4 phrases here. Choose another topic." Reported
 * off a TestFlight build 2026-08-26 in Luggage Match, and it was true of all
 * six pickers on both platforms.
 *
 * openPhraseCount is the server's count of what this caller can open right now.
 * It is optional, and absent means an older server that never gated the list at
 * all, so falling back to the total is the behaviour those clients already had.
 */
export function playablePhraseCount(cat: {
  phraseCount: number;
  openPhraseCount?: number;
}): number {
  return cat.openPhraseCount ?? cat.phraseCount;
}

/**
 * WHY A TOPIC IS LOCKED, AND WHAT THE PICKER SHOULD SAY ABOUT IT.
 *
 * The owner, build 26: "games must say WHY a topic is locked". Every picker
 * greyed the row to 0.5 and said nothing, so the learner saw a dead control
 * with no cause and no way forward. All six pickers on both platforms had the
 * same hole, which is why the copy lives here rather than five more times.
 *
 * THE WORDS ARE THE PHRASEBOOK'S, NOT NEW ONES. pages/phrasebook.tsx shut the
 * same door on the same field first, and a second dialect of that sentence
 * would read as a different app.
 *
 * NEVER "REACH ZONE N". The cross-zone gate ships OFF (the api-server's
 * featureFlags), so a whole-topic shut door is rare and the usual truth is a
 * topic that is partly open. The real requirement is the stop before this one,
 * which is exactly what the journey's own lock dialog says.
 *
 * THE THREE LOCKED STATES ARE DIFFERENT FACTS and must not share a sentence:
 *   shut   the journey has opened none of it
 *   ahead  it is open, and this game's floor still wants more than it has
 *   thin   it is fully open and simply smaller than the game needs, which is
 *          nothing to do with the journey and must not blame it
 *
 * TWIN: artifacts/bolo-mobile/lib/quick-games.ts. Change both or neither.
 */
export type TopicLockState = {
  /** True for every state but `open`, so the caller greys and re-routes once. */
  locked: boolean;
  kind: "open" | "paywalled" | "shut" | "ahead" | "thin";
  /** The subtitle under the topic's title. */
  sub: string;
};

export function topicLockState(
  cat: { phraseCount: number; openPhraseCount?: number },
  floor: number,
): TopicLockState {
  const playable = playablePhraseCount(cat);
  if (playable >= floor) {
    return { locked: false, kind: "open", sub: `${playable} phrases` };
  }
  // NOTHING VISIBLE AT ALL IS A PLAN LOCK, NOT A JOURNEY LOCK, and telling
  // those two apart is the whole reason this reads phraseCount as well as the
  // playable count. MEASURED AGAINST PRODUCTION 2026-08-31, on the owner's
  // free account in Hindi: Numbers, Food, Everyday Words and Feelings come
  // back phraseCount 0, because every row in them is premium (71 to 91 rows
  // each, all of them). Family comes back phraseCount 40 with none open,
  // which IS the journey holding it.
  //
  // Riding the journey will never open a premium row, so sending a free
  // learner down the map to find one is a promise the product cannot keep.
  // The device caught this: the picker read "Needs 4 phrases to play" on four
  // topics holding ninety phrases each.
  if (cat.phraseCount === 0) {
    return {
      locked: true,
      kind: "paywalled",
      sub: "All-Access opens this topic",
    };
  }
  if (playable === 0) {
    return {
      locked: true,
      kind: "shut",
      sub: "Ride the journey to open this topic",
    };
  }
  const ahead = Math.max(0, cat.phraseCount - playable);
  if (ahead > 0) {
    return {
      locked: true,
      kind: "ahead",
      sub: `${ahead} more ${ahead === 1 ? "waits" : "wait"} further down the line`,
    };
  }
  return { locked: true, kind: "thin", sub: `Needs ${floor} phrases to play` };
}
