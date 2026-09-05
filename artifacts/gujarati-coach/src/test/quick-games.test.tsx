import { describe, test, expect, beforeEach } from "vitest";

// Chunk 6B: unit pins for the quick-game roster and its journey memory.
// (1) The roster's server game mapping stays inside the FROZEN server enum:
//     luggage-match rides word-match, everything else rides listen-and-pick.
// (2) Per-game floors drive eligibility, and the signal rotation is a pure
//     modulo over the eligible roster (null = auto-wave).
// (3) Wave memory is session-scoped, cleared memory is device-scoped, and
//     both are per-language.
// (4) Closeout stages seed already-done zones straight to "done" so nothing
//     retro-celebrates.

import {
  QUICK_GAMES,
  QUICK_GAME_MIN_FLOOR,
  quickGameById,
  eligibleQuickGames,
  gameForSignal,
  isSignalWaved,
  markSignalWaved,
  isSignalCleared,
  markSignalCleared,
  readCloseoutStages,
  writeCloseoutStage,
  closeoutStateUnseeded,
  seedCloseoutStages,
} from "@/lib/quick-games";

beforeEach(() => {
  // Targeted removal only: setup.ts pins suite-wide localStorage defaults and
  // a blanket clear() would wipe them for later renders in the same file.
  for (const lang of ["gu", "hi"]) {
    sessionStorage.removeItem(`bolo-signal-waved:${lang}`);
    localStorage.removeItem(`bolo-signal-cleared:${lang}`);
    localStorage.removeItem(`bolo-zone-closeout:${lang}`);
  }
});

describe("quick game roster", () => {
  test("six games, ids stable, server mapping stays in the frozen enum", () => {
    // SIX from 2026-08-25: Wrong Platform split into a free Part 1 and an
    // All-Access Part 2. Part 2 is a roster entry rather than a mode flag,
    // because the hub draws one tile per entry and two tiles were the ask.
    expect(QUICK_GAMES.map((g) => g.id)).toEqual([
      "ticket-check",
      "wrong-platform",
      "wrong-platform-2",
      "luggage-match",
      "express-listening",
      "signal-lights",
    ]);
    // A plusOnly game must never reach the trackside signal rotation: a
    // signal is a free-visible encounter, and offering a locked game there
    // would be an upsell wearing a game's clothes.
    for (const g of QUICK_GAMES.filter((x) => x.plusOnly)) {
      expect(eligibleQuickGames(99, 1).map((e) => e.id)).not.toContain(g.id);
    }
    // INVERTED 2026-09-04. These lines used to assert that every quick game
    // rode "listen-and-pick" or "word-match", because the server's
    // GameSessionInputGame enum was closed at four. That is precisely what
    // made a Ticket Check play indistinguishable from a Listen & Pick one and
    // left the free taste nothing to count. The enum was widened; the game's
    // own id is now the assertion.
    for (const g of QUICK_GAMES) {
      expect(g.serverGame).toBe(g.id);
    }
    expect(quickGameById("luggage-match")!.serverGame).toBe("luggage-match");
    expect(quickGameById("ticket-check")!.serverGame).toBe("ticket-check");
    expect(quickGameById("wrong-platform")!.serverGame).toBe("wrong-platform");
    expect(quickGameById("express-listening")!.serverGame).toBe("express-listening");
    expect(quickGameById("signal-lights")!.serverGame).toBe("signal-lights");
    expect(quickGameById("nope")).toBeUndefined();
  });

  test("floors gate eligibility and the min floor is the auto-wave line", () => {
    expect(QUICK_GAME_MIN_FLOOR).toBe(2);
    expect(eligibleQuickGames(0)).toEqual([]);
    expect(eligibleQuickGames(1)).toEqual([]);
    expect(eligibleQuickGames(2).map((g) => g.id)).toEqual(["signal-lights"]);
    expect(eligibleQuickGames(3).map((g) => g.id)).toEqual([
      "wrong-platform",
      "signal-lights",
    ]);
    expect(eligibleQuickGames(4)).toHaveLength(5);
  });

  test("signal rotation walks the eligible roster by signal index, wrapping", () => {
    expect(gameForSignal(0, 5)!.id).toBe("ticket-check");
    expect(gameForSignal(1, 5)!.id).toBe("wrong-platform");
    expect(gameForSignal(4, 5)!.id).toBe("signal-lights");
    expect(gameForSignal(5, 5)!.id).toBe("ticket-check"); // wrap
    // A thinner roster rotates over what fits.
    expect(gameForSignal(0, 3)!.id).toBe("wrong-platform");
    expect(gameForSignal(1, 3)!.id).toBe("signal-lights");
    expect(gameForSignal(2, 3)!.id).toBe("wrong-platform");
    // Under the min floor there is no game at all: auto-wave.
    expect(gameForSignal(0, 1)).toBeNull();
    expect(gameForSignal(3, 0)).toBeNull();
  });
});

describe("signal memory", () => {
  test("waves are session-scoped and per-language", () => {
    expect(isSignalWaved("gu", 1)).toBe(false);
    markSignalWaved("gu", 1);
    expect(isSignalWaved("gu", 1)).toBe(true);
    expect(isSignalWaved("gu", 3)).toBe(false);
    expect(isSignalWaved("hi", 1)).toBe(false);
    // Session storage, never local: a wave must not outlive the session.
    expect(sessionStorage.getItem("bolo-signal-waved:gu")).toContain("1");
    expect(localStorage.getItem("bolo-signal-waved:gu")).toBeNull();
  });

  test("clears are device-scoped display state, per-language", () => {
    expect(isSignalCleared("gu", 5)).toBe(false);
    markSignalCleared("gu", 5);
    expect(isSignalCleared("gu", 5)).toBe(true);
    expect(isSignalCleared("hi", 5)).toBe(false);
    expect(localStorage.getItem("bolo-signal-cleared:gu")).toContain("5");
    expect(sessionStorage.getItem("bolo-signal-cleared:gu")).toBeNull();
  });

  test("corrupt storage reads as empty, never throws", () => {
    sessionStorage.setItem("bolo-signal-waved:gu", "{not json");
    localStorage.setItem("bolo-signal-cleared:gu", '{"a":1}');
    expect(isSignalWaved("gu", 1)).toBe(false);
    expect(isSignalCleared("gu", 1)).toBe(false);
  });
});

describe("closeout stage memory", () => {
  test("unseeded until first write; seeding marks given zones done", () => {
    expect(closeoutStateUnseeded("gu")).toBe(true);
    seedCloseoutStages("gu", [0, 2]);
    expect(closeoutStateUnseeded("gu")).toBe(false);
    expect(readCloseoutStages("gu")).toEqual({ 0: "done", 2: "done" });
    // Seeding with nothing done still counts as seeded.
    seedCloseoutStages("hi", []);
    expect(closeoutStateUnseeded("hi")).toBe(false);
    expect(readCloseoutStages("hi")).toEqual({});
  });

  test("stage writes round-trip and invalid entries are dropped on read", () => {
    seedCloseoutStages("gu", []);
    writeCloseoutStage("gu", 1, "beat2");
    expect(readCloseoutStages("gu")).toEqual({ 1: "beat2" });
    writeCloseoutStage("gu", 1, "done");
    writeCloseoutStage("gu", 3, "beat2");
    expect(readCloseoutStages("gu")).toEqual({ 1: "done", 3: "beat2" });
    localStorage.setItem(
      "bolo-zone-closeout:gu",
      JSON.stringify({ 1: "done", x: "beat2", 2: "bogus" }),
    );
    expect(readCloseoutStages("gu")).toEqual({ 1: "done" });
  });
});
