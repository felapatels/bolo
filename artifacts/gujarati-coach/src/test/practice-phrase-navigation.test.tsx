import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Task #973: manual prev/next phrase navigation in practice sessions.
//
// Navigation is FREE (never attempt-gated) and side-effect free: it always
// lands in "idle" (never coach playback), triggers no recording or scoring,
// and preserves every phrase's attempts and bestScore regardless of visit
// order (sessionResults is keyed by phrase id). Prev is disabled on the first
// phrase, next on the last. Test-out mode (one take per phrase, forward only)
// renders no controls at all. Keyboard left/right arrows mirror the buttons.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  testout: {} as Record<string, unknown>,
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
    getLastDurationSeconds: () => 2,
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

vi.mock("@workspace/api-client-react", async () => {
  const idle = () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  return {
    ...(await (await import("./api-client-mock")).baseApiClientMock()),
    useGetLessonGroupTestout: () => h.testout,
    getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"],
    useSubmitLessonGroupTestout: () => ({
      mutate: vi.fn(),
      data: undefined,
      isError: false,
      error: null,
      isPending: false,
    }),
    useReportPhrase: () => ({ mutate: vi.fn() }),
    useListLessonGroupPhrases: () => idle(),
    getListLessonGroupPhrasesQueryKey: () => ["lesson-group-phrases"],
    getListCategoryLessonGroupsQueryKey: () => ["category-lesson-groups"],
    ApiError: class extends Error {},
    useListCategoryPhrases: () => h.categoryPhrases,
    useListCategorySentences: () => idle(),
    getListCategorySentencesQueryKey: () => ["category-sentences"],
    useListReviewPhrases: () => idle(),
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

// Imported after the mocks are declared.
import Practice from "@/pages/practice";

// jsdom's Audio can't play; capture instances so tests can both end coach
// playback deterministically and assert navigation constructs NO new audio.
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

function renderPage(path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{(<Practice />) as ReactElement}</Router>);
}

const phrase = (id: number, romanized: string) => ({
  id,
  nativeScript: `સ્ક્રિપ્ટ${id}`,
  romanized,
  english: `english ${id}`,
});

const loaded = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: vi.fn(),
});

const prevBtn = () => screen.getByTestId("button-prev-phrase") as HTMLButtonElement;
const nextBtn = () => screen.getByTestId("button-next-phrase") as HTMLButtonElement;

/** Settle effects, then wait for the given phrase/counter to be on screen. */
async function expectOnPhrase(romanized: string, counter: string) {
  await act(async () => {});
  await waitFor(() => expect(screen.getByText(romanized)).toBeInTheDocument());
  expect(screen.getByText(counter)).toBeInTheDocument();
}

/** Hold the belly to record, release to submit, wait for the result card. */
async function attemptCurrentPhrase() {
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
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
  await waitFor(() =>
    expect(
      // "Try again" is the retry-band card's primary; other bands show the
      // quieter "Retry" instead. Either one means the result card is up.
      screen.getByRole("button", { name: /^(Try again|Retry)$/ }),
    ).toBeInTheDocument(),
  );
}

