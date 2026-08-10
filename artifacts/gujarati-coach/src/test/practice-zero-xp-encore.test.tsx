import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Zero-XP encore (owner rule): a phrase that earns NO XP comes back at the END
// of the session and keeps coming back until it earns something. Three zeros
// of ANY kind release it — owner-ruled that a nocatch burns a strike too, so a
// dead mic can never trap the learner in a session that will not end.
//
// These tests drive the REAL practice page through full record -> result
// cycles. Silent mode is on throughout so each phrase lands straight in idle
// and the coach-playback plumbing stays out of the way.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  silentMode: true,
  // Per-phrase scripted evaluation results, consumed in order.
  plan: [] as Array<{ xp: number; band: string }>,
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

const phraseA = { id: 10, nativeScript: "નમસ્તે", romanized: "namaste", english: "hello" };
const phraseB = { id: 11, nativeScript: "આભાર", romanized: "aabhar", english: "thank you" };

const ZERO = { xp: 0, band: "retry" };
const EARNED = { xp: 6, band: "good" };

beforeEach(() => {
  h.silentMode = true;
  h.plan = [];
  h.categoryPhrases = {
    data: [phraseA, phraseB],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  h.reviewPhrases = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.evaluate.mockReset().mockImplementation(async () => {
    const next = h.plan.shift() ?? ZERO;
    return {
      score: next.xp > 0 ? 70 : 30,
      band: next.band,
      passed: next.xp > 0,
      xpAwarded: next.xp,
      feedback: "Keep going.",
      tip: "",
      transcript: "namste",
      transcriptRomanized: "",
      evaluationToken: "signed-token",
    };
  });
});

/** Hold the belly to record, then release to submit. */
async function holdAndRelease() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
  );
  await act(async () => {
    fireEvent.pointerUp(document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement);
  });
}

/** The forward button: "Next phrase" on a retry card, "Next" otherwise. */
function forwardButton(): HTMLButtonElement | null {
  return (screen.queryByRole("button", { name: "Next phrase" }) ??
    screen.queryByRole("button", { name: "Next" })) as HTMLButtonElement | null;
}

/** One full attempt on whatever phrase is showing, landing on the result card. */
async function attempt() {
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
  await holdAndRelease();
  await waitFor(() => expect(forwardButton()).not.toBeNull());
}

async function goForward() {
  await act(async () => {
    fireEvent.click(forwardButton()!);
  });
}

describe("zero-XP encore", () => {
  test("a phrase that earned nothing comes back after the last phrase", async () => {
    h.plan = [ZERO, EARNED]; // A earns nothing, B earns XP
    renderPage(<Practice />);

    await attempt();
    // The card says what is about to happen — the learner should not be
    // surprised when the phrase reappears.
    expect(screen.getByTestId("encore-note")).toHaveTextContent(
      "No XP yet, so this one comes back at the end of the session.",
    );
    await goForward();

    // Phrase B, scored fine, is the last of the base list.
    await waitFor(() => expect(screen.getByText("aabhar")).toBeInTheDocument());
    await attempt();
    expect(screen.queryByTestId("encore-note")).not.toBeInTheDocument();
    await goForward();

    // Not the summary: phrase A is back, and labelled as a return visit.
    await waitFor(() => expect(screen.getByText("namaste")).toBeInTheDocument());
    expect(screen.getByTestId("encore-chip")).toHaveTextContent("Another go");
    expect(screen.queryByText("Session Complete!")).not.toBeInTheDocument();
  });

  test("earning anything on the encore settles it and ends the session", async () => {
    h.plan = [ZERO, EARNED, EARNED]; // A zero, B earns, A earns on its second go
    renderPage(<Practice />);

    await attempt();
    await goForward();
    await attempt();
    await goForward();
    await waitFor(() => expect(screen.getByTestId("encore-chip")).toBeInTheDocument());

    // Scoring on the return visit clears the debt: forward now ends the run.
    await attempt();
    expect(screen.queryByTestId("encore-note")).not.toBeInTheDocument();
    await goForward();
    await waitFor(() => expect(screen.getByText("Session Complete!")).toBeInTheDocument());
  });

  test("three zeros of any kind release the phrase", async () => {
    // A: zero, zero (encore), nocatch (encore) — the third zero is a system
    // miss, which the owner ruled still burns a strike.
    h.plan = [ZERO, EARNED, ZERO, { xp: 0, band: "nocatch" }];
    renderPage(<Practice />);

    await attempt(); // A, strike 1
    await goForward();
    await attempt(); // B, earns
    await goForward();

    await waitFor(() => expect(screen.getByTestId("encore-chip")).toBeInTheDocument());
    await attempt(); // A, strike 2
    expect(screen.getByTestId("encore-note")).toHaveTextContent("comes back at the end");
    await goForward();

    // Third and final visit.
    await waitFor(() => expect(screen.getByText("namaste")).toBeInTheDocument());
    await attempt(); // A, strike 3 (nocatch)
    expect(screen.getByTestId("encore-note")).toHaveTextContent(
      "That's three goes — we'll leave this one for next time.",
    );
    await goForward();

    // Released: the session ends instead of asking a fourth time.
    await waitFor(() => expect(screen.getByText("Session Complete!")).toBeInTheDocument());
  });

  test("a session where everything earns XP never detours", async () => {
    h.plan = [EARNED, EARNED];
    renderPage(<Practice />);

    await attempt();
    expect(screen.queryByTestId("encore-note")).not.toBeInTheDocument();
    await goForward();
    await attempt();
    await goForward();

    await waitFor(() => expect(screen.getByText("Session Complete!")).toBeInTheDocument());
    expect(screen.queryByTestId("encore-chip")).not.toBeInTheDocument();
  });
});
