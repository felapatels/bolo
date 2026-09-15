import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// BOLO QUIZ ASKS FOR PHRASE AUDIO BY LANGUAGE CODE (fleet TTS languageCode
// fix, 2026-09-15). Mobile twin: bolo-mobile __tests__/bolo-quiz-voice-cache.
//
// The listen question sent { text, languageName: activeLang }, where the prop
// called activeLang actually held the display name, and no languageCode.
// /openai/tts picks the phrase voice and its cache namespace from the code, so
// the quiz played the default voice and synthesised live on every play. The
// body now matches practice: the name as languageName, the code as
// languageCode. The whole body is pinned so neither can drift back.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  quizData: undefined as unknown,
  synth: vi.fn(),
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
  useSynthesizeSpeech: () => ({ mutateAsync: h.synth, isPending: false }),
  getGetDailyQuizQueryKey: () => ["daily-quiz"],
}));

// Imported after the mocks so the page picks up the hoisted mock values.
import BoloQuizPage from "@/pages/games/bolo-quiz";

const LISTEN_QUESTION = {
  id: "lq1",
  type: "listen_identify" as const,
  correctNativeScript: "નમસ્તે",
  romanized: "Namaste",
  distractors: ["આવજો", "આભાર"],
  distractorRomanizations: ["Aavjo", "Aabhar"],
};

beforeEach(() => {
  localStorage.clear();
  h.synth.mockReset();
  h.synth.mockResolvedValue({ audioBase64: "AAAA", format: "mp3" });
  h.quizData = { completed: false, questions: [LISTEN_QUESTION] };
});

describe("bolo quiz listen question audio request (web)", () => {
  test("sends the display name as languageName and the code as languageCode", async () => {
    const { hook } = memoryLocation({ path: "/games/quiz" });
    render(
      <Router hook={hook}>
        <BoloQuizPage />
      </Router>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));
    await waitFor(() => expect(h.synth).toHaveBeenCalledTimes(1));

    expect(h.synth.mock.calls[0][0]).toEqual({
      data: {
        text: LISTEN_QUESTION.correctNativeScript,
        languageName: "Gujarati",
        languageCode: "gu",
      },
    });
  });
});
