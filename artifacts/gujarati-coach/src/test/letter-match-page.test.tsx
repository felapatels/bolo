import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// MATCH THE LETTER TO ITS SOUND, on the web. Twin of bolo-mobile's
// letter-match-screen.test.tsx, same cases in the same order, because the two
// pages are hand-maintained twins and a case only one side runs is a case the
// other can lose quietly.
//
// The boards, the pool and the label-collision rule are pure and pinned by 13
// tests in letter-match.test.ts. What this file covers is what only the PAGE
// can get wrong, and every one of them is silent:
//
//  1. removing a matched row. Every match game that collapses its list trains
//     the learner to answer by POSITION rather than by reading and hands them
//     the last pair free;
//  2. charging for a listen, which is the teaching moment;
//  3. scoring a pair that was missed first;
//  4. costing a life on a miss, or reading a second letter click as a wrong
//     answer instead of a change of mind.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  isPlus: true,
  complete: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "hi", name: "Hindi", nativeName: "हिन्दी" }],
    activeLang: "hi",
    activeLanguage: { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlements: () => ({ isPlus: h.isPlus, isAllAccess: h.isPlus, isLoading: false }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  // A PLAIN FUNCTION, not a hook, so the shared base leaves the REAL one in
  // place and a run would reach the network. Overridden explicitly.
  completeLetterMatch: (...args: unknown[]) => h.complete(...args),
  useSynthesizeSpeech: () => ({ mutateAsync: h.synthesize }),
}));

vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

vi.mock("@/lib/haptics", () => ({ webHaptic: vi.fn() }));

// Imported after the mocks.
import LetterMatchPage from "@/pages/games/letter-match";
import {
  MATCH_BOARD_PAIRS,
  MATCH_BOARD_ROUNDS,
  letterMatchBoards,
  lettersMetBy,
} from "@workspace/script-trace";

class FakeAudio {
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

/** The pool the page itself draws from, so the fixtures cannot drift from it. */
const POOL = lettersMetBy("hi", 1, Number.MAX_SAFE_INTEGER);

function renderPage() {
  const { hook, searchHook } = memoryLocation({ path: "/games/letter-match" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook} searchHook={searchHook}>
        <LetterMatchPage />
      </Router>
    </QueryClientProvider>,
  );
}

function letterIdsOnScreen(): string[] {
  return Array.from(document.querySelectorAll("[data-testid^='match-letter-']")).map((el) =>
    (el as HTMLElement).dataset.testid!.replace("match-letter-", ""),
  );
}

/**
 * Clear one board correctly, first try every pair.
 *
 * THE SIX IDS ARE SNAPSHOTTED BEFORE THE FIRST CLICK. A matched row stays on
 * screen and stays queryable, which is the whole design, so a helper that
 * re-reads the board between matches can pick one it has already matched, click
 * a disabled row and quietly clear nothing. The mobile twin failed exactly that
 * way first.
 */
function clearBoard() {
  const ids = letterIdsOnScreen();
  expect(ids).toHaveLength(MATCH_BOARD_PAIRS);
  for (const id of ids) {
    const c = POOL.find((p) => p.id === id)!;
    fireEvent.click(screen.getByTestId(`match-letter-${c.id}`));
    fireEvent.click(screen.getByTestId(`match-sound-${c.label}`));
  }
}

/** The letter and a sound that is NOT its own, from the board on screen. */
function aWrongPair() {
  const ids = letterIdsOnScreen();
  const letter = POOL.find((p) => p.id === ids[0])!;
  const other = POOL.find((p) => ids.includes(p.id) && p.label !== letter.label)!;
  return { letter, wrongSound: other.label };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.isPlus = true;
  h.complete = vi.fn(() => Promise.resolve({}));
  h.synthesize = vi.fn(async () => ({ audioBase64: "AA==", format: "mp3" }));
});

describe("the letter match page", () => {
  test("has something to test: Hindi fills three full boards", () => {
    expect(letterMatchBoards(POOL)).toHaveLength(MATCH_BOARD_ROUNDS);
  });

  test("draws six letters and six sounds", () => {
    renderPage();
    expect(letterIdsOnScreen()).toHaveLength(MATCH_BOARD_PAIRS);
    expect(
      document.querySelectorAll("[data-testid^='match-sound-']"),
    ).toHaveLength(MATCH_BOARD_PAIRS);
  });

  test("speaks a letter when clicked, and that is never an answer", () => {
    renderPage();
    const { letter } = aWrongPair();
    fireEvent.click(screen.getByTestId(`match-letter-${letter.id}`));
    expect(h.synthesize).toHaveBeenCalled();
    expect(letterIdsOnScreen()).toHaveLength(MATCH_BOARD_PAIRS);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("leaves a matched row in place rather than removing it", () => {
    // THE RULE THIS FILE EXISTS FOR.
    renderPage();
    const { letter } = aWrongPair();
    fireEvent.click(screen.getByTestId(`match-letter-${letter.id}`));
    fireEvent.click(screen.getByTestId(`match-sound-${letter.label}`));
    expect(screen.getByTestId(`match-letter-${letter.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`match-sound-${letter.label}`)).toBeInTheDocument();
    expect(letterIdsOnScreen()).toHaveLength(MATCH_BOARD_PAIRS);
  });

  test("costs no life on a miss and says the letter again", () => {
    renderPage();
    const { letter, wrongSound } = aWrongPair();
    fireEvent.click(screen.getByTestId(`match-letter-${letter.id}`));
    h.synthesize.mockClear();
    fireEvent.click(screen.getByTestId(`match-sound-${wrongSound}`));
    expect(h.synthesize).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(letterIdsOnScreen()).toHaveLength(MATCH_BOARD_PAIRS);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("treats a second letter click as a change of mind, not a wrong answer", () => {
    renderPage();
    const ids = letterIdsOnScreen();
    fireEvent.click(screen.getByTestId(`match-letter-${ids[0]}`));
    fireEvent.click(screen.getByTestId(`match-letter-${ids[1]}`));
    const second = POOL.find((p) => p.id === ids[1])!;
    fireEvent.click(screen.getByTestId(`match-sound-${second.label}`));
    // Matched, which it could not be if the first click had been consumed.
    expect(screen.getByTestId(`match-letter-${second.id}`).className).toContain("opacity-45");
  });

  test("records the whole game once, and only first-try pairs score", () => {
    renderPage();
    const { letter, wrongSound } = aWrongPair();
    fireEvent.click(screen.getByTestId(`match-letter-${letter.id}`));
    fireEvent.click(screen.getByTestId(`match-sound-${wrongSound}`));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    for (let b = 0; b < MATCH_BOARD_ROUNDS; b++) clearBoard();
    expect(h.complete).toHaveBeenCalledTimes(1);
    const call = h.complete.mock.calls[0][0];
    expect(call.lang).toBe("hi");
    expect(call.total).toBe(MATCH_BOARD_PAIRS * MATCH_BOARD_ROUNDS);
    expect(call.correct).toBe(call.total - 1);
    expect(screen.getByTestId("letter-match-done")).toBeInTheDocument();
  });

  test("sends a Free learner to the paywall: the taste is stop 4, not this", () => {
    h.isPlus = false;
    renderPage();
    expect(screen.queryByTestId("game-exit-btn")).toBeNull();
  });
});
