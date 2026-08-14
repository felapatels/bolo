import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Build 31: Express test-out mode (?group=<id>&mode=testout). The practice
// screen runs over the server-sampled phrase set, saves NO per-phrase
// attempts, hides every retry control, and submits the collected evaluation
// tokens in one POST at the end. The verdict screen shows pass (Express
// stamp), fail (encouraging copy), or a resubmittable error.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  testout: {} as Record<string, unknown>,
  submitCalls: [] as unknown[],
  submitResult: null as unknown,
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
    getLastDurationSeconds: () => 2,
    getAmplitude: () => 0,
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", async () => {
  const React = await import("react");
  return {
    ...(await (await import("./api-client-mock")).baseApiClientMock()),
    useReportPhrase: () => ({ mutate: vi.fn() }),
    // The regular group listing must stay idle in testout mode.
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
    useGetLessonGroupTestout: () => h.testout,
    getGetLessonGroupTestoutQueryKey: () => ["lesson-group-testout"],
    // Stateful mutation stub: mutate() records the call, then resolves to the
    // configured verdict (or stays pending when submitResult is null).
    useSubmitLessonGroupTestout: (opts?: {
      mutation?: { onSuccess?: (r: unknown) => void };
    }) => {
      const [state, setState] = React.useState<{
        data: unknown;
        isError: boolean;
        error: unknown;
      }>({ data: undefined, isError: false, error: null });
      return {
        ...state,
        isPending: false,
        mutate: (vars: unknown) => {
          h.submitCalls.push(vars);
          const result = h.submitResult;
          if (result === null) return; // stays on "Checking your run..."
          if (result instanceof Error) {
            setState({ data: undefined, isError: true, error: result });
          } else {
            setState({ data: result, isError: false, error: null });
            opts?.mutation?.onSuccess?.(result);
          }
        },
      };
    },
    ApiError: h.MockApiError,
    useListCategoryPhrases: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useListCategorySentences: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    getListCategorySentencesQueryKey: () => ["category-sentences"],
    useListReviewPhrases: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
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
  };
});

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

const phraseA = { id: 10, nativeScript: "નમસ્તે", romanized: "namaste", english: "hello" };
const phraseB = { id: 11, nativeScript: "આભાર", romanized: "aabhar", english: "thank you" };

function makeBlob(bytes = 4, type = "audio/webm") {
  return {
    size: bytes,
    type,
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

function renderTestout() {
  const { hook } = memoryLocation({ path: "/practice/1?group=901&mode=testout" });
  return render(<Router hook={hook}>{(<Practice />) as ReactElement}</Router>);
}

beforeEach(() => {
  localStorage.clear();
  // clear() wipes the suite-wide setup.ts default, so restore it: these tests
  // drive the phrase-only coach chain and must keep the spoken English
  // meaning segment (Task 1003) off.
  localStorage.setItem("bolo.meaningAudio", "off");
  audioInstances.length = 0;
  h.submitCalls = [];
  h.submitResult = null;
  h.testout = {
    data: { phrases: [phraseA, phraseB], sampleSize: 2, requiredCorrect: 2 },
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

async function reachIdle() {
  localStorage.setItem("bolo.silentMode", "on");
  renderTestout();
  await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument());
}

async function recordAndStop() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  await act(async () => {
    const releaseTarget = document.querySelector('[aria-label="Release to submit"]') ?? belly;
    fireEvent.pointerUp(releaseTarget);
  });
  await waitFor(() => expect(screen.getByText("Goated 🐐")).toBeInTheDocument());
}

/** Complete the whole 2-phrase run: record, next, record, finish. */
async function finishRun() {
  await reachIdle();
  await recordAndStop();
  fireEvent.click(screen.getByTestId("advance-button"));
  await waitFor(() => expect(screen.getByText("Hold Bolo to speak")).toBeInTheDocument());
  await recordAndStop();
  await act(async () => {
    fireEvent.click(screen.getByText("Finish"));
  });
}

describe("test-out run mechanics", () => {
  test("shows the express rules banner with the server's sample numbers", async () => {
    await reachIdle();
    expect(screen.getByTestId("testout-banner")).toHaveTextContent(
      "Express check: one take per phrase. Say 2 of 2 well to skip this stop.",
    );
  });

  test("a scored phrase saves no attempt and offers no retry, only forward", async () => {
    await reachIdle();
    await recordAndStop();
    expect(h.createAttempt).not.toHaveBeenCalled();
    // One take per phrase is a server-side batch rule, so the retry slot is
    // inactive — but it is still THERE, in its usual place (Task #1040): the
    // row never collapses to a single full-width button.
    expect(screen.getByTestId("try-again-button")).toBeDisabled();
    expect(screen.getByTestId("try-again-button")).toHaveAttribute("aria-disabled", "true");
    // Test-out advancing is ungated: the learner gets one go and moves on.
    expect(screen.getByTestId("advance-button")).toBeEnabled();
  });

  test("even a retry-band score moves forward without the try-again primary", async () => {
    h.evaluate.mockResolvedValue({
      score: 30,
      band: "retry",
      passed: false,
      xpAwarded: 0,
      feedback: "Almost!",
      tip: "Slow down.",
      evaluationToken: "signed-token",
    });
    await reachIdle();
    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    fireEvent.pointerDown(belly);
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    await act(async () => {
      const releaseTarget = document.querySelector('[aria-label="Release to submit"]') ?? belly;
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(h.evaluate).toHaveBeenCalled());
    // Order and labels are constant even here (Task #1040) — the band pill
    // also reads "Try again", so address the CONTROLS by testID.
    const retry = screen.getByTestId("try-again-button");
    const advance = screen.getByTestId("advance-button");
    expect(retry.compareDocumentPosition(advance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A weak take does not earn a retry in test-out: it is one take per phrase.
    expect(retry).toBeDisabled();
    // ...and the advance stays ungated, so nobody is stranded mid-run.
    expect(advance).toBeEnabled();
    expect(advance.className).toContain("bg-primary");
  });
});

describe("test-out verdict", () => {
  test("finishing the run submits one batch of signed tokens", async () => {
    h.submitResult = { passed: true, correctCount: 2, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();
    expect(h.submitCalls).toHaveLength(1);
    expect(h.submitCalls[0]).toEqual({
      id: 901,
      data: {
        attempts: [
          { phraseId: 10, evaluationToken: "signed-token" },
          { phraseId: 11, evaluationToken: "signed-token" },
        ],
      },
    });
    expect(h.createAttempt).not.toHaveBeenCalled();
  });

  test("a pass shows the Express verdict with the journey link", async () => {
    h.submitResult = { passed: true, correctCount: 2, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();
    await waitFor(() => expect(screen.getByTestId("text-testout-passed")).toBeInTheDocument());
    expect(screen.getByTestId("link-testout-journey").getAttribute("href")).toContain("/journey");
  });

  test("a fail shows encouraging copy and returns to practicing", async () => {
    h.submitResult = { passed: false, correctCount: 1, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();
    await waitFor(() => expect(screen.getByTestId("text-testout-failed")).toBeInTheDocument());
    expect(screen.getByText(/A little more practice and this stop/)).toBeInTheDocument();
    expect(
      screen.getByTestId("link-testout-keep-practicing").getAttribute("href"),
    ).toContain("/journey");
  });

  test("while the verdict is pending the checking screen shows", async () => {
    h.submitResult = null; // mutate() never resolves
    await finishRun();
    expect(screen.getByTestId("text-testout-checking")).toBeInTheDocument();
  });
});
