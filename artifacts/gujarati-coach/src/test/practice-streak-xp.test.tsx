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
  useSpeechCapability: () => "supported" as const,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    getAmplitude: () => 0,
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", async () => {
  const { apiClientMockDefaults } = await import(
    "@/test-helpers/api-client-mock"
  );
  return {
    ...apiClientMockDefaults,
    // Test-out mode is idle in these suites (no ?mode=testout).
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"],
  useSubmitLessonGroupTestout: () => ({ mutate: vi.fn(), data: undefined, isError: false, error: null, isPending: false }),
  useReportPhrase: () => ({ mutate: vi.fn() }),
  // Group mode is idle in these suites (no ?group= param).
  useListLessonGroupPhrases: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  getListLessonGroupPhrasesQueryKey: () => ["lesson-group-phrases"],
  getListCategoryLessonGroupsQueryKey: () => ["category-lesson-groups"],
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
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: () => ["progress-summary"],
  getListRecentAttemptsQueryKey: () => ["recent-attempts"],
  getListBadgesQueryKey: () => ["badges"],
  };
});

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
const WT = { timeout: 20000 };

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
  await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(), WT);
}

type Band = "great" | "good" | "retry" | "nocatch";

function bandLabel(band: Band): string {
  return band === "great" ? "Amazing!" : band === "good" ? "Nice work!" : "Good try, keep going!";
}

/**
 * Score one phrase: hold → release → wait for the band result card.
 * Resets h.startRecording so the waitFor sees a fresh call each time.
 */
async function scoreOnce(band: Band = "great", xpAwarded = 10) {
  h.evaluate.mockResolvedValueOnce({
    band,
    passed: band === "great" || band === "good",
    xpAwarded,
    feedback: "Good!",
    tip: "Keep it up.",
    evaluationToken: "tok",
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
  await waitFor(() => expect(screen.getByText(bandLabel(band))).toBeInTheDocument(), WT);
}

/** Score a phrase and advance to the next one. */
async function scoreAndNext(band: Band = "great", xpAwarded = 10) {
  await scoreOnce(band, xpAwarded);
  fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));
  await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(), WT);
}

beforeEach(() => {
  localStorage.clear();
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.evaluate.mockReset().mockResolvedValue({
    band: "great",
    passed: true,
    xpAwarded: 10,
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
  test('shows "🔥 3 in a row!" after three consecutive nailed/close bands', async () => {
    await reachIdle(phrases.slice(0, 3));

    await scoreAndNext("good");
    await scoreAndNext("great");
    // Third consecutive passing band — toast fires
    await scoreOnce("great");

    await waitFor(
      () => expect(screen.getByText("🔥 3 in a row!")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "🔥🔥 On a roll!" after five consecutive nailed/close bands', async () => {
    await reachIdle(phrases.slice(0, 5));

    await scoreAndNext("good");
    await scoreAndNext("great");
    await scoreAndNext("great");
    await scoreAndNext("good");
    // Fifth consecutive passing band — "On a roll!" fires
    await scoreOnce("great");

    await waitFor(
      () => expect(screen.getByText("🔥🔥 On a roll!")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "🔥🔥🔥 UNSTOPPABLE!" after ten consecutive nailed/close bands', async () => {
    const tenPhrases = Array.from({ length: 10 }, (_, i) => ({
      id: 200 + i,
      nativeScript: `p10-${i}`,
      romanized: `r10-${i}`,
      english: `e10-${i}`,
    }));
    await reachIdle(tenPhrases);

    for (let i = 0; i < 9; i++) {
      await scoreAndNext("great");
    }
    // Tenth consecutive passing band — "UNSTOPPABLE!" fires
    await scoreOnce("great");

    await waitFor(
      () => expect(screen.getByText("🔥🔥🔥 UNSTOPPABLE!")).toBeInTheDocument(),
      WT,
    );
  }, 30000);

  test("resets the streak counter after a retry band", async () => {
    await reachIdle(phrases.slice(0, 3));

    await scoreAndNext("great");  // streak = 1
    await scoreAndNext("retry", 0);  // streak resets to 0
    await scoreOnce("great");     // streak = 1 — no "3 in a row" toast yet

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

    await scoreAndNext("great"); // index 0 → 1
    await scoreOnce("great");    // index 1 — next click will go to index 2
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));
    await waitFor(
      () => expect(screen.getByText("Halfway there! 💪")).toBeInTheDocument(),
      WT,
    );
  });

  test('fires "Last one! 🦜 Finish strong!" exactly once on the final phrase', async () => {
    await reachIdle(fourPhrases);

    await scoreAndNext("great"); // → index 1
    await scoreAndNext("great"); // → index 2
    await scoreOnce("great");    // index 2 — next click will go to index 3 (last)
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));
    await waitFor(
      () => expect(screen.getByText("Last one! 🦜 Finish strong!")).toBeInTheDocument(),
      WT,
    );
  });

  test("each mid-session toast fires at most once per session", async () => {
    await reachIdle(fourPhrases);

    await scoreAndNext("great"); // → 1
    await scoreOnce("great");
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ })); // → 2, halfway toast
    await waitFor(() => expect(screen.getByText("Halfway there! 💪")).toBeInTheDocument(), WT);

    await scoreOnce("great");
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ })); // → 3, last toast
    await waitFor(() => expect(screen.getByText("Last one! 🦜 Finish strong!")).toBeInTheDocument(), WT);

    expect(screen.queryAllByText("Halfway there! 💪").length).toBeLessThanOrEqual(1);
    expect(screen.queryAllByText("Last one! 🦜 Finish strong!").length).toBeLessThanOrEqual(1);
  });

  test("halfway toast does not fire for sessions with fewer than 4 phrases", async () => {
    await reachIdle(phrases.slice(0, 3)); // 3 phrases — below the 4-phrase guard

    await scoreAndNext("great"); // → 1
    await scoreOnce("great");
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ })); // → 2, no halfway toast

    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText("Halfway there! 💪")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Band display
