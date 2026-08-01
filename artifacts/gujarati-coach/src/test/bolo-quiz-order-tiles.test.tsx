import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// R3 (32.1) web twin: order_words quiz tiles show a romanized subtitle under
// the native-script word, driven by the server's index-aligned
// tileRomanizations. Empty entries and legacy quizzes (field absent) render
// no subtitle.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  quizData: undefined as unknown,
}));

vi.mock("@/components/mascot", () => ({
  Mascot: () => <div data-testid="mascot" />,
}));

vi.mock("@/components/layout/bottom-nav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { name: "Gujarati" },
  }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetDailyQuiz: () => ({ data: h.quizData, isLoading: false }),
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: vi.fn(() => ["progress-summary"]),
  useCompleteDailyQuiz: () => ({ mutateAsync: vi.fn() }),
  useSynthesizeSpeech: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getGetDailyQuizQueryKey: () => ["daily-quiz"],
}));

// Imported after the mocks so the page picks up the hoisted mock values.
import BoloQuizPage from "@/pages/games/bolo-quiz";

function renderPage() {
  const { hook } = memoryLocation({ path: "/games/quiz" });
  return render(
    <Router hook={hook}>
      <BoloQuizPage />
    </Router>,
  );
}

const ORDER_QUESTION = {
  type: "order_words" as const,
  phraseId: 7,
  nativeScript: "તમને કેમ છે",
  romanized: "tamne kem che",
  english: "How are you?",
  tiles: ["છે", "તમને", "કેમ"],
  tileRomanizations: ["che", "tamne", "kem"],
};

beforeEach(() => {
  h.quizData = undefined;
});

describe("order-words tile romanized subtitles (R3, web)", () => {
  test("renders each tile with its aligned romanized subtitle", () => {
    h.quizData = { completed: false, questions: [ORDER_QUESTION] };
    renderPage();

    for (const [tile, sub] of [
      ["છે", "che"],
      ["તમને", "tamne"],
      ["કેમ", "kem"],
    ] as const) {
      expect(screen.getByText(tile)).toBeInTheDocument();
      expect(screen.getByText(sub)).toBeInTheDocument();
    }
  });

  test("empty-string romanizations render no subtitle line", () => {
    h.quizData = {
      completed: false,
      questions: [{ ...ORDER_QUESTION, tileRomanizations: ["", "tamne", ""] }],
    };
    renderPage();

    expect(screen.getByText("tamne")).toBeInTheDocument();
    expect(screen.queryByText("che")).not.toBeInTheDocument();
    expect(screen.queryByText("kem")).not.toBeInTheDocument();
  });

  test("legacy stored quizzes without tileRomanizations render plain tiles", () => {
    const { tileRomanizations: _omitted, ...legacy } = ORDER_QUESTION;
    h.quizData = { completed: false, questions: [legacy] };
    renderPage();

    expect(screen.getByText("છે")).toBeInTheDocument();
    expect(screen.queryByText("che")).not.toBeInTheDocument();
    expect(screen.queryByText("tamne")).not.toBeInTheDocument();
  });
});