beforeEach(() => {
  localStorage.clear();
  // clear() wipes the suite-wide setup.ts default, so restore it: these tests
  // drive the phrase-only coach chain and must keep the spoken English
  // meaning segment (Task 1003) off.
  localStorage.setItem("bolo.meaningAudio", "off");
  audioInstances.length = 0;
  h.silentMode = true;
  h.categoryPhrases = loaded([
    phrase(1, "phrase-1"),
    phrase(2, "phrase-2"),
    phrase(3, "phrase-3"),
  ]);
  h.testout = loaded(undefined);
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

describe("practice manual prev/next navigation (task 973)", () => {
  test("controls render with prev disabled on the first phrase and next disabled on the last", async () => {
    renderPage();
    await expectOnPhrase("phrase-1", "1/3");

    expect(prevBtn().disabled).toBe(true);
    expect(nextBtn().disabled).toBe(false);

    fireEvent.click(nextBtn());
    await expectOnPhrase("phrase-2", "2/3");
    expect(prevBtn().disabled).toBe(false);
    expect(nextBtn().disabled).toBe(false);

    fireEvent.click(nextBtn());
    await expectOnPhrase("phrase-3", "3/3");
    expect(nextBtn().disabled).toBe(true);
    expect(prevBtn().disabled).toBe(false);

    // Free navigation goes backward just as freely: no attempt was ever made.
    fireEvent.click(prevBtn());
    await expectOnPhrase("phrase-2", "2/3");
  });

  test("navigation lands in idle with no playback even when phrase audio is on", async () => {
    h.silentMode = false;
    renderPage();

    // Coach plays phrase 1; finish playback to reach idle.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    await act(async () => {
      audioInstances[0].onended?.();
    });
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
    );

    const audioCountBefore = audioInstances.length;
    fireEvent.click(nextBtn());
    await expectOnPhrase("phrase-2", "2/3");

    // Idle, not playing_coach: the hold prompt is up, "Listen first" is not,
    // and no new audio element was ever constructed by the navigation.
    expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument();
    expect(screen.queryByText(/Listen first/)).not.toBeInTheDocument();
    expect(audioInstances.length).toBe(audioCountBefore);
  });

  test("attempts and bestScore survive any visit order, and navigating off a result clears the card", async () => {
    h.categoryPhrases = loaded([phrase(1, "phrase-1"), phrase(2, "phrase-2")]);
    // Both attempts must EARN XP here: a zero-XP attempt now comes back for an
    // encore at the end of the session (see practice-zero-xp-encore), which
    // would keep this navigation test out of the summary it is checking.
    h.evaluate.mockResolvedValue({
      score: 85,
      band: "great",
      passed: true,
      xpAwarded: 5,
      feedback: "Nice!",
      tip: "",
      evaluationToken: "signed-token",
    });
    renderPage();
    await expectOnPhrase("phrase-1", "1/2");

    // Score an attempt on phrase 1, then navigate AWAY FROM THE RESULT CARD.
    await attemptCurrentPhrase();
    fireEvent.click(nextBtn());
    await expectOnPhrase("phrase-2", "2/2");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    // Wander back and forth; nothing recorded, nothing lost.
    fireEvent.click(prevBtn());
    await expectOnPhrase("phrase-1", "1/2");
    fireEvent.click(nextBtn());
    await expectOnPhrase("phrase-2", "2/2");

    // Score phrase 2, then auto-advance off the last phrase into the summary:
    // BOTH results are still there, so phrase 1's attempt survived the
    // detour (sessionResults is keyed by phrase id, not visit order).
    await attemptCurrentPhrase();
    // Scoring attempts get the plain "Next" primary (the "Next phrase"
    // secondary only appears on retry-band cards).
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByText("You practiced 2 phrases.")).toBeInTheDocument(),
    );
  });

  test("keyboard left/right arrows mirror the controls", async () => {
    renderPage();
    await expectOnPhrase("phrase-1", "1/3");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await expectOnPhrase("phrase-2", "2/3");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await expectOnPhrase("phrase-1", "1/3");

    // Edge: ArrowLeft on the first phrase is a no-op, not a crash or wrap.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await expectOnPhrase("phrase-1", "1/3");
  });

  test("test-out mode renders no manual navigation controls", async () => {
    h.categoryPhrases = loaded(undefined);
    h.testout = loaded({
      phrases: [phrase(1, "phrase-1"), phrase(2, "phrase-2")],
      sampleSize: 2,
      requiredCorrect: 2,
    });
    renderPage("/practice/1?group=901&mode=testout");
    await act(async () => {});
    await waitFor(() => expect(screen.getByTestId("testout-banner")).toBeInTheDocument());

    expect(screen.queryByTestId("button-prev-phrase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-next-phrase")).not.toBeInTheDocument();
  });
});