// ---------------------------------------------------------------------------
describe("band display", () => {
  test("shows the nailed tagline after a nailed band", async () => {
    await reachIdle(phrases.slice(0, 1));
    await scoreOnce("great");
    expect(screen.getByText("Amazing!")).toBeInTheDocument();
  });

  test("shows the close tagline after a close band", async () => {
    await reachIdle(phrases.slice(0, 1));
    await scoreOnce("good", 5);
    expect(screen.getByText("Nice work!")).toBeInTheDocument();
  });

  test("shows the retry tagline after a retry band", async () => {
    await reachIdle(phrases.slice(0, 1));
    await scoreOnce("retry", 0);
    expect(screen.getByText("Good try, keep going!")).toBeInTheDocument();
  });

  test("no numeric score element is ever rendered in the result card", async () => {
    await reachIdle(phrases.slice(0, 1));
    await scoreOnce("great");
    expect(screen.queryByText(/Score:/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session-summary XP chip
// ---------------------------------------------------------------------------
describe("session summary XP chip", () => {
  test("shows the total XP earned on the summary screen", async () => {
    // Two phrases, xpAwarded 8 each → totalXp = 16
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext("great", 8);
    await scoreOnce("great", 8);
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));

    await waitFor(
      () => expect(screen.getByText(/\+16 XP earned/i)).toBeInTheDocument(),
      WT,
    );
  });

  test("shows the correct total XP for a mixed-band session", async () => {
    // nailed (10 XP) + close (5 XP) = 15 XP
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext("great", 10);
    await scoreOnce("good", 5);
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));

    await waitFor(
      () => expect(screen.getByText(/\+15 XP earned/i)).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "PERFECT SESSION! 🏆" when every phrase is nailed', async () => {
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext("great");
    await scoreOnce("great");
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));

    await waitFor(
      () => expect(screen.getByText("PERFECT SESSION! 🏆")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "Session Complete!" when at least one phrase is not nailed', async () => {
    // One nailed, one close — passes but not perfect
    await reachIdle(phrases.slice(0, 2));

    await scoreAndNext("great");
    await scoreOnce("good", 5);
    fireEvent.click(screen.getByRole("button", { name: /^Next( phrase)?$/ }));

    await waitFor(
      () => expect(screen.getByText("Session Complete!")).toBeInTheDocument(),
      WT,
    );
    expect(screen.queryByText("PERFECT SESSION! 🏆")).toBeNull();
  });
});
