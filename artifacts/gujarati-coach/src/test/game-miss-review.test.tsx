import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// End-of-run miss review. The pins here are the ones that decide whether a
// learner can find out WHAT they got wrong:
//  - a run with misses turns the score card into the way in ("See misses")
//    and offers the CTA; a perfect run offers neither
//  - the dialog lists one row per wrong round, in play order, worded by the
//    GAME (a game whose right answer is an odd-one-out would read backwards
//    if the shell derived the row from ids)
//  - a round that lapsed with no answer says so instead of showing a blank
//  - a replay starts from an empty review

const h = vi.hoisted(() => ({
  categories: [] as unknown[],
  phrases: [] as unknown[],
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

import { QuickGameShell, type QuickRoundProps } from "@/pages/games/quick-game-frame";
import { MissReviewDialog, type GameMiss } from "@/components/game-miss-review";
import { quickGameById } from "@/lib/quick-games";
import type { Phrase } from "@workspace/api-client-react";

const DEF = quickGameById("signal-lights")!; // floor 2 keeps fixtures small

/** Three buttons: a hit, a described miss, and a miss that lapsed. */
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
          api.submitRound({
            phraseId: target.id,
            selectedPhraseId: other.id,
            correct: false,
            review: {
              prompt: `prompt ${target.id}`,
              promptSub: `sub ${target.id}`,
              answer: `picked ${other.id}`,
              correct: `right ${target.id}`,
            },
          })
        }
      >
        miss
      </button>
      <button
        onClick={() =>
          api.submitRound({
            phraseId: target.id,
            selectedPhraseId: other.id,
            correct: false,
            review: {
              prompt: `lapsed ${target.id}`,
              answer: null,
              correct: `right ${target.id}`,
            },
          })
        }
      >
        lapse
      </button>
    </div>
  );
}

function renderFrame() {
  const { hook } = memoryLocation({ path: "/games/signal-lights" });
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

function play(...moves: ("hit" | "miss" | "lapse")[]) {
  for (const move of moves) fireEvent.click(screen.getByText(move));
}

beforeEach(() => {
  h.categories = [{ id: 7, title: "Food", phraseCount: 5, iconName: "utensils" }];
  h.phrases = [ph(1), ph(2), ph(3), ph(4)];
  h.mutate.mockReset();
  h.mutate.mockImplementation(
    (_vars: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ xpEarned: 12, chaiGranted: 0 });
    },
  );
});

describe("quick-game end screen", () => {
  test("a run with misses opens the review from the score card", () => {
    renderFrame();
    fireEvent.click(screen.getByText("Food"));
    play("miss", "hit");

    const card = screen.getByTestId("quick-score-card");
    expect(card).toHaveTextContent("1/2");
    expect(card).toHaveTextContent("See misses");
    expect(screen.getByTestId("miss-review-cta")).toBeInTheDocument();

    fireEvent.click(card);
    const rows = screen.getAllByTestId("miss-review-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("prompt 1");
    expect(rows[0]).toHaveTextContent("sub 1");
    expect(rows[0]).toHaveTextContent("picked 2");
    expect(rows[0]).toHaveTextContent("right 1");
  });

  test("the CTA opens the same dialog and lists misses in play order", () => {
    renderFrame();
    fireEvent.click(screen.getByText("Food"));
    play("lapse", "miss");

    fireEvent.click(screen.getByTestId("miss-review-cta"));
    const rows = screen.getAllByTestId("miss-review-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("lapsed 1");
    // A lapsed round says so rather than showing an empty answer.
    expect(rows[0]).toHaveTextContent("nothing — the round ran out");
    expect(rows[1]).toHaveTextContent("prompt 2");
  });

  test("a perfect run offers no review at all", () => {
    renderFrame();
    fireEvent.click(screen.getByText("Food"));
    play("hit", "hit");

    const card = screen.getByTestId("quick-score-card");
    expect(card).toHaveTextContent("Score");
    expect(card).not.toHaveTextContent("See misses");
    // A plain card, not a dead button: there is nothing to open.
    expect(card.tagName).toBe("DIV");
    expect(screen.queryByTestId("miss-review-cta")).not.toBeInTheDocument();
  });

  test("playing again clears the previous run's misses", () => {
    renderFrame();
    fireEvent.click(screen.getByText("Food"));
    play("miss", "hit");
    expect(screen.getByTestId("miss-review-cta")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Play Again"));
    play("hit", "hit");
    expect(screen.queryByTestId("miss-review-cta")).not.toBeInTheDocument();
  });
});

describe("miss review dialog", () => {
  test("a game that is not answered in words can relabel both rows", () => {
    // Script Trace is traced, not typed: "You said 32 out of 100" would be
    // nonsense, so the labels are the game's to word.
    const misses: GameMiss[] = [
      {
        prompt: "ક",
        promptSub: "ka",
        answer: "32 out of 100",
        answerLabel: "Your best",
        correct: "40 out of 100",
        correctLabel: "Pass mark",
      },
    ];
    render(<MissReviewDialog misses={misses} open onOpenChange={() => {}} />);
    const row = screen.getByTestId("miss-review-row");
    expect(row).toHaveTextContent("Your best 32 out of 100");
    expect(row).toHaveTextContent("Pass mark 40 out of 100");
    expect(row).not.toHaveTextContent("You said");
  });

  test("native script on either line carries its romanized reading", () => {
    // Section 10j: script never appears without its reading. A lapsed round
    // has no answer to read, and an empty romanization renders nothing.
    const misses: GameMiss[] = [
      {
        prompt: "Goodbye",
        answer: "શુભ રાત્રિ",
        answerSub: "shubh raatri",
        correct: "આવજો",
        correctSub: "aavjo",
      },
      { prompt: "Thank you", answer: null, answerSub: null, correct: "આભાર", correctSub: "  " },
    ];
    render(<MissReviewDialog misses={misses} open onOpenChange={() => {}} />);
    const [first, second] = screen.getAllByTestId("miss-review-row");
    expect(first).toHaveTextContent("You said શુભ રાત્રિshubh raatri");
    expect(first).toHaveTextContent("Answer આવજોaavjo");
    expect(second).toHaveTextContent("nothing — the round ran out");
    expect(second!.textContent).not.toContain("  ");
  });
});
