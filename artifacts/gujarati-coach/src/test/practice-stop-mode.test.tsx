import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the visible error states of the evaluation flow: failures must show
// an actionable message with a retry, never a silent reset.
//
// NOTE: The auto/manual stop-mode toggle was removed when hold-to-talk
// replaced the old mic button. Recording now always uses manual stop, the learner holds the parrot belly to record and releases to submit.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  MockApiError: class extends Error {
    status: number;
    constructor(status: number) {
      super(`HTTP ${status}`);
      this.status = status;
    }
  },
}));

const MockApiError = h.MockApiError;

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
    getLastDurationSeconds: () => 2,
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
  ApiError: h.MockApiError,
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

import Practice from "@/pages/practice";

const audioInstances: FakeAudio[] = [];
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {
    audioInstances.push(this);
  }
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

function makeBlob(bytes = 4, type = "audio/webm") {
  return {
    size: bytes,
    type,
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

beforeEach(() => {
  localStorage.clear();
  // clear() wipes the suite-wide setup.ts default, so restore it: these tests
  // drive the phrase-only coach chain and must keep the spoken English
  // meaning segment (Task 1003) off.
  localStorage.setItem("bolo.meaningAudio", "off");
  audioInstances.length = 0;
  h.categoryPhrases = {
    data: [phrase, { ...phrase, id: 11, romanized: "aabhar" }],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  h.reviewPhrases = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.evaluate.mockReset().mockResolvedValue({
    score: 90,
    band: "great",
    passed: true,
    xpAwarded: 9,
    feedback: "Great!",
    tip: "Keep going.",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.stopRecording.mockReset().mockResolvedValue(makeBlob());
});

/** Render the page with silent mode and advance to the idle "Hold to speak" state. */
async function reachIdle() {
  localStorage.setItem("bolo.silentMode", "on");
  renderPage(<Practice />);
  await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument());
}

/** The belly-zone button (aria-label changes based on recording state). */
function bellyButton(): HTMLButtonElement {
  return (
    document.querySelector('[aria-label="Hold to speak"]') ??
    document.querySelector('[aria-label="Release to submit"]')
  ) as HTMLButtonElement;
}

/** Hold the parrot belly to start recording, then release to trigger evaluation. */
async function recordAndStop() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  // After startRecording resolves the state becomes "recording"; pointerUp ends it.
  await act(async () => {
    const releaseTarget =
      document.querySelector('[aria-label="Release to submit"]') ?? belly;
    fireEvent.pointerUp(releaseTarget);
  });
}

describe("hold-to-talk recording mechanics", () => {
  test("hold-to-talk always uses manual stop, startRecording is called with no options", async () => {
    await reachIdle();
    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    fireEvent.pointerDown(belly);
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    // No onSilence callback, recording only ends on pointer release.
    expect(h.startRecording).toHaveBeenCalledWith(undefined);
  });

  test("belly zone is visible during idle state", async () => {
    await reachIdle();
    expect(bellyButton()).not.toBeNull();
    expect(bellyButton().disabled).toBe(false);
  });

  test("belly zone IS rendered while coach is speaking (barge-in, Task 907)", async () => {
    renderPage(<Practice />); // silent mode OFF → starts in playing_coach
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    // Barge-in: the belly zone stays mounted during playback so a hold can
    // stop the audio and record on the same gesture. Not recording yet.
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Release to submit"]')).toBeNull();
  });

  test("release before startRecording resolves aborts, no attempt, no result card (race condition)", async () => {
    // Capture-session grant-guard fix: a release that lands while the
    // recorder is still starting (permission prompt open, or plain
    // permission latency) captured NOTHING, the recorder wasn't running.
    // The old behavior finished-and-sent, producing an empty junk attempt
    // (surfacing as a "didn't capture any audio" error card the user never
    // earned). Now the resolve-time hold-confirmation aborts and returns to
    // idle; the next press starts a fresh, normal recording.
    let resolveStart!: () => void;
    h.startRecording.mockReturnValue(new Promise<void>((res) => { resolveStart = res; }));

    await reachIdle();

    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;

    // pointerDown triggers startRecording (which is now hanging).
    fireEvent.pointerDown(belly);
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());

    // pointerUp fires before startRecording resolves, this is the race.
    fireEvent.pointerUp(belly);

    // startRecording finally resolves, the hold is no longer live, so the
    // recorder is aborted and no evaluation is ever sent.
    await act(async () => {
      resolveStart();
    });

    expect(h.stopRecording).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(screen.queryByText("Goated 🐐")).not.toBeInTheDocument();
    expect(screen.queryByText("Didn't catch that one")).not.toBeInTheDocument();
    // Back to idle, ready for a fresh press.
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );
  });
});

describe("evaluation error surfacing", () => {
  test("a failed scoring request shows an error card with retry, not a silent reset", async () => {
    h.evaluate.mockRejectedValue(new MockApiError(502));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText("Signal trouble on the line")).toBeInTheDocument(),
    );
    expect(screen.getByText(/hiccup on our end/i)).toBeInTheDocument();

    // Retry recovers cleanly back to the belly zone.
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument());
  });

  test("a network failure explains the connection problem", async () => {
    h.evaluate.mockRejectedValue(new TypeError("Failed to fetch"));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText(/connection dropped/i)).toBeInTheDocument(),
    );
  });

  test("an empty recording surfaces a microphone message instead of uploading", async () => {
    h.stopRecording.mockResolvedValue(makeBlob(0));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText(/didn't pick you up clearly/i)).toBeInTheDocument(),
    );
    expect(h.evaluate).not.toHaveBeenCalled();
  });

  test("the score survives a failed attempt save, with a visible note", async () => {
    h.createAttempt.mockRejectedValue(new MockApiError(500));
    await reachIdle();
    await recordAndStop();

    await waitFor(() => expect(screen.getByText("Goated 🐐")).toBeInTheDocument());
    expect(screen.getByText(/couldn't be saved to your progress/i)).toBeInTheDocument();
  });
});
