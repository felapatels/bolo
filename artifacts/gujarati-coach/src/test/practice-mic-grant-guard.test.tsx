import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Pin (capture-session fix, practice cousin of chat's grant guard): a mic
// permission grant by itself must NEVER produce an attempt or a result card.
//
// Repro path: first-time user presses the belly -> the permission prompt
// opens and steals focus -> window blur fires the release path while the
// recorder has not started -> the grant resolves. The old code marked the
// recording live and immediately finished it, submitting an empty take that
// surfaced as a "We didn't capture any audio" error card the user never
// earned. The guard must instead abort the just-granted recorder, return to
// idle, and let the next press start a fresh, normal recording.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  abortRecording: vi.fn(),
  silentMode: true,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => h.silentMode,
  saveSilentMode: vi.fn(),
  SILENT_MODE_STORAGE_KEY: "bolo.silentMode",
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
    abortRecording: h.abortRecording,
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"],
  useSubmitLessonGroupTestout: () => ({ mutate: vi.fn(), data: undefined, isError: false, error: null, isPending: false }),
  useReportPhrase: () => ({ mutate: vi.fn() }),
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
  ApiError: class extends Error {},
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
  useListReviewPhrases: () => h.reviewPhrases,
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

// Imported after the mocks are declared.
import Practice from "@/pages/practice";

// jsdom's Audio can't actually play; a stub keeps any stray playback inert.
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

const phrase = {
  id: 10,
  nativeScript: "નમસ્તે",
  romanized: "namaste",
  english: "hello",
};

beforeEach(() => {
  h.silentMode = true; // straight to idle: no coach playback to manage
  h.categoryPhrases = {
    data: [phrase],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  h.reviewPhrases = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.evaluate.mockReset().mockResolvedValue({
    score: 80,
    band: "good",
    passed: true,
    xpAwarded: 10,
    feedback: "Nice!",
    tip: null,
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.stopRecording.mockReset().mockResolvedValue({
    size: 4,
    type: "audio/webm",
    arrayBuffer: async () => new ArrayBuffer(4),
  });
  h.abortRecording.mockReset();
});

describe("practice mic grant guard", () => {
  test("a permission grant never produces an attempt or a result card; the next press records normally", async () => {
    renderPage(<Practice />);
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );

    // ── Phase 1: press while the permission prompt is open ──────────────
    // startRecording stays pending (browser waiting on the user's grant).
    let resolveGrant!: () => void;
    h.startRecording.mockImplementation(
      () => new Promise<void>((res) => { resolveGrant = res; }),
    );

    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    fireEvent.pointerDown(belly);

    // The permission prompt steals focus: window blur ends the hold while
    // the recorder has not started.
    await act(async () => {
      fireEvent(window, new Event("blur"));
    });

    // The user grants the permission; the recorder resolves with no live hold.
    await act(async () => {
      resolveGrant();
    });

    // Grant guard: abort, no attempt, no result/error card, back to idle.
    await waitFor(() => expect(h.abortRecording).toHaveBeenCalledTimes(1));
    expect(h.stopRecording).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Oops, that didn't work/)).not.toBeInTheDocument();
    expect(screen.queryByText(/didn't capture any audio/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );

    // ── Phase 2: the first press AFTER the grant is a fresh, normal take ─
    h.startRecording.mockImplementation(async () => {});

    fireEvent.pointerDown(
      document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
    );
    await act(async () => {
      fireEvent.pointerUp(
        document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement,
      );
    });

    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    expect(h.abortRecording).toHaveBeenCalledTimes(1); // no second abort
  });
});
