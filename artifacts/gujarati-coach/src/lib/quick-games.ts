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

/** Games playable with `visibleCount` plan-visible phrases, roster order. */
export function eligibleQuickGames(visibleCount: number): QuickGameDef[] {
  return QUICK_GAMES.filter((g) => g.floor <= visibleCount);
}

/**
 * Deterministic rotation: the game offered at a signal is picked by the
 * signal's ordinal index over the caller's plan-visible game roster (the
 * quick games whose floor the category's visible set meets). Returns null
 * when no game fits, which is the auto-wave case.
 */
export function gameForSignal(
  signalIndex: number,
  visibleCount: number,
): QuickGameDef | null {
  const eligible = eligibleQuickGames(visibleCount);
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

/** Prod hotfix Item 3 (soft stop): the encounter dialog only auto-opens once
 *  per signal per session, remembered here (sessionStorage, like waves). */
const stopSeenKey = (lang: string) => `bolo-signal-stop-shown:${lang}`;

export function isSignalStopSeen(lang: string, gap: number): boolean {
  try {
    return readGapSet(sessionStorage, stopSeenKey(lang)).has(gap);
  } catch {
    return false;
  }
}

export function markSignalStopSeen(lang: string, gap: number): void {
  try {
    const set = readGapSet(sessionStorage, stopSeenKey(lang));
    set.add(gap);
    writeGapSet(sessionStorage, stopSeenKey(lang), set);
  } catch {
    // Ignore: the soft stop may simply auto-open again this session.
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
