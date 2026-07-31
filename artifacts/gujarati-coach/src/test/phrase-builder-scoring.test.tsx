import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Regression test for the Phrase Builder result math: correctCount is
// incremented in handleCheck, so the final handleNext must NOT add another +1
// for the last phrase. A perfect round must show exactly N/N and 100%
// accuracy — never more.
// ---------------------------------------------------------------------------

const PHRASES = [
  { id: 1, nativeScript: "aaa bbb", romanized: "aaa bbb", english: "one two" },
  { id: 2, nativeScript: "ccc ddd", romanized: "ccc ddd", english: "three four" },
];

vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({ data: [{ id: 7, title: "Basics" }] }),
  useListCategoryPhrases: () => ({ data: PHRASES, isLoading: false }),
  useRecordGameSession: () => ({
    mutate: (_args: unknown, opts?: { onSuccess?: (d: { xpEarned: number }) => void }) => {
      opts?.onSuccess?.({ xpEarned: 12 });
    },
  }),
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: () => ["progress-summary"],
  // Tile-placement audio (Build 30 batch 3) - stubbed, playback is not asserted here.
  useSynthesizeSpeech: () => ({
    mutateAsync: vi.fn(async () => ({ audioBase64: "AAA", format: "mp3" })),
    isPending: false,
  }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    languages: [],
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ dir: "ltr", style: {} }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false }),
  asUpgradeRequired: () => null,
  upgradeHref: () => "/upgrade",
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));
vi.mock("@/components/ui/confetti", () => ({ Confetti: () => null }));
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

import PhraseBuilderPage from "@/pages/games/phrase-builder";

function renderPage() {
  const { hook } = memoryLocation({ path: "/games/phrase-builder" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <PhraseBuilderPage />
      </Router>
    </QueryClientProvider>,
  );
}

async function solveCurrentPhrase() {
  // The english hint tells us which phrase is active.
  const phrase = PHRASES.find((p) => screen.queryByText(p.english) !== null);
  expect(phrase).toBeDefined();
  for (const word of phrase!.nativeScript.split(" ")) {
    // Tray tiles come after drop-zone tiles in the DOM; click the last match.
    const buttons = screen.getAllByRole("button", { name: word });
    fireEvent.click(buttons[buttons.length - 1]);
  }
  fireEvent.click(screen.getByRole("button", { name: "Check Answer" }));
  await screen.findByText("Correct!");
}

describe("Phrase Builder result math", () => {
  test("a perfect round reports exactly N/N and 100% accuracy", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Start Game" }));
    await screen.findByText(/Phrase 1 of/);

    // Round length is fixed by the game (PHRASES_PER_ROUND).
    const total = Number(
      (await screen.findByText(/Phrase 1 of \d+/)).textContent!.match(/of (\d+)/)![1],
    );

    for (let i = 0; i < total; i++) {
      await solveCurrentPhrase();
      const next = screen.getByRole("button", {
        name: i + 1 >= total ? "See Results" : "Next Phrase →",
      });
      fireEvent.click(next);
    }

    // Done screen: never 7/6 or >100%.
    await waitFor(() => {
      expect(screen.getByText(`${total}/${total}`)).toBeTruthy();
    });
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.queryByText(`${total + 1}/${total}`)).toBeNull();
  });
});
