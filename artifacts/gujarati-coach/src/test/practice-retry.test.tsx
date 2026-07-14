import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Drives the real Practice page through a full record -> result cycle to guard
// the retry flow: hitting Retry on the result card must return through the
// coach-playback state so the phrase is spoken again before re-recording.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  onSilence: null as null | (() => void),
}));

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
    startRecording: vi.fn(async (opts?: { onSilence?: () => void }) => {
      h.onSilence = opts?.onSilence ?? null;
    }),
    stopRecording: vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(0),
      type: "audio/webm",
    })),
    abortRecording: vi.fn(),
    prepare: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
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

beforeEach(() => {
  audioInstances.length = 0;
  h.onSilence = null;
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
    score: 42,
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

async function driveToResult() {
  renderPage(<Practice />);

  // intro -> playing_coach: the coach model synthesizes and plays.
  await waitFor(() => expect(coachCalls()).toBe(1));
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));

  // Finish coach playback -> idle.
  await act(async () => {
    audioInstances[0].onended?.();
  });

  // Record, then let the silence detector finish the attempt.
  fireEvent.click(screen.getByText("Tap, then speak").parentElement!.querySelector("button")!);
  await waitFor(() => expect(h.onSilence).not.toBeNull());
  await act(async () => {
    h.onSilence!();
  });

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
    expect(screen.queryByText(/Score:/)).not.toBeInTheDocument();
    // Still the same phrase.
    expect(screen.getByText("namaste")).toBeInTheDocument();
  });

  test("Next advances to the following phrase as before", async () => {
    await driveToResult();

    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText("aabhar")).toBeInTheDocument());
    expect(screen.queryByText(/Score:/)).not.toBeInTheDocument();
  });
});
