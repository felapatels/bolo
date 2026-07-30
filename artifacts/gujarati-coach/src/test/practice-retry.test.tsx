import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Drives the real Practice page through a full hold-to-talk record -> result
// cycle to guard the retry flow: hitting Retry on the result card must return
// through the coach-playback state so the phrase is spoken again before
// re-recording.
//
// NOTE: The old auto-stop / onSilence pattern was removed when hold-to-talk
// replaced the mic button. Recording now always uses manual stop —
// pointerDown on the belly starts recording, pointerUp ends it.
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
  ApiError: class extends Error {},
  useListCategoryPhrases: () => h.categoryPhrases,
  // Sentence stage is idle in these suites (no ?stage=sentences).
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
// playback deterministically.
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

// Second phrase has a distinct nativeScript so prefetch calls for it are not
// counted by coachCalls() (which filters on phrase.nativeScript).
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
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
});

// Count how many synth calls spoke the coach's phrase (vs feedback read-aloud).
const coachCalls = () =>
  h.synth.mock.calls.filter(
    (c) => (c[0] as any)?.data?.text === phrase.nativeScript,
  ).length;

/** The belly-zone button — aria-label reflects current recording state. */
function bellyButton(): HTMLButtonElement {
  return (
    document.querySelector('[aria-label="Hold to speak"]') ??
    document.querySelector('[aria-label="Release to submit"]')
  ) as HTMLButtonElement;
}

/** Hold belly to record, then release to submit. */
async function holdAndRelease() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  // Wait for startRecording to resolve and state to flip to "recording".
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
  );
  await act(async () => {
    const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
    fireEvent.pointerUp(releaseTarget);
  });
}

async function driveToResult() {
  renderPage(<Practice />);

  // intro -> playing_coach: the coach model synthesizes and plays.
  await waitFor(() => expect(coachCalls()).toBe(1));
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

  // Finish coach playback -> idle.
  await act(async () => {
    audioInstances[0].onended?.();
  });

  // Wait for the belly zone to appear (idle state).
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );

  // Hold and release the belly to record and submit.
  await holdAndRelease();

  await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
}

describe("web practice retry", () => {
  test("Retry replays the coach pronunciation before re-recording", async () => {
    await driveToResult();
    expect(coachCalls()).toBe(1);

    const audioCountBefore = audioInstances.length;
    fireEvent.click(screen.getByText("Retry"));

    // The retry returns through playing_coach: the phrase is spoken again
    // (replayed from the per-phrase audio cache, not re-synthesized — so the
    // model can never read a different phrase on replay) and the result card
    // is gone.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(audioCountBefore));
    expect(coachCalls()).toBe(1);
    // AnimatePresence may keep the card mounted briefly during exit; wait for it.
    await waitFor(() => expect(screen.queryByText(/Score:/)).not.toBeInTheDocument());
    // Still the same phrase.
    expect(screen.getByText("namaste")).toBeInTheDocument();
  });

  test("Next advances to the following phrase as before", async () => {
    await driveToResult();

    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText("aabhar")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/Score:/)).not.toBeInTheDocument());
  });
});

describe("web practice silent mode", () => {
  test("Silent mode ON: mic is available immediately without waiting for coach audio", async () => {
    h.silentMode = true;
    renderPage(<Practice />);

    // In silent mode the component skips playing_coach and goes straight to
    // idle — "Hold to speak" appears without any synth call.
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );
    expect(coachCalls()).toBe(0);
    expect(audioInstances.length).toBe(0);
  });

  test("Silent mode ON: Retry and Next also skip coach playback", async () => {
    h.silentMode = true;
    renderPage(<Practice />);

    // Wait for idle (no coach audio).
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );

    // Drive through a recording attempt to reach the result card.
    await holdAndRelease();
    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());

    // Retry in silent mode → straight to idle, no new audio.
    const audioCountBeforeRetry = audioInstances.length;
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );
    expect(audioInstances.length).toBe(audioCountBeforeRetry);

    // Drive another attempt to reach the result card again, then test Next.
    await holdAndRelease();
    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());

    const audioCountBeforeNext = audioInstances.length;
    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("aabhar")).toBeInTheDocument());
    expect(audioInstances.length).toBe(audioCountBeforeNext);
    expect(coachCalls()).toBe(0);
  });

  test("Silent mode OFF: prefetch does not speak the current phrase a second time", async () => {
    h.silentMode = false;
    renderPage(<Practice />);

    // Coach plays phrase 1 once.
    await waitFor(() => expect(coachCalls()).toBe(1));
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

    // Finish playback → idle. The prefetch for phrase 2 (different nativeScript)
    // may fire here, but coachCalls() must remain 1 (phrase 1 only).
    await act(async () => { audioInstances[0].onended?.(); });
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );

    expect(coachCalls()).toBe(1);
  });
});
