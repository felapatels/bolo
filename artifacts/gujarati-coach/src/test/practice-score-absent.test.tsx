/**
 * Acceptance item 5 — web app.
 *
 * Confirms the practice screen renders correctly when the evaluate response
 * carries NO score field. This is the test that de-risks removing score from
 * the API response entirely: if it passes, the later field removal is safe.
 *
 * The test verifies:
 *   1. No JavaScript/React error is thrown during the result-card render.
 *   2. The BandPill (or its accessible label) is present in the DOM.
 *   3. The old "Score: N" element is absent — no stale score UI is shown.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ── Hoisted mocks (same pattern as the rest of the practice test suite) ──────
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

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
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
    constructor(status: number) { super(`HTTP ${status}`); this.status = status; }
  },
  useListCategoryPhrases: () => h.categoryPhrases,
  useListCategorySentences: () => ({
    data: undefined, isLoading: false, isError: false, error: null,
    isFetching: false, refetch: vi.fn(),
  }),
  getListCategorySentencesQueryKey: () => ["category-sentences"],
  useListReviewPhrases: () => ({
    data: undefined, isLoading: false, isError: false, error: null,
    isFetching: false, refetch: vi.fn(),
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
}));

import Practice from "@/pages/practice";

class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

const WT = { timeout: 8000 };

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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("bolo.silentMode", "on");
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.stopRecording.mockReset().mockResolvedValue(makeBlob());
  h.categoryPhrases = {
    data: [
      { id: 10, nativeScript: "ક", romanized: "ka", english: "ka" },
    ],
    isLoading: false, isError: false, error: null,
    isFetching: false, refetch: vi.fn(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Trigger one record → evaluate cycle and wait for the result card. */
async function triggerRecording() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled(), WT);
  await act(async () => {
    const release =
      (document.querySelector('[aria-label="Release to submit"]') ?? belly) as HTMLButtonElement;
    fireEvent.pointerUp(release);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("acceptance item 5 — score absent from evaluate response", () => {
  test("renders the result card without crashing when score is omitted (nailed band)", async () => {
    // Evaluate returns band/xpAwarded but NO score field — the shape the
    // server will eventually send once score is fully removed.
    h.evaluate.mockResolvedValueOnce({
      band: "great",
      passed: true,
      xpAwarded: 10,
      feedback: "Great work!",
      tip: "Keep it up.",
      evaluationToken: "tok",
      // score intentionally absent
    });

    renderPage(<Practice />);
    await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(), WT);
    await triggerRecording();

    // The result card should appear with the nailed-band tagline.
    await waitFor(
      () => expect(screen.getByText("Amazing!")).toBeInTheDocument(),
      WT,
    );

    // The old score element must not be present.
    expect(screen.queryByText(/Score:/)).toBeNull();
  });

  test("renders the result card without crashing when score is omitted (close band)", async () => {
    h.evaluate.mockResolvedValueOnce({
      band: "good",
      passed: true,
      xpAwarded: 5,
      feedback: "Almost there.",
      tip: null,
      evaluationToken: "tok",
      // score intentionally absent
    });

    renderPage(<Practice />);
    await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(), WT);
    await triggerRecording();

    await waitFor(
      () => expect(screen.getByText("Nice work!")).toBeInTheDocument(),
      WT,
    );
    expect(screen.queryByText(/Score:/)).toBeNull();
  });

  test("renders the result card without crashing when score is omitted (retry band)", async () => {
    h.evaluate.mockResolvedValueOnce({
      band: "retry",
      passed: false,
      xpAwarded: 0,
      feedback: "Try again.",
      tip: null,
      evaluationToken: "tok",
      // score intentionally absent
    });

    renderPage(<Practice />);
    await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(), WT);
    await triggerRecording();

    await waitFor(
      () => expect(screen.getByText("Good try, keep going!")).toBeInTheDocument(),
      WT,
    );
    expect(screen.queryByText(/Score:/)).toBeNull();
  });
});
