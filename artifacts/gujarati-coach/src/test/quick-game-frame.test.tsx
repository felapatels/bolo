import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Chunk 6B: the shared quick-game frame. Pins the launch-context contract:
// (1) hub launches POST a payload with NO context key at all (byte-identical
//     to the pre-6B shape) and phraseResults carry ONLY phraseId +
//     selectedPhraseId;
// (2) a signal launch pins the topic (no picker), POSTs context "signal" +
//     contextRef "gap-N", surfaces the Chai earn beat when the server grants,
//     and records the local cleared marker;
// (3) a closeout launch POSTs context "closeout" with no contextRef;
// (4) ctx=signal without a gap is ignored (server requires contextRef there);
// (5) the per-game floor guards a too-small pinned topic.

const h = vi.hoisted(() => ({
  categories: [] as unknown[],
  phrases: [] as unknown[],
  chai: 0,
  mutate: vi.fn(),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({ data: h.categories, isLoading: false }),
  useListCategoryPhrases: () => ({
    data: h.phrases,
    isLoading: false,
    isFetched: true,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordGameSession: () => ({ mutate: h.mutate, isPending: false }),
}));

import {
  QuickGameShell,
  type QuickRoundProps,
} from "@/pages/games/quick-game-frame";
import { quickGameById, isSignalCleared } from "@/lib/quick-games";
import type { Phrase } from "@workspace/api-client-react";

const DEF = quickGameById("signal-lights")!; // floor 2 keeps fixtures small

function TestRound({ phrases, api }: QuickRoundProps) {
  const target = phrases[api.round % phrases.length]!;
  const other = phrases[(api.round + 1) % phrases.length]!;
  return (
    <div>
      <button
        onClick={() =>
          api.submitRound({ phraseId: target.id, selectedPhraseId: target.id, correct: true })
        }
      >
        hit
      </button>
      <button
        onClick={() =>
          api.submitRound({ phraseId: target.id, selectedPhraseId: other.id, correct: false })
        }
      >
        miss
      </button>
    </div>
  );
}

function renderFrame(path: string) {
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <QuickGameShell
          def={DEF}
          instruction="Pick the right answer"
          totalRounds={() => 2}
          renderRound={(p) => <TestRound {...p} />}
        />
      </Router>
    </QueryClientProvider>,
  );
}

/** Same shell but timed, for the Hotfix 3 countdown and timer-urgency pins. */
function renderTimedFrame(path: string) {
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <QuickGameShell
          def={DEF}
          instruction="Pick the right answer"
          secondsPerRound={4}
          totalRounds={() => 2}
          renderRound={(p) => <TestRound {...p} />}
        />
      </Router>
    </QueryClientProvider>,
  );
}

const ph = (id: number) =>
  ({
    id,
    categoryId: 7,
    languageCode: "gu",
    nativeScript: `ન${id}`,
    romanized: `r${id}`,
    english: `word ${id}`,
    hint: "",
    difficulty: 1,
    sortOrder: id,
    bestScore: null,
    mastered: false,
    attemptCount: 0,
  }) as unknown as Phrase;

function playRounds(...moves: ("hit" | "miss")[]) {
  for (const move of moves) {
    fireEvent.click(screen.getByText(move));
  }
}

function postedData() {
  expect(h.mutate).toHaveBeenCalledTimes(1);
  return h.mutate.mock.calls[0]![0].data as Record<string, unknown>;
}

beforeEach(() => {
  h.categories = [
    { id: 7, title: "Food", phraseCount: 5, iconName: "utensils" },
    { id: 8, title: "Tiny", phraseCount: 1, iconName: "star" },
  ];
  h.phrases = [ph(1), ph(2), ph(3), ph(4)];
  h.chai = 0;
  h.mutate.mockReset();
  h.mutate.mockImplementation(
    (_vars: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ xpEarned: 12, chaiGranted: h.chai });
    },
  );
  sessionStorage.removeItem("bolo-signal-waved:gu");
  localStorage.removeItem("bolo-signal-cleared:gu");
});

describe("hub launch (no params)", () => {
  test("shows the picker, disables topics under the floor, and POSTs the pre-6B payload shape", () => {
    renderFrame("/games/signal-lights");
    expect(screen.getByText("Choose a topic to play from")).toBeInTheDocument();
    // Tiny (1 phrase) sits under Signal Lights' floor of 2.
    expect(screen.getByText("Tiny").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByText("Food"));
    expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
    playRounds("hit", "hit");

    expect(screen.getByTestId("quick-end")).toBeInTheDocument();
    expect(screen.getByText("Perfect Round! 🎉")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();

    const data = postedData();
    // Byte-identical hub payload: exactly these keys, no context at all.
    expect(Object.keys(data).sort()).toEqual([
      "categoryId",
      "game",
      "languageCode",
      "phraseResults",
    ]);
    expect(data.game).toBe("listen-and-pick");
    expect(data.categoryId).toBe(7);
    const results = data.phraseResults as Record<string, unknown>[];
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(["phraseId", "selectedPhraseId"]);
    }
    // Hub end screen keeps the topic switcher and routes back to Games.
    expect(screen.getByText("Choose Topic")).toBeInTheDocument();
    expect(screen.getByText("Back to Games").closest("a")).toHaveAttribute("href", "/games");
  });
});

