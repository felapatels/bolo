import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the spoken-feedback read-aloud: when a score lands, the coach's
// feedback + tip are synthesized and played — unless the "Spoken feedback"
// preference (bolo.spokenFeedback) is off, in which case only the
// target-phrase playback happens.
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
    score: 90,
    feedback: "Nice work on that greeting!",
    tip: "Soften the t sound.",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
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

async function recordAndScore() {
  fireEvent.click(micButton());
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  const stopBtn = document.querySelector("button.w-28")!;
  await act(async () => {
    fireEvent.click(stopBtn);
  });
  await waitFor(() => expect(screen.getByText("Score: 90")).toBeInTheDocument());
}

describe("spoken feedback after scoring", () => {
  test("reads the feedback and tip aloud by default", async () => {
    await reachIdle();
    await recordAndScore();

    await waitFor(() => expect(h.synth).toHaveBeenCalledTimes(2));
    expect(h.synth).toHaveBeenLastCalledWith({
      data: { text: "Nice work on that greeting! Soften the t sound." },
    });
  });

  test("stays silent when the preference is off", async () => {
    localStorage.setItem("bolo.spokenFeedback", "off");
    await reachIdle();
    await recordAndScore();

    // Give any (wrong) feedback synthesis a chance to fire.
    await act(async () => {
      await Promise.resolve();
    });
    // Only the target-phrase playback happened.
    expect(h.synth).toHaveBeenCalledTimes(1);
  });
});
