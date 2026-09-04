import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// THE LETTER STOP, stop 4 of every zone. Web twin of
// bolo-mobile/__tests__/letter-stop-screen.test.tsx, same cases in the same
// order, because the two pages are hand-maintained twins and a case that only
// one side runs is a case the other side can lose quietly.
//
// The lib is already pinned by 20 pure tests: which letters are asked, which
// wrong answers are offered and in what order, and where the row lands. None of
// that is repeated here. What this file covers is the four things only the PAGE
// can get wrong, and each of them is silent when it breaks:
//
//  1. showing the letter while the question is open, which turns an ear test
//     into a reading test and makes the whole stop free;
//  2. scoring a re-queued letter, which would let eight wrong answers still
//     clear a 6-of-8 bar;
//  3. dropping a missed letter instead of putting it back in the pile, so
//     "no life lost" quietly becomes "no second chance either";
//  4. posting the wrong journey, zone or count to the one route that writes.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  isPlus: true,
  passed: new Set<string>(),
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
  useEntitlements: () => ({
    isPlus: h.isPlus,
    isAllAccess: h.isPlus,
    isLoading: false,
  }),
}));

vi.mock("@/lib/useTraceStopProgress", () => ({
  useTraceStopProgress: () => ({ passedCharacterIds: h.passed, isLoading: false }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  // A PLAIN FUNCTION, not a hook, so the shared base leaves the REAL one in
  // place and a run would reach the network. Overridden explicitly.
  completeLetterStop: (...args: unknown[]) => h.complete(...args),
  useSynthesizeSpeech: () => ({ mutateAsync: h.synthesize }),
}));

vi.mock("@/components/layout/bottom-nav", () => ({
  BottomNav: () => null,
}));

// Imported after the mocks are declared.
import LetterStopPage from "@/pages/games/letter-stop";
import {
  LETTER_STOP_LENGTH,
  letterDistractorsFor,
  letterStopFor,
} from "@workspace/script-trace";

// jsdom's Audio cannot play; the page only needs it to exist and not throw.
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

// Hindi zone 1, which is the taste and therefore the one every learner meets.
// Read from the lib rather than hardcoded: if the ladder ever reauthors this
// zone the expectations move with it instead of quietly testing nothing.
const STOP = letterStopFor("hi", 1, 1)!;
const LABELS = STOP.characters.slice(0, LETTER_STOP_LENGTH).map((c) => c.label);

// The page calls useQueryClient to invalidate the progress summary after a
// run, so it needs a real client even though nothing here reads a query.
function renderPage(search = "?journey=1&zone=1") {
  const { hook, searchHook } = memoryLocation({ path: `/games/letter-stop${search}` });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook} searchHook={searchHook}>
        <LetterStopPage />
      </Router>
    </QueryClientProvider>,
  );
}