describe("signal launch (?cat&ctx=signal&gap)", () => {
  test("skips the picker, POSTs signal context, shows the Chai beat, and marks cleared", () => {
    h.chai = 1;
    renderFrame("/games/signal-lights?cat=7&ctx=signal&gap=3");
    expect(screen.queryByText("Choose a topic to play from")).not.toBeInTheDocument();
    playRounds("hit", "miss");

    const data = postedData();
    expect(data.context).toBe("signal");
    expect(data.contextRef).toBe("gap-3");
    expect(screen.getByTestId("chai-earn-beat")).toHaveTextContent("+1 Chai earned");
    expect(isSignalCleared("gu", 3)).toBe(true);
    // Journey launches decline back to the journey, not the picker.
    expect(screen.getByText("Back to the journey").closest("a")).toHaveAttribute(
      "href",
      "/journey",
    );
    expect(screen.queryByText("Choose Topic")).not.toBeInTheDocument();
  });

  test("no Chai beat when the server grants nothing (replay of a cleared signal)", () => {
    h.chai = 0;
    renderFrame("/games/signal-lights?cat=7&ctx=signal&gap=3");
    playRounds("hit", "hit");
    expect(screen.getByTestId("quick-end")).toBeInTheDocument();
    expect(screen.queryByTestId("chai-earn-beat")).not.toBeInTheDocument();
  });
});

describe("closeout launch (?cat&ctx=closeout)", () => {
  test("POSTs context closeout with no contextRef", () => {
    renderFrame("/games/signal-lights?cat=7&ctx=closeout");
    playRounds("hit", "hit");
    const data = postedData();
    expect(data.context).toBe("closeout");
    expect(data).not.toHaveProperty("contextRef");
    expect(isSignalCleared("gu", 0)).toBe(false);
  });
});

describe("pre-round countdown + timer urgency (Hotfix 3 items 7c/7d)", () => {
  test("a timed game counts 3-2-1 before round 1 and the round clock holds meanwhile", () => {
    vi.useFakeTimers();
    try {
      renderTimedFrame("/games/signal-lights?cat=7");
      // The countdown replaces the round surface entirely: no progress strip,
      // no round, so round audio and the round timer cannot start early.
      expect(screen.getByTestId("quick-countdown")).toHaveTextContent("3");
      expect(screen.getByText("Get ready…")).toBeInTheDocument();
      expect(screen.queryByTestId("quick-round-progress")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(800));
      expect(screen.getByTestId("quick-countdown")).toHaveTextContent("2");
      act(() => vi.advanceTimersByTime(800));
      expect(screen.getByTestId("quick-countdown")).toHaveTextContent("1");
      act(() => vi.advanceTimersByTime(800));
      expect(screen.queryByTestId("quick-countdown")).not.toBeInTheDocument();
      expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
      // 2.4s elapsed, yet the round clock still reads its full 4s: it held.
      expect(screen.getByTestId("quick-timer")).toHaveTextContent("4s");
    } finally {
      vi.useRealTimers();
    }
  });

  test("an untimed game shows no countdown at all", () => {
    renderFrame("/games/signal-lights?cat=7");
    expect(screen.queryByTestId("quick-countdown")).not.toBeInTheDocument();
    expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
  });

  test("the timer pill goes urgent (red + pulse) only inside the final 2 seconds", () => {
    vi.useFakeTimers();
    try {
      renderTimedFrame("/games/signal-lights?cat=7");
      // Countdown done (one act per step: each next timer comes from an
      // effect that flushes only when the act scope closes).
      for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(800));
      act(() => vi.advanceTimersByTime(1000)); // 3s left
      const timer = screen.getByTestId("quick-timer");
      expect(timer).toHaveTextContent("3s");
      expect(timer.className).not.toContain("text-red-600");
      act(() => vi.advanceTimersByTime(1000)); // 2s left
      expect(timer).toHaveTextContent("2s");
      expect(timer.className).toContain("text-red-600");
      expect(timer.className).toContain("motion-safe:animate-pulse");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("malformed launches", () => {
  test("ctx=signal without a gap is ignored entirely (hub payload)", () => {
    renderFrame("/games/signal-lights?cat=7&ctx=signal");
    playRounds("hit", "hit");
    const data = postedData();
    expect(data).not.toHaveProperty("context");
    expect(data).not.toHaveProperty("contextRef");
  });

  test("a pinned topic under the game's floor shows the floor guard", () => {
    h.phrases = [ph(1)];
    renderFrame("/games/signal-lights?cat=8");
    expect(
      screen.getByText("Need at least 2 phrases for this game. Choose another topic."),
    ).toBeInTheDocument();
  });
});
