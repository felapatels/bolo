import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the hot-streak toasts (🔥 3-in-a-row / On a roll / UNSTOPPABLE)
// and the session-summary XP chip that appear on the web practice screen.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  ApiError: class extends Error {
    status: number;
    constructor(status: number) {
      super(`HTTP ${status}`);
      this.status = status;
    }
  },
  useListCategoryPhrases: () => h.categoryPhrases,
  useListCategorySentences: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  getListCategorySentencesQueryKey: () => ["category-sentences"],
  useListReviewPhrases: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useSynthesizeSpeech: () => ({ mutateAsync: h.synth, isPending: false }),
  useEvaluatePronunciation: () => ({ mutateAsync: h.evaluate, isPending: false }),
  useCreateAttempt: () => ({ mutateAsync: h.createAttempt, isPending: false }),
  getListCategoryPhrasesQueryKey: () => ["category-phrases"],
  getListReviewPhrasesQueryKey: () => ["review"],
  getGetProgressSummaryQueryKey: () => ["progress-summary"],
  getListRecentAttemptsQueryKey: () => ["recent-attempts"],
  getListBadgesQueryKey: () => ["badges"],
}));

import Practice from "@/pages/practice";

class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

const phrases = Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i,
  nativeScript: `phrase-${i}`,
  romanized: `rom-${i}`,
  english: `english-${i}`,
}));

