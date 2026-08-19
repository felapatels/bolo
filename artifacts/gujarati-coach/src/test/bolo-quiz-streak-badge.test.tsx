import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Tests that the 🔥 quiz streak badge renders correctly on both the
// ResultsScreen (just-finished path) and the AlreadyDoneScreen (revisit path).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  quizData: undefined as unknown,
  completeMutateAsync: vi.fn(),
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
    getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  useCompleteDailyQuiz: () => ({ mutateAsync: h.completeMutateAsync }),
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

// A minimal MCQ question that always has "Hello" as the correct answer, it
// will always appear in the rendered choices regardless of shuffle order.
const ONE_MCQ_QUESTION = [
  {
    type: "mcq_translation" as const,
    nativeScript: "નમસ્તે",
    romanized: "Namaste",
    correctEnglish: "Hello",
    distractors: ["Bye", "Thanks", "Please"],
  },
];

beforeEach(() => {
  h.quizData = undefined;
  h.completeMutateAsync = vi.fn();
});

// ---------------------------------------------------------------------------
// AlreadyDoneScreen (quiz was already completed today)
// ---------------------------------------------------------------------------

describe("Quiz streak badge – AlreadyDoneScreen", () => {
  test("shows 🔥 badge with the correct day count when quizStreak ≥ 1", () => {
    h.quizData = {
      completed: true,
      score: 4,
      total: 5,
      xpAwarded: 40,
      completedAt: new Date().toISOString(),
      quizStreak: 3,
    };

    renderPage();

    // The badge text and emoji must both be visible.
    expect(screen.getByText(/3-day streak!/i)).toBeInTheDocument();
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });

  test("hides the badge when quizStreak is 0", () => {
    h.quizData = {
      completed: true,
      score: 4,
      total: 5,
      xpAwarded: 40,
      completedAt: new Date().toISOString(),
      quizStreak: 0,
    };

    renderPage();

    expect(screen.queryByText(/day streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
  });

  test("shows correct day count for a single-day streak (quizStreak = 1)", () => {
    h.quizData = {
      completed: true,
      score: 5,
      total: 5,
      xpAwarded: 70,
      completedAt: new Date().toISOString(),
      quizStreak: 1,
    };

    renderPage();

    expect(screen.getByText(/1-day streak!/i)).toBeInTheDocument();
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ResultsScreen (just finished the quiz in this session)
// ---------------------------------------------------------------------------

describe("Quiz streak badge – ResultsScreen", () => {
  test("shows 🔥 badge with the correct day count when server returns quizStreak ≥ 1", async () => {
    h.quizData = { completed: false, questions: ONE_MCQ_QUESTION };
    h.completeMutateAsync.mockResolvedValue({
      score: 1,
      xpAwarded: 10,
      quizStreak: 5,
    });

    const user = userEvent.setup();
    renderPage();

    // Answer the one question.
    const helloBtn = await screen.findByRole("button", { name: "Hello" });
    await user.click(helloBtn);

    // Advance to results.
    const seeResultsBtn = await screen.findByRole("button", {
      name: /See results/i,
    });
    await user.click(seeResultsBtn);

    // After the completion mutation resolves, the badge must appear.
    await waitFor(() => {
      expect(screen.getByText(/5-day streak!/i)).toBeInTheDocument();
    });
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });

  test("hides the badge when server returns quizStreak 0", async () => {
    h.quizData = { completed: false, questions: ONE_MCQ_QUESTION };
    h.completeMutateAsync.mockResolvedValue({
      score: 1,
      xpAwarded: 10,
      quizStreak: 0,
    });

    const user = userEvent.setup();
    renderPage();

    const helloBtn = await screen.findByRole("button", { name: "Hello" });
    await user.click(helloBtn);

    const seeResultsBtn = await screen.findByRole("button", {
      name: /See results/i,
    });
    await user.click(seeResultsBtn);

    // Wait for the results screen to settle (completion mutation is async).
    await waitFor(() => {
      expect(screen.getByText(/Today's quiz complete/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/day streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
  });

  test("hides the badge before the completion mutation resolves (streak defaults to 0)", async () => {
    // completeMutateAsync never resolves, badge must stay hidden.
    h.quizData = { completed: false, questions: ONE_MCQ_QUESTION };
    h.completeMutateAsync.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderPage();

    const helloBtn = await screen.findByRole("button", { name: "Hello" });
    await user.click(helloBtn);

    const seeResultsBtn = await screen.findByRole("button", {
      name: /See results/i,
    });
    await user.click(seeResultsBtn);

    // Results screen is shown immediately with the optimistic local score.
    await screen.findByText(/Today's quiz complete/i);

    // No badge yet since the server hasn't responded.
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
  });
});
