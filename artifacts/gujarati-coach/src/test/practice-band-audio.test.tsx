import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor, act, render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Task 903 — instant band call-outs on the practice result card.
//
// The moment a result lands, Bolo speaks the band name from a pre-bundled
// clip (public/sounds/bands/<band>.mp3) with zero synthesis wait; the full
// feedback sentence follows only after the clip finishes. Guards:
//   - the clip for the result's band plays on result (correct mapping),
//   - the neutral nocatch clip plays on the nocatch path,
//   - the spoken-feedback mute suppresses the band clip AND the feedback,
//   - feedback synthesis failure still shows the result card normally
//     (band clip alone plays; the card is never blocked on audio).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
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

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
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
  useGetLessonGroupTestout: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  getGetLessonGroupTestoutQueryKey: (id: unknown) => ["testout", id],
  useSubmitLessonGroupTestout: () => ({
    mutateAsync: async () => ({}),
    isPending: false,
    reset: () => {},
  }),
  getListCategoryPhrasesQueryKey: () => ["category-phrases"],
  getListReviewPhrasesQueryKey: () => ["review"],
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ["progress-summary"],
  getListRecentAttemptsQueryKey: () => ["recent-attempts"],
  getListBadgesQueryKey: () => ["badges"],
  useListCategories: () => ({ data: undefined, isLoading: false }),
}));

import Practice from "@/pages/practice";

const audioInstances: FakeAudio[] = [];
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    audioInstances.push(this);
  }
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

/** Band clips that actually PLAYED (preloadBandClips creates silent,
 * never-played instances on the first record gesture — exclude those). */
function playedBandClips(): FakeAudio[] {
  return audioInstances.filter(
    (a) => a.src.includes("sounds/bands/") && a.play.mock.calls.length > 0,
  );
}

function feedbackAudioInstances(): FakeAudio[] {
  return audioInstances.filter((a) => a.src.startsWith("data:audio/"));
}

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
  return { size: bytes, type, arrayBuffer: async () => new ArrayBuffer(bytes) };
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
    feedback: "Nice work on that greeting!",
    tip: "Soften the t sound.",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.stopRecording.mockReset().mockResolvedValue(makeBlob());
});

/** Render in silent mode (no coach playback) and wait for the belly zone. */
async function reachIdle() {
  localStorage.setItem("bolo.silentMode", "on");
  renderPage(<Practice />);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
}

/** Hold the belly to record, then release to submit. */
async function recordAndRelease() {
  const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
  fireEvent.pointerDown(belly);
  await waitFor(() => expect(h.startRecording).toHaveBeenCalled());
  await act(async () => {
    const releaseTarget =
      document.querySelector('[aria-label="Release to submit"]') ?? belly;
    fireEvent.pointerUp(releaseTarget);
  });
}

describe("instant band audio on results", () => {
  test("the band clip for the result's band plays as soon as the result lands", async () => {
    await reachIdle();
    await recordAndRelease();
    await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());

    // band "great" → great.mp3, already playing (no synthesis round-trip).
    await waitFor(() => expect(playedBandClips()).toHaveLength(1));
    expect(playedBandClips()[0].src).toContain("sounds/bands/great.mp3");
  });

  test("the full feedback sentence follows only after the band clip finishes", async () => {
    await reachIdle();
    await recordAndRelease();
    await waitFor(() => expect(playedBandClips()).toHaveLength(1));

    // While the clip is playing, the feedback audio hasn't started.
    expect(feedbackAudioInstances()).toHaveLength(0);

    // Clip ends → the (pre-synthesized) feedback sentence plays.
    await act(async () => {
      playedBandClips()[0].onended?.();
    });
    await waitFor(() => expect(feedbackAudioInstances()).toHaveLength(1));
    expect(feedbackAudioInstances()[0].play).toHaveBeenCalled();
  });

  test("the nocatch path plays the neutral nocatch clip", async () => {
    h.evaluate.mockResolvedValue({
      score: 0,
      band: "nocatch",
      passed: false,
      xpAwarded: 0,
      feedback: "Our listener glitched on that one.",
      tip: "Just try the same thing again.",
      evaluationToken: "signed-token",
    });
    await reachIdle();
    await recordAndRelease();

    await waitFor(() => expect(playedBandClips()).toHaveLength(1));
    expect(playedBandClips()[0].src).toContain("sounds/bands/nocatch.mp3");
  });

  test("spoken-feedback mute suppresses the band clip and the feedback audio", async () => {
    localStorage.setItem("bolo.spokenFeedback", "off");
    await reachIdle();
    await recordAndRelease();
    await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());

    await act(async () => {
      await Promise.resolve();
    });
    expect(playedBandClips()).toHaveLength(0);
    expect(feedbackAudioInstances()).toHaveLength(0);
    // No feedback synthesis was even requested (silent mode: no coach synth either).
    expect(h.synth).toHaveBeenCalledTimes(0);
  });

  test("feedback synthesis failure still shows the result card; band clip alone plays", async () => {
    h.synth.mockReset().mockRejectedValue(new Error("TTS down"));
    await reachIdle();
    await recordAndRelease();

    // Result card renders normally — never blocked on audio.
    await waitFor(() => expect(screen.getByText("Amazing!")).toBeInTheDocument());
    await waitFor(() => expect(playedBandClips()).toHaveLength(1));

    // Finish the clip; the failed synthesis must not produce feedback audio
    // (and must not crash the card).
    await act(async () => {
      playedBandClips()[0].onended?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(feedbackAudioInstances()).toHaveLength(0);
    expect(screen.getByText("Amazing!")).toBeInTheDocument();
  });
});