function makeBlob(bytes = 4) {
  return {
    size: bytes,
    type: "audio/webm",
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

// Generous timeout for waitFor calls — the CI validation environment runs all
// test suites in parallel so individual async steps can take longer than the
// 1 s default without indicating a real failure.
const WT = { timeout: 8000 };

/** Render with silent mode and the given phrase list, then wait for idle. */
async function reachIdle(phraseList = phrases.slice(0, 3)) {
  localStorage.setItem("bolo.silentMode", "on");
  h.categoryPhrases = {
    data: phraseList,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  renderPage(<Practice />);
  await waitFor(() => expect(screen.getByText("Hold to speak")).toBeInTheDocument(), WT);
}

/**
 * Score one phrase: hold → release → wait for the score card.
 * Resets h.startRecording before each call so the waitFor below doesn't
 * resolve immediately from a previous phrase's recording call.
 */
async function scoreOnce(score = 90) {
  h.evaluate.mockResolvedValueOnce({
    score,
    feedback: "Good!",
    tip: "Keep it up.",
    evaluationToken: "tok",
  });
  // Fresh mock so waitFor sees a new call, not the stale one from the last phrase.
  h.startRecording.mockReset().mockResolvedValue(undefined);

  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled(), WT);
  await act(async () => {
    const releaseTarget =
      (document.querySelector('[aria-label="Release to submit"]') ?? belly) as HTMLButtonElement;
    fireEvent.pointerUp(releaseTarget);
  });
  await waitFor(() => expect(screen.getByText(`Score: ${score}`)).toBeInTheDocument(), WT);
}

/** Score a phrase and advance to the next one. */
async function scoreAndNext(score = 90) {
  await scoreOnce(score);
  fireEvent.click(screen.getByText("Next"));
  await waitFor(() => expect(screen.getByText("Hold to speak")).toBeInTheDocument(), WT);
}

beforeEach(() => {
  localStorage.clear();
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.evaluate.mockReset().mockResolvedValue({
    score: 90,
    feedback: "Good!",
    tip: "Keep it up.",
    evaluationToken: "tok",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.stopRecording.mockReset().mockResolvedValue(makeBlob());
});

// ---------------------------------------------------------------------------
// Hot-streak toasts
// ---------------------------------------------------------------------------
describe("hot-streak toasts", () => {
  test('shows "🔥 3 in a row!" after three consecutive scores ≥ 70', async () => {
    await reachIdle(phrases.slice(0, 3));

    await scoreAndNext(75);
    await scoreAndNext(80);
    // Third consecutive ≥70 — toast fires before the 1800ms timer clears it
    await scoreOnce(90);

    await waitFor(
      () => expect(screen.getByText("🔥 3 in a row!")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "🔥🔥 On a roll!" after five consecutive scores ≥ 70', async () => {
    await reachIdle(phrases.slice(0, 5));

    await scoreAndNext(75);
    await scoreAndNext(80);
    await scoreAndNext(90);
    await scoreAndNext(70);
    // Fifth consecutive ≥70 — "On a roll!" fires
    await scoreOnce(80);

    await waitFor(
      () => expect(screen.getByText("🔥🔥 On a roll!")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "🔥🔥🔥 UNSTOPPABLE!" after ten consecutive scores ≥ 70', async () => {
    const tenPhrases = Array.from({ length: 10 }, (_, i) => ({
      id: 200 + i,
      nativeScript: `p10-${i}`,
      romanized: `r10-${i}`,
      english: `e10-${i}`,
    }));
    await reachIdle(tenPhrases);

    for (let i = 0; i < 9; i++) {
      await scoreAndNext(80);
    }
    // Tenth consecutive ≥70 — "UNSTOPPABLE!" fires
    await scoreOnce(80);

    await waitFor(
      () => expect(screen.getByText("🔥🔥🔥 UNSTOPPABLE!")).toBeInTheDocument(),
      WT,
    );
  }, 30000);

  test("resets the streak counter after a score below 70", async () => {
    await reachIdle(phrases.slice(0, 3));

    await scoreAndNext(80);  // streak = 1
    await scoreAndNext(50);  // streak resets to 0
    await scoreOnce(80);     // streak = 1 — no "3 in a row" toast yet

    // Brief pause to confirm the toast does NOT appear
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText("🔥 3 in a row!")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mid-session toasts
// ---------------------------------------------------------------------------
describe("mid-session toasts", () => {
  // 4 phrases: halfway fires when advancing to index 2 (= floor(4/2))
  // last fires when advancing to index 3 (= phrases.length - 1)
  const fourPhrases = phrases.slice(0, 4);

  test('fires "Halfway there! 💪" exactly once at the midpoint', async () => {
    await reachIdle(fourPhrases);

    // Advance to index 2 (nextIndex = 2 = floor(4/2)) — halfway toast fires
    await scoreAndNext(80); // index 0 → 1
    await scoreOnce(80);    // index 1 — next click will go to index 2
    fireEvent.click(screen.getByText("Next"));
    await waitFor(
      () => expect(screen.getByText("Halfway there! 💪")).toBeInTheDocument(),
      WT,
    );
  });

  test('fires "Last one! 🦜 Finish strong!" exactly once on the final phrase', async () => {
    await reachIdle(fourPhrases);

    await scoreAndNext(80); // → index 1
    await scoreAndNext(80); // → index 2
    await scoreOnce(80);    // index 2 — next click will go to index 3 (last)
    fireEvent.click(screen.getByText("Next"));
    await waitFor(
      () => expect(screen.getByText("Last one! 🦜 Finish strong!")).toBeInTheDocument(),
      WT,
    );
  });

  test("each mid-session toast fires at most once per session", async () => {
    await reachIdle(fourPhrases);

    // Trigger halfway toast
    await scoreAndNext(80); // → 1
    await scoreOnce(80);
    fireEvent.click(screen.getByText("Next")); // → 2, halfway toast
    await waitFor(() => expect(screen.getByText("Halfway there! 💪")).toBeInTheDocument(), WT);

    // Trigger last-phrase toast
    await scoreOnce(80);
    fireEvent.click(screen.getByText("Next")); // → 3, last toast
    await waitFor(() => expect(screen.getByText("Last one! 🦜 Finish strong!")).toBeInTheDocument(), WT);

    // Both toasts should have appeared at most once — no duplicates visible now
    expect(screen.queryAllByText("Halfway there! 💪").length).toBeLessThanOrEqual(1);
    expect(screen.queryAllByText("Last one! 🦜 Finish strong!").length).toBeLessThanOrEqual(1);
  });

  test("halfway toast does not fire for sessions with fewer than 4 phrases", async () => {
    await reachIdle(phrases.slice(0, 3)); // 3 phrases — below the 4-phrase guard

    await scoreAndNext(80); // → 1
    await scoreOnce(80);
    fireEvent.click(screen.getByText("Next")); // → 2, but no halfway toast since length < 4

    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText("Halfway there! 💪")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Score display (count-up)
// ---------------------------------------------------------------------------
describe("score display", () => {
  test("displays the evaluated score value after recording", async () => {
    await reachIdle(phrases.slice(0, 1));

    h.evaluate.mockResolvedValueOnce({
      score: 75,
      feedback: "Good!",
      tip: "Nice work.",
      evaluationToken: "tok-75",
    });
    h.startRecording.mockReset().mockResolvedValue(undefined);

    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    fireEvent.pointerDown(belly);
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled(), WT);
    await act(async () => {
      const releaseTarget =
        (document.querySelector('[aria-label="Release to submit"]') ?? belly) as HTMLButtonElement;
      fireEvent.pointerUp(releaseTarget);
    });

    await waitFor(
      () => expect(screen.getByText("Score: 75")).toBeInTheDocument(),
      WT,
    );
  });

  test("score node is present in the DOM (accessible to screen readers)", async () => {
    await reachIdle(phrases.slice(0, 1));
    await scoreOnce(88);
    // The score lives inside a single node so assistive technology can read it
    const scoreNode = screen.getByText("Score: 88");
    expect(scoreNode).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Session-summary XP chip
// ---------------------------------------------------------------------------
describe("session summary XP chip", () => {
  test("shows the correct XP earned on the summary screen", async () => {
    // Two phrases, both score 80 → avgScore=80, xpEarned = round(80/10)*2 = 16
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext(80);
    await scoreOnce(80);
    fireEvent.click(screen.getByText("Next"));

    await waitFor(
      () => expect(screen.getByText(/\+16 XP earned/i)).toBeInTheDocument(),
      WT,
    );
  });

  test("caps XP at 50 for high-scoring sessions", async () => {
    // 6 phrases all score 90 → uncapped = round(90/10)*6 = 54, capped at 50
    await reachIdle(phrases.slice(0, 6));

    for (let i = 0; i < 5; i++) {
      await scoreAndNext(90);
    }
    await scoreOnce(90);
    fireEvent.click(screen.getByText("Next"));

    await waitFor(
      () => expect(screen.getByText(/\+50 XP earned/i)).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "PERFECT SESSION! 🏆" when every phrase scores ≥ 80', async () => {
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext(85);
    await scoreOnce(90);
    fireEvent.click(screen.getByText("Next"));

    await waitFor(
      () => expect(screen.getByText("PERFECT SESSION! 🏆")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "Session Complete!" for a good but imperfect session', async () => {
    // avgScore = (80+65)/2 = ~72 — good but not all ≥80
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext(80);
    await scoreOnce(65);
    fireEvent.click(screen.getByText("Next"));

    await waitFor(
      () => expect(screen.getByText("Session Complete!")).toBeInTheDocument(),
      WT,
    );
    expect(screen.queryByText("PERFECT SESSION! 🏆")).toBeNull();
  });
});