/** Click the right answer for the question on screen and let the beat run out. */
function answerRight(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

/**
 * A wrong answer that is certain to be on screen, asked of the lib rather than
 * guessed: letterDistractorsFor is what the page builds the row from, so its
 * first pick for a letter is always one of that letter's choices and is never
 * the letter itself.
 *
 * NOT an index. The choices are shuffled, so "click choice 0" is the right
 * answer about a third of the time, which is a test that passes or fails on
 * Math.random. The mobile twin was written that way first and did exactly that.
 */
function wrongAnswerFor(index: number): string {
  return letterDistractorsFor(STOP.characters[index]!, STOP.pool, 1)[0]!.label;
}

/** Click anything BUT the right answer, which is what "no life lost" is about. */
function answerWrong(index: number) {
  fireEvent.click(screen.getByRole("button", { name: wrongAnswerFor(index) }));
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.isPlus = true;
  // Nothing traced yet, which is the state a first-time learner arrives in.
  h.passed = new Set<string>();
  h.complete = vi.fn(() => Promise.resolve({}));
  h.synthesize = vi.fn(async () => ({ audioBase64: "AA==", format: "mp3" }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the letter stop page", () => {
  test("has something to test: Hindi zone 1 authors a letter stop", () => {
    expect(STOP).not.toBeNull();
    expect(LABELS.length).toBe(LETTER_STOP_LENGTH);
  });

  test("never shows the letter while the question is open", () => {
    renderPage();
    // THE WHOLE POINT OF THE EAR VERSION. Showing the character turns this into
    // the tracing stop two rows above it and makes every question free.
    expect(screen.queryByTestId("letter-reveal")).toBeNull();
    expect(screen.queryByText(STOP.characters[0]!.char)).toBeNull();
    // And it is revealed the moment an answer lands, because the shape beside
    // the sound you just chose is the teaching.
    fireEvent.click(screen.getByRole("button", { name: LABELS[0]! }));
    expect(screen.getByTestId("letter-reveal")).toBeInTheDocument();
    expect(screen.getByText(STOP.characters[0]!.char)).toBeInTheDocument();
  });

  test("asks three choices for a letter the learner has never traced", () => {
    renderPage();
    // Three to begin with, which is friendlier and is what the lib's
    // LETTER_CHOICES_FIRST says.
    expect(screen.getByTestId("letter-choice-2")).toBeInTheDocument();
    expect(screen.queryByTestId("letter-choice-3")).toBeNull();
  });

  test("asks four for a letter already traced and passed", () => {
    // FOUR CHOICES ROUGHLY HALVE THE GUESS RATE, and they are offered exactly
    // where guessing has stopped being the point: a letter the learner has
    // already written correctly. Reading "seen" as seen-in-this-run makes the
    // fourth choice unreachable, because a letter is asked once and a missed
    // one comes back UNSEEN. The mobile twin shipped that way for an hour and
    // its own copy of this test caught it.
    h.passed = new Set(STOP.characters.map((c) => c.id));
    renderPage();
    expect(screen.getByTestId("letter-choice-3")).toBeInTheDocument();
    expect(screen.queryByTestId("letter-choice-4")).toBeNull();
  });

  test("puts a missed letter back in the pile and scores only the first showing", () => {
    renderPage();
    answerWrong(0);
    for (let i = 1; i < LABELS.length; i += 1) answerRight(LABELS[i]!);
    // Nothing has been posted yet: the run is not over, because the missed
    // letter was added to the end rather than dropped.
    expect(h.complete).not.toHaveBeenCalled();
    answerRight(LABELS[0]!);
    // Seven of eight, NOT eight: getting it right the second time teaches and
    // does not score, or eight wrong answers would still clear a 6-of-8 bar.
    expect(h.complete).toHaveBeenCalledWith({
      lang: "hi",
      journey: 1,
      zone: 1,
      correct: LABELS.length - 1,
      total: LABELS.length,
    });
  });

  test("posts the whole run once, with the journey and zone it was opened at", () => {
    renderPage();
    for (const label of LABELS) answerRight(label);
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(h.complete).toHaveBeenCalledWith({
      lang: "hi",
      journey: 1,
      zone: 1,
      correct: LABELS.length,
      total: LABELS.length,
    });
    expect(screen.getByTestId("letter-stop-done")).toBeInTheDocument();
  });

  test("lets a Free learner take the zone 1 taste", () => {
    h.isPlus = false;
    renderPage();
    expect(screen.getByText(/Free taste/)).toBeInTheDocument();
    expect(screen.getByTestId("letter-choice-0")).toBeInTheDocument();
  });

  test("sends a Free learner past zone 1 to the paywall", () => {
    // The taste is journey 1 zone 1 in every language and nothing beyond it,
    // which is the same condition the server route enforces. A stop that shows
    // no lock and then bounces you to the paywall is the bug the tracing taste
    // was created to fix, so the map locks this row too.
    h.isPlus = false;
    renderPage("?journey=1&zone=2");
    expect(screen.queryByTestId("letter-choice-0")).toBeNull();
  });

  test("says so rather than rendering an empty stop when the link carries no zone", () => {
    // A zone that is not a number, which is what a malformed or truncated link
    // looks like. NOT a high zone number: letterStopFor deliberately still
    // returns a stop for a zone with no tracing stop of its own, drawing on the
    // most recent letters met, so the drill does not vanish for half the
    // journey. The mobile twin asserted zone 99 first and was asserting nothing.
    renderPage("?journey=1&zone=not-a-zone");
    expect(screen.getByText("No letters here yet")).toBeInTheDocument();
    expect(h.complete).not.toHaveBeenCalled();
  });
});
