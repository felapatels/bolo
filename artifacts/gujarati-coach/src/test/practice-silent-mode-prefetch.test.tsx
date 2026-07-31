import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards silent-mode gating (mic is never blocked by the coach in silent mode)
// and the audio-prefetch behaviour (N+1 phrase synthesized while on phrase N).
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
  };
});

import Practice from "@/pages/practice";

// ---------------------------------------------------------------------------
// Fake Audio — tracks all instances so tests can trigger `onended`.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const phrase0 = { id: 10, nativeScript: "નમસ્તે", romanized: "namaste", english: "hello" };
const phrase1 = { id: 11, nativeScript: "આભાર", romanized: "aabhar", english: "thank you" };
const phrase2 = { id: 12, nativeScript: "ક્ષમા", romanized: "kshama", english: "sorry" };

function makeBlob(bytes = 4, type = "audio/webm") {
  return {
    size: bytes,
    type,
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

/**
 * The belly-zone button. Its aria-label toggles between "Hold to speak" (idle)
 * and "Release to submit" (recording). Returns whichever is currently rendered.
 */
function bellyButton(): HTMLButtonElement {
  return (
    document.querySelector('[aria-label="Hold to speak"]') ??
    document.querySelector('[aria-label="Release to submit"]')
  ) as HTMLButtonElement;
}

beforeEach(() => {
  localStorage.clear();
  audioInstances.length = 0;

  h.categoryPhrases = {
    data: [phrase0, phrase1, phrase2],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  h.reviewPhrases = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };

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

// ---------------------------------------------------------------------------
// Silent-mode helpers
// ---------------------------------------------------------------------------

/** Mount with silent mode ON (set in localStorage before render). */
async function renderSilent() {
  localStorage.setItem("bolo.silentMode", "on");
  renderPage(<Practice />);
  // In silent mode the page skips playing_coach and goes straight to idle.
  await waitFor(() =>
    expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(),
  );
}

/** Mount with silent mode OFF and advance through the initial coach playback to reach idle. */
async function renderNormal() {
  renderPage(<Practice />);
  // Wait for the coach audio to kick off.
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  // Simulate the coach audio finishing → state becomes idle.
  await act(async () => {
    audioInstances[0].onended?.();
  });
  // Use the belly button's aria-label (rendered as soon as bellyActive=true)
  // rather than the instruction-label text (inside AnimatePresence mode="wait"
  // which needs a real animation loop to complete its exit before entering).
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
}

/** Hold belly → wait for startRecording → release → wait for score. */
async function scoreAndNext() {
  fireEvent.pointerDown(bellyButton());
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  await act(async () => {
    const releaseTarget =
      document.querySelector('[aria-label="Release to submit"]') ?? bellyButton();
    fireEvent.pointerUp(releaseTarget);
  });
  // Wait for result screen.
  await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());
  // Tap "Next".
  fireEvent.click(screen.getByText("Next"));
}

/** Hold belly → wait for startRecording → release → wait for score. */
async function scorePhrase() {
  fireEvent.pointerDown(bellyButton());
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  await act(async () => {
    const releaseTarget =
      document.querySelector('[aria-label="Release to submit"]') ?? bellyButton();
    fireEvent.pointerUp(releaseTarget);
  });
  await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());
}

// ---------------------------------------------------------------------------
// Silent mode: load
// ---------------------------------------------------------------------------
describe("silent mode — initial load", () => {
  test("with silent mode ON, state never passes through playing_coach on first load", async () => {
    localStorage.setItem("bolo.silentMode", "on");
    renderPage(<Practice />);

    // The coach synthesizer must NOT have been called for the first phrase yet:
    // we never entered playing_coach.
    await waitFor(() =>
      expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(),
    );
    // synth may later be called for prefetch of phrase N+1, but NOT for phrase0
    // in the playing_coach path (the audio element is never created for it).
    const coachCalls = h.synth.mock.calls.filter(
      ([arg]: [{ data: { text: string } }]) => arg?.data?.text === phrase0.nativeScript,
    );
    expect(coachCalls).toHaveLength(0);
  });

  test("with silent mode OFF, state enters playing_coach before idle on first load", async () => {
    renderPage(<Practice />);
    // Coach audio starts → an Audio instance is created.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    // synth was called for the first phrase (coach playback).
    expect(h.synth).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ text: phrase0.nativeScript }) }),
    );
    // State only reaches idle once the audio finishes — belly zone not shown yet.
    expect(screen.queryByText("Hold Bolo to speak")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Silent mode: Next
// ---------------------------------------------------------------------------
describe("silent mode — next phrase", () => {
  test("with silent mode ON, advancing to the next phrase skips playing_coach", async () => {
    await renderSilent();
    await scoreAndNext();

    // Should land on idle for phrase1 directly.
    await waitFor(() =>
      expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(),
    );
    // No Audio element created for phrase1's coach playback.
    const phrase1CoachCalls = h.synth.mock.calls.filter(
      ([arg]: [{ data: { text: string } }]) => arg?.data?.text === phrase1.nativeScript,
    );
    expect(phrase1CoachCalls).toHaveLength(0);
  });

  test("with silent mode OFF, advancing to the next phrase enters playing_coach first", async () => {
    await renderNormal();
    audioInstances.length = 0; // reset so we can detect the *next* coach audio

    await scoreAndNext();

    // Coach audio for phrase1 must start.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    // We are in playing_coach — since barge-in (Task 907) the belly zone
    // stays mounted during playback, but recording has not started.
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Release to submit"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Silent mode: Retry
// ---------------------------------------------------------------------------
describe("silent mode — retry", () => {
  test("with silent mode ON, retry skips playing_coach", async () => {
    await renderSilent();
    await scorePhrase();

    // Clear synth history so we can precisely check what retry triggers.
    h.synth.mockClear();
    audioInstances.length = 0;

    fireEvent.click(screen.getByText("Retry"));

    // Should land back at idle without playing coach audio.
    await waitFor(() =>
      expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(),
    );
    // synth must NOT have been called for the coach-playback path on retry.
    // (It may still run for prefetch of phrase1, so filter for phrase0.)
    const phrase0CoachCalls = h.synth.mock.calls.filter(
      ([arg]: [{ data: { text: string } }]) => arg?.data?.text === phrase0.nativeScript,
    );
    expect(phrase0CoachCalls).toHaveLength(0);
    expect(audioInstances).toHaveLength(0);
  });

  test("with silent mode OFF, retry goes through playing_coach", async () => {
    await renderNormal();
    await scorePhrase();

    audioInstances.length = 0;
    fireEvent.click(screen.getByText("Retry"));

    // A new Audio element must appear for the coach re-play.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  });
});

// ---------------------------------------------------------------------------
// Belly zone disabled states
// ---------------------------------------------------------------------------
describe("belly zone availability", () => {
  test("belly zone is enabled in idle state", async () => {
    await renderSilent();
    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    expect(belly).not.toBeNull();
    expect(belly.disabled).toBe(false);
  });

  test("belly zone IS rendered while the coach is playing (barge-in, Task 907)", async () => {
    renderPage(<Practice />); // silent mode OFF
    // Coach audio kicks off — we're in playing_coach before onended fires.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    // Barge-in: the belly zone stays mounted during playback so a hold can
    // stop the audio and record on the same gesture. Not recording yet.
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Release to submit"]')).toBeNull();
  });

  test("belly zone is not rendered while evaluation is in flight (evaluating)", async () => {
    // Make evaluate hang so we can assert while it's in progress.
    let resolveEval!: (v: unknown) => void;
    h.evaluate.mockReturnValue(new Promise((res) => { resolveEval = res; }));

    await renderSilent();
    fireEvent.pointerDown(bellyButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());

    // Release to kick off evaluation.
    await act(async () => {
      const releaseTarget =
        document.querySelector('[aria-label="Release to submit"]') ?? bellyButton();
      fireEvent.pointerUp(releaseTarget);
    });

    // While evaluate is pending the belly zone must be hidden.
    await waitFor(() => {
      expect(document.querySelector('[aria-label="Hold to speak"]')).toBeNull();
      expect(document.querySelector('[aria-label="Release to submit"]')).toBeNull();
    });

    // Clean up: resolve so the component settles.
    await act(async () => {
      resolveEval({
        score: 90,
        band: "great",
        passed: true,
        xpAwarded: 9,
        feedback: "Great!",
        tip: "",
        evaluationToken: "tok",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Audio prefetch
// ---------------------------------------------------------------------------
describe("audio prefetch", () => {
  test("with silent mode OFF, the next phrase's audio is prefetched while on the current one", async () => {
    renderPage(<Practice />); // silent mode OFF, three phrases
    // Wait for the component to settle (coach audio for phrase0 starts).
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

    // The prefetch should fire for phrase1 (N+1) shortly after mounting.
    await waitFor(() => {
      const prefetchCall = h.synth.mock.calls.find(
        ([arg]: [{ data: { text: string } }]) =>
          arg?.data?.text === phrase1.nativeScript,
      );
      expect(prefetchCall).toBeDefined();
    });
  });

  test("with silent mode ON, no prefetch requests are sent", async () => {
    localStorage.setItem("bolo.silentMode", "on");
    renderPage(<Practice />);
    await waitFor(() =>
      expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument(),
    );

    // Allow any microtask-queued effects to settle.
    await act(async () => {});

    // In silent mode the prefetch effect bails out immediately, so synth
    // should never be called (neither for coach play nor for prefetch).
    expect(h.synth).not.toHaveBeenCalled();
  });

  test("prefetch result is served from the cache when the coach plays phrase N+1", async () => {
    renderPage(<Practice />);
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

    // Wait for the prefetch of phrase1 to complete.
    await waitFor(() => {
      const prefetchCall = h.synth.mock.calls.find(
        ([arg]: [{ data: { text: string } }]) =>
          arg?.data?.text === phrase1.nativeScript,
      );
      expect(prefetchCall).toBeDefined();
    });

    // Advance past phrase0: finish a recording, get a score, tap Next.
    await act(async () => {
      audioInstances[0].onended?.(); // finish coach for phrase0 → idle
    });
    await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument());

    fireEvent.pointerDown(bellyButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    await act(async () => {
      const releaseTarget =
        document.querySelector('[aria-label="Release to submit"]') ?? bellyButton();
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());

    // Reset synth call count so we can count only what happens during phrase1's
    // coach play.
    h.synth.mockClear();
    audioInstances.length = 0;

    fireEvent.click(screen.getByText("Next"));

    // Coach for phrase1 starts playing (new Audio instance).
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

    // synth should NOT have been called again for phrase1 because the cache hit.
    const phrase1FreshCalls = h.synth.mock.calls.filter(
      ([arg]: [{ data: { text: string } }]) =>
        arg?.data?.text === phrase1.nativeScript,
    );
    expect(phrase1FreshCalls).toHaveLength(0);
  });
});
