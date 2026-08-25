// Chunk 6B: the quick-game roster and trackside-signal memory.
//
// The five quick games are all free-visible and ride the two FROZEN server
// correctness models (routes are truth, see api-server learning.ts):
//   Model A (selection): correct when selectedPhraseId === phraseId.
//   Model B (assembly):  correct when submittedText matches nativeScript.
// The generated GameSessionInputGame enum is closed (speed-round,
// phrase-builder, word-match, listen-and-pick), so every quick game POSTs
// under an EXISTING free-tier id whose model it rides: selection-style games
// ride "listen-and-pick", the pairs game rides "word-match". Scoped phrase
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
  /** The frozen server game id this quick game rides for scoring. */
  serverGame: "listen-and-pick" | "word-match";
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
    serverGame: "listen-and-pick",
  },
  {
    id: "wrong-platform",
    title: "Wrong Platform",
    path: "/games/wrong-platform",
    floor: 3,
    serverGame: "listen-and-pick",
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
    serverGame: "listen-and-pick",
    plusOnly: true,
  },
  {
    id: "luggage-match",
    title: "Luggage Match",
    path: "/games/luggage-match",
    floor: 4,
    serverGame: "word-match",
  },
  {
    id: "express-listening",
    title: "Express Listening",
    path: "/games/express-listening",
    floor: 4,
    serverGame: "listen-and-pick",
  },
  {
    id: "signal-lights",
    title: "Signal Lights",
    path: "/games/signal-lights",
    floor: 2,
    serverGame: "listen-and-pick",
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
