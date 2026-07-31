import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Task 907: barge-in hold on web practice.
//
// One hold, at ANY moment, stops whatever audio is playing and starts
// recording on the same gesture:
//  - during the example phrase (playing_coach),
//  - while a result and its spoken feedback are on screen (result).
// Releasing evaluates as normal, and the interrupted audio never resumes on
// its own. Also covers the "We heard" transcript + romanized rendering on the
// result card (romanized hides when empty or when it would just repeat an
// already-Latin transcript).
//
// Release is observed by WINDOW-level listeners installed at hold start
// (positive hold-confirmation, chat's Task 848 pattern) — pointerUp events in
// these tests bubble from the button to window.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  silentMode: false,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => h.silentMode,
  saveSilentMode: vi.fn(),
  SILENT_MODE_STORAGE_KEY: "bolo.silentMode",
}));

// Spoken feedback ON so the result state has live feedback audio to barge into.
vi.mock("@/lib/spoken-feedback", () => ({
  loadSpokenFeedback: () => true,
  saveSpokenFeedback: vi.fn(),
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
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
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

// jsdom's Audio can't actually play; capture instances so tests can end
// playback deterministically and count play/pause calls.
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
const phrase2 = { id: 11, nativeScript: "આભાર", romanized: "aabhar", english: "thank you" };

beforeEach(() => {
  audioInstances.length = 0;
  h.silentMode = false;
  h.categoryPhrases = {
    data: [phrase, phrase2],
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
    transcript: "કેમ છો",
    transcriptRomanized: "kem cho",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
});

const coachCalls = () =>
  h.synth.mock.calls.filter(
    (c) => (c[0] as any)?.data?.text === phrase.nativeScript,
  ).length;

/** Hold belly to record, then release to submit (release bubbles to window). */
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

/** Render and drive the normal flow (coach plays to the end) to a result. */
async function driveToResult() {
  renderPage(<Practice />);
  await waitFor(() => expect(coachCalls()).toBe(1));
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  await act(async () => {
    audioInstances[0].onended?.();
  });
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
  await holdAndRelease();
  await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());
}

describe("barge-in during example playback", () => {
  test("a hold while the coach is speaking stops the audio and records on the same gesture", async () => {
    renderPage(<Practice />);

    // The coach clip is created and playing; do NOT let it finish.
    await waitFor(() => expect(coachCalls()).toBe(1));
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    const coachClip = audioInstances[0];
    expect(coachClip.pause).not.toHaveBeenCalled();

    // The hold zone is mounted DURING playback (Task 907) — hold it.
    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    expect(belly).not.toBeNull();
    fireEvent.pointerDown(belly);

    // Same gesture: playback stops and recording starts.
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
    );
    expect(coachClip.pause).toHaveBeenCalled();

    // Release evaluates as normal.
    await act(async () => {
      const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());
  });

  test("the interrupted audio never resumes after the recording completes", async () => {
    renderPage(<Practice />);
    await waitFor(() => expect(coachCalls()).toBe(1));
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    const coachClip = audioInstances[0];

    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    fireEvent.pointerDown(belly);
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
    );
    await act(async () => {
      const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());

    // The interrupted coach clip played exactly once and was never restarted.
    expect(coachClip.play).toHaveBeenCalledTimes(1);
  });
});

describe("barge-in on the result card", () => {
  test("a hold right after a retry result stops feedback audio and records again", async () => {
    await driveToResult();
    expect(h.evaluate).toHaveBeenCalledTimes(1);

    // Spoken feedback is ON, so the result state creates a feedback clip.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(2));
    const feedbackClip = audioInstances[audioInstances.length - 1];

    // The hold zone stays mounted on the result card — hold it immediately.
    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    expect(belly).not.toBeNull();
    fireEvent.pointerDown(belly);

    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
    );
    expect(feedbackClip.pause).toHaveBeenCalled();

    await act(async () => {
      const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());
  });
});

describe("We heard transcript on the result card", () => {
  test("shows the raw transcript and the romanized form", async () => {
    await driveToResult();
    expect(screen.getByText('We heard: "કેમ છો"')).toBeInTheDocument();
    expect(screen.getByText('"kem cho"')).toBeInTheDocument();
  });

  test("hides the romanized line when the server sent none", async () => {
    h.evaluate.mockResolvedValue({
      score: 42,
      band: "retry",
      passed: false,
      xpAwarded: 0,
      feedback: "Almost!",
      tip: "Slow down.",
      transcript: "کیسے ہو",
      transcriptRomanized: "",
      evaluationToken: "signed-token",
    });
    await driveToResult();
    expect(screen.getByText('We heard: "کیسے ہو"')).toBeInTheDocument();
    expect(screen.queryByText('"kem cho"')).not.toBeInTheDocument();
  });

  test("hides the romanized line when it would just repeat a Latin transcript", async () => {
    h.evaluate.mockResolvedValue({
      score: 42,
      band: "retry",
      passed: false,
      xpAwarded: 0,
      feedback: "Almost!",
      tip: "Slow down.",
      transcript: "kem cho",
      transcriptRomanized: "kem cho",
      evaluationToken: "signed-token",
    });
    await driveToResult();
    expect(screen.getByText('We heard: "kem cho"')).toBeInTheDocument();
    // Exactly one quoted rendering — the raw line, no duplicate romanized line.
    expect(screen.queryByText('"kem cho"')).not.toBeInTheDocument();
  });
});
