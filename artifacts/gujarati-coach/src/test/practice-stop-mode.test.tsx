import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the stop-mode toggle (manual vs auto-stop on silence) and the visible
// error states of the evaluation flow: failures must show an actionable
// message with a retry, never a silent reset to the idle mic button.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  lastStartOptions: undefined as undefined | { onSilence?: () => void },
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
  useNativeText: () => ({ style: {}, dir: "ltr" as const }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
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
  audioInstances.length = 0;
  h.lastStartOptions = undefined;
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
    feedback: "Great!",
    tip: "Keep going.",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockImplementation(async (opts?: { onSilence?: () => void }) => {
    h.lastStartOptions = opts;
  });
  h.stopRecording.mockReset().mockResolvedValue(makeBlob());
});

async function reachIdle() {
  renderPage(<Practice />);
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  await act(async () => {
    audioInstances[0].onended?.();
  });
  await waitFor(() => expect(screen.getByText("Tap, then speak")).toBeInTheDocument());
}

function micButton() {
  return screen.getByText("Tap, then speak").parentElement!.querySelector("button")!;
}

describe("stop-mode toggle", () => {
  test("defaults to auto-stop: silence detection is armed", async () => {
    await reachIdle();
    expect(screen.getByText("Auto-stop")).toBeInTheDocument();
    fireEvent.click(micButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    expect(h.lastStartOptions?.onSilence).toBeTypeOf("function");
    expect(screen.getByText("Listening... stops on its own")).toBeInTheDocument();
  });

  test("manual mode disables silence detection and persists the choice", async () => {
    await reachIdle();
    fireEvent.click(screen.getByText("I'll tap stop"));
    expect(localStorage.getItem("bolo.stopMode")).toBe("manual");

    fireEvent.click(micButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    expect(h.lastStartOptions).toBeUndefined();
    expect(screen.getByText("Listening... tap to stop")).toBeInTheDocument();
  });

  test("a persisted manual preference is restored on mount", async () => {
    localStorage.setItem("bolo.stopMode", "manual");
    await reachIdle();
    expect(screen.getByText("I'll tap stop")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(micButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    expect(h.lastStartOptions).toBeUndefined();
  });

  test("switching to manual mid-recording disarms a pending auto-stop", async () => {
    await reachIdle();
    fireEvent.click(micButton());
    await waitFor(() => expect(h.lastStartOptions?.onSilence).toBeTypeOf("function"));

    fireEvent.click(screen.getByText("I'll tap stop"));
    await act(async () => {
      h.lastStartOptions!.onSilence!();
    });
    // Still recording — silence must not have ended the attempt.
    expect(h.stopRecording).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
  });
});

describe("evaluation error surfacing", () => {
  async function recordAndStop() {
    fireEvent.click(micButton());
    await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
    // Tap the (now stop) button to end the recording manually.
    const stopBtn = document.querySelector("button.w-28")!;
    await act(async () => {
      fireEvent.click(stopBtn);
    });
  }

  test("a failed scoring request shows an error card with retry, not a silent reset", async () => {
    h.evaluate.mockRejectedValue(new MockApiError(502));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText("Oops, that didn't work")).toBeInTheDocument(),
    );
    expect(screen.getByText(/couldn't process that recording/i)).toBeInTheDocument();

    // Retry recovers cleanly back to the mic.
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("Tap, then speak")).toBeInTheDocument());
  });

  test("a network failure explains the connection problem", async () => {
    h.evaluate.mockRejectedValue(new TypeError("Failed to fetch"));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument(),
    );
  });

  test("an empty recording surfaces a microphone message instead of uploading", async () => {
    h.stopRecording.mockResolvedValue(makeBlob(0));
    await reachIdle();
    await recordAndStop();

    await waitFor(() =>
      expect(screen.getByText(/didn't capture any audio/i)).toBeInTheDocument(),
    );
    expect(h.evaluate).not.toHaveBeenCalled();
  });

  test("the score survives a failed attempt save, with a visible note", async () => {
    h.createAttempt.mockRejectedValue(new MockApiError(500));
    await reachIdle();
    await recordAndStop();

    await waitFor(() => expect(screen.getByText("Score: 90")).toBeInTheDocument());
    expect(screen.getByText(/couldn't be saved to your progress/i)).toBeInTheDocument();
  });
});
