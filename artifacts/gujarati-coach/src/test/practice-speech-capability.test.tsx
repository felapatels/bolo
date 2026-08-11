import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the per-language speech-recognition behaviour on the Practice page:
//   1. "unsupported" languages switch to listen-record-compare (ear-training):
//      no evaluation request is ever sent, and the compare stage appears.
//   2. "degraded" languages show a one-time "feedback is approximate" notice,
//      persisted per language code so it never reappears.
//   3. "supported" (default) behaviour is unchanged — the evaluation runs.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  silentMode: false,
  speechCapability: "supported" as "supported" | "degraded" | "unsupported",
  activeLang: "gu",
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => h.silentMode,
  saveSilentMode: vi.fn(),
  SILENT_MODE_STORAGE_KEY: "bolo.silentMode",
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: h.activeLang, name: "Kashmiri", nativeName: "کٲشُر" }],
    activeLang: h.activeLang,
    activeLanguage: { code: h.activeLang, name: "Kashmiri", nativeName: "کٲشُر" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
  useSpeechCapability: () => h.speechCapability,
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

import Practice from "@/pages/practice";

// jsdom's Audio can't play; capture instances so tests can end playback.
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

// jsdom lacks object-URL helpers used by ear-training playback.
vi.stubGlobal("URL", Object.assign(URL, {
  createObjectURL: vi.fn(() => "blob:mock"),
  revokeObjectURL: vi.fn(),
}));

function renderPage(ui: ReactElement, path = "/learn/1") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

const phrase = { id: 10, nativeScript: "नमस्ते", romanized: "namaste", english: "hello" };
const phrase2 = { id: 11, nativeScript: "आभाર", romanized: "aabhar", english: "thank you" };

beforeEach(() => {
  audioInstances.length = 0;
  h.silentMode = false;
  h.speechCapability = "supported";
  h.activeLang = "gu";
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
  try {
    localStorage.clear();
    // clear() wipes the suite-wide setup.ts default, so restore it: these tests
    // drive the phrase-only coach chain and must keep the spoken English
    // meaning segment (Task 1003) off.
    localStorage.setItem("bolo.meaningAudio", "off");
  } catch {
    /* ignore */
  }
});

const coachCalls = () =>
  h.synth.mock.calls.filter((c) => (c[0] as any)?.data?.text === phrase.nativeScript).length;

/** Hold belly to record, then release to submit. */
async function holdAndRelease() {
  const belly = document.querySelector('[aria-label="Hold to speak"], [aria-label="Hold to record"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
  );
  await act(async () => {
    const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
    fireEvent.pointerUp(releaseTarget);
  });
}

/** Advance through intro -> coach playback -> idle so the belly zone is ready. */
async function driveToIdle() {
  renderPage(<Practice />);
  await waitFor(() => expect(coachCalls()).toBe(1));
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  await act(async () => {
    audioInstances[0].onended?.();
  });
  await waitFor(() =>
    expect(
      document.querySelector('[aria-label="Hold to speak"], [aria-label="Hold to record"]'),
    ).not.toBeNull(),
  );
}

describe("unsupported language: ear-training mode", () => {
  test("never sends an evaluation request and shows the compare stage", async () => {
    h.speechCapability = "unsupported";
    h.activeLang = "mni";

    await driveToIdle();

    // The supportive ear-training explainer is present.
    expect(
      screen.getByText(/ear-training practice: listen, record, and compare/i),
    ).toBeInTheDocument();

    await holdAndRelease();

    // Compare stage appears: play the phrase, hear yourself, practice again / next.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Hear yourself/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Hear the phrase$/i })).toBeInTheDocument();
    // The same constant two-slot row as every other outcome (Task #1040),
    // and ungated here: ear-training never produces a band to earn with.
    expect(screen.getByTestId("try-again-button")).toHaveAccessibleName("Try again");
    expect(screen.getByTestId("advance-button")).toHaveAccessibleName("Next phrase");
    expect(screen.getByTestId("advance-button")).toBeEnabled();

    // Critically: no pronunciation evaluation was ever requested, and no
    // scored band verdict is shown.
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.createAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText(/Score:/)).not.toBeInTheDocument();
  });

  test("Hear yourself plays the recorded audio back", async () => {
    h.speechCapability = "unsupported";
    h.activeLang = "brx";
    await driveToIdle();
    await holdAndRelease();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Hear yourself/i })).toBeInTheDocument(),
    );
    const audioCountBefore = audioInstances.length;
    fireEvent.click(screen.getByRole("button", { name: /Hear yourself/i }));
    expect(audioInstances.length).toBe(audioCountBefore + 1);
  });
});

describe("degraded language: one-time approximate-feedback notice", () => {
  test("shows the notice, then hides it once the seen flag is stored", async () => {
    h.speechCapability = "degraded";
    h.activeLang = "ks";

    renderPage(<Practice />);

    const notice = await screen.findByText(
      /speech recognition is still learning Kashmiri, so feedback may be approximate/i,
    );
    expect(notice).toBeInTheDocument();

    // Dismiss it — the seen flag persists per language code.
    fireEvent.click(screen.getByRole("button", { name: /Dismiss notice/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/feedback may be approximate/i),
      ).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem("bolo.approxNoticeSeen.ks")).toBe("1");
  });

  test("does not show the notice again when the seen flag is already set", async () => {
    h.speechCapability = "degraded";
    h.activeLang = "sat";
    localStorage.setItem("bolo.approxNoticeSeen.sat", "1");

    renderPage(<Practice />);

    // The recording surface still renders, but the notice stays hidden.
    await waitFor(() =>
      expect(coachCalls()).toBeGreaterThanOrEqual(1),
    );
    expect(screen.queryByText(/feedback may be approximate/i)).not.toBeInTheDocument();
  });

  test("still runs scored evaluation (degraded practice is unchanged)", async () => {
    h.speechCapability = "degraded";
    h.activeLang = "ks";
    localStorage.setItem("bolo.approxNoticeSeen.ks", "1");

    await driveToIdle();
    await holdAndRelease();

    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    // The result card is up, with its constant two-slot action row.
    expect(screen.getByTestId("try-again-button")).toHaveAccessibleName("Try again");
  });
});

describe("supported language: unchanged scored practice", () => {
  test("runs the evaluation and shows a band verdict", async () => {
    h.speechCapability = "supported";
    await driveToIdle();

    // No ear-training explainer, no approximate notice.
    expect(screen.queryByText(/ear-training practice/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feedback may be approximate/i)).not.toBeInTheDocument();

    await holdAndRelease();
    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    // The result card is up, with its constant two-slot action row.
    expect(screen.getByTestId("try-again-button")).toHaveAccessibleName("Try again");
  });
});
