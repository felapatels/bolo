import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Min-duration guard (pilot rule): a hold shorter than MIN_CLIP_SECONDS (0.8 s)
// must never reach the evaluation endpoint. Sub-second clips transcribe as
// mangled fragments (R3 class: छह -> "achh"/"cha") and would be scored as
// retry, which counts against the learner. The guard routes them to the local
// didn't-catch card instead: no request sent, never scored, never counted.
//
// Drives the real Practice page through the hold-to-talk cycle with a
// controllable recorder duration, mirroring the practice-retry harness.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  // Wall-clock duration the mocked recorder reports for the last recording.
  lastDurationSeconds: 2,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => true, // silent mode: belly available without coach audio
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
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => ({
      size: 4,
      type: "audio/webm",
      arrayBuffer: async () => new ArrayBuffer(4),
    })),
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
    getLastDurationSeconds: () => h.lastDurationSeconds,
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

// jsdom's Audio can't play; a permissive stub keeps the page's audio wiring quiet.
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

const phrase = {
  id: 10,
  nativeScript: "છ",
  romanized: "chha",
  english: "six",
};

beforeEach(() => {
  h.lastDurationSeconds = 2;
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
    score: 42,
    band: "retry",
    passed: false,
    xpAwarded: 0,
    feedback: "Almost!",
    tip: "Slow down.",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
});

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

/** Hold belly to record, then release to submit. */
async function holdAndRelease() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
  );
  await act(async () => {
    const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
    fireEvent.pointerUp(releaseTarget);
  });
}

async function renderToIdle() {
  renderPage(<Practice />);
  // Silent mode: the belly appears without waiting for coach audio.
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
}

describe("web practice min-duration guard", () => {
  test("a clip under 0.8 s shows the local didn't-catch card and never calls evaluate", async () => {
    h.lastDurationSeconds = 0.3;
    await renderToIdle();
    await holdAndRelease();

    // The existing friendly nocatch copy, reused verbatim.
    await waitFor(() =>
      expect(screen.getByText("Didn't catch that one")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("The mic didn't pick you up clearly that time. Same phrase, one more go."),
    ).toBeInTheDocument();

    // Never sent, never scored, never counted.
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.createAttempt).not.toHaveBeenCalled();
  });

  test("a clip at or above 0.8 s still evaluates normally (guard does not overfire)", async () => {
    h.lastDurationSeconds = 0.8;
    await renderToIdle();
    await holdAndRelease();

    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Didn't catch that one")).not.toBeInTheDocument();
  });
});
