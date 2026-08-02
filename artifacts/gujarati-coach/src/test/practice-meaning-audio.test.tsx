import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act, configure } from "@testing-library/react";

// The meaning chain contains a real 400ms inter-segment pause, so the default
// 1s waitFor budget is too tight under a loaded validation runner. Applies to
// this file only (configure is module-scoped per vitest fork worker file).
configure({ asyncUtilTimeout: 15000 });
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Task 1003: coach speaks the English meaning after each phrase (web).
//
// After the phrase clip's ended event, a second English-voiced segment plays
// ("means <translation>"), controlled by the header Meaning pill (default ON,
// per-device persistence). The English segment is best-effort: any synthesis
// or playback failure falls back silently to phrase-only behavior and never
// surfaces the coach-audio-failed card. A hold during the meaning segment
// stops it like any coach audio (barge-in, Task 907 pattern).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  failSecondPlay: false,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => false,
  saveSilentMode: vi.fn(),
  SILENT_MODE_STORAGE_KEY: "bolo.silentMode",
}));

// Spoken feedback OFF so result-state audio never muddies instance counting.
vi.mock("@/lib/spoken-feedback", () => ({
  loadSpokenFeedback: () => false,
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
}));

// Imported after the mocks are declared.
import Practice from "@/pages/practice";
import { MEANING_AUDIO_STORAGE_KEY } from "@/lib/meaning-audio";

// jsdom's Audio can't actually play; capture instances so tests can end
// playback deterministically and count play/pause calls. The second created
// instance in these tests is always the meaning segment (prefetch only fills
// a cache, it never constructs an element), so failSecondPlay simulates an
// autoplay rejection of exactly the meaning clip.
const audioInstances: FakeAudio[] = [];
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {
    audioInstances.push(this);
  }
  play = vi.fn(async () => {
    if (h.failSecondPlay && audioInstances[1] === this) {
      throw new DOMException("autoplay rejected", "NotAllowedError");
    }
  });
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
  h.failSecondPlay = false;
  // The suite-wide setup forces the preference OFF for legacy tests; this
  // file exercises the real default, so clear it back to "nothing stored".
  localStorage.removeItem(MEANING_AUDIO_STORAGE_KEY);
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
    score: 90,
    band: "great",
    passed: true,
    xpAwarded: 9,
    feedback: "Great!",
    tip: "",
    transcript: "નમસ્તે",
    transcriptRomanized: "namaste",
    evaluationToken: "signed-token",
  });
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
});

const meaningCalls = () =>
  h.synth.mock.calls.filter(
    (c) => (c[0] as { data?: { languageName?: string } })?.data?.languageName === "English",
  );

/** Render and let the phrase clip start playing. */
async function renderToCoachPlaying() {
  renderPage(<Practice />);
  await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
  return audioInstances[0];
}

const meaningPill = () =>
  screen.getByRole("button", { name: /meaning/i }) as HTMLButtonElement;

describe("meaning segment after the phrase clip", () => {
  test("phrase end triggers an English-voiced means segment on a second element", async () => {
    const coachClip = await renderToCoachPlaying();

    await act(async () => {
      coachClip.onended?.();
    });

    // The English segment synthesizes under its own language identity and
    // plays on its own element after the pause.
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(2));
    const call = meaningCalls()[0]?.[0] as {
      data: { text: string; languageName: string; languageCode: string };
    };
    expect(call.data.text).toBe("means hello");
    expect(call.data.languageName).toBe("English");
    expect(call.data.languageCode).toBe("en");

    const meaningClip = audioInstances[1];
    await waitFor(() => expect(meaningClip.play).toHaveBeenCalledTimes(1));
    // The phrase clip itself played exactly once and was never re-created.
    expect(audioInstances[0].play).toHaveBeenCalledTimes(1);

    // When the meaning finishes the session lands in idle as usual.
    await act(async () => {
      meaningClip.onended?.();
    });
    await waitFor(() =>
      expect(screen.getByText(/Hold Bolo to speak/)).toBeInTheDocument(),
    );
  });

  test("the pill defaults to pressed and turning it off applies to the very next play", async () => {
    const coachClip = await renderToCoachPlaying();

    expect(meaningPill().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(meaningPill());
    expect(meaningPill().getAttribute("aria-pressed")).toBe("false");
    // Persisted per device, same pattern as the other audio preferences.
    expect(localStorage.getItem(MEANING_AUDIO_STORAGE_KEY)).toBe("off");

    await act(async () => {
      coachClip.onended?.();
    });

    // Phrase-only behavior: straight to idle, no English synthesis, no
    // second audio element.
    await waitFor(() =>
      expect(screen.getByText(/Hold Bolo to speak/)).toBeInTheDocument(),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    expect(meaningCalls()).toHaveLength(0);
    expect(audioInstances).toHaveLength(1);
  });

  test("a stored off preference renders the pill unpressed", async () => {
    localStorage.setItem(MEANING_AUDIO_STORAGE_KEY, "off");
    await renderToCoachPlaying();
    expect(meaningPill().getAttribute("aria-pressed")).toBe("false");
  });
});

describe("fail-silent English segment", () => {
  test("meaning synthesis failure falls back to phrase-only with no failure card", async () => {
    h.synth.mockImplementation(async (arg: { data?: { languageName?: string } }) => {
      if (arg?.data?.languageName === "English") {
        throw new Error("english synthesis down");
      }
      return { format: "mp3", audioBase64: "AAA" };
    });

    const coachClip = await renderToCoachPlaying();
    await act(async () => {
      coachClip.onended?.();
    });

    // Lands in idle with the mic available, exactly the phrase-only flow.
    await waitFor(() =>
      expect(screen.getByText(/Hold Bolo to speak/)).toBeInTheDocument(),
    );
    // Never the coach-audio-failed surfaces.
    expect(screen.queryByText("The announcer's mic cut out")).toBeNull();
    expect(screen.queryByText(/didn't play/)).toBeNull();
    // No second element was ever constructed.
    expect(audioInstances).toHaveLength(1);
  });

  test("meaning playback rejection falls back silently too", async () => {
    h.failSecondPlay = true;

    const coachClip = await renderToCoachPlaying();
    await act(async () => {
      coachClip.onended?.();
    });

    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(screen.getByText(/Hold Bolo to speak/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("The announcer's mic cut out")).toBeNull();
    expect(screen.queryByText(/didn't play/)).toBeNull();
  });
});

describe("barge-in during the meaning segment", () => {
  test("a hold while the meaning plays pauses it and records on the same gesture", async () => {
    const coachClip = await renderToCoachPlaying();
    await act(async () => {
      coachClip.onended?.();
    });
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(2));
    const meaningClip = audioInstances[1];
    expect(meaningClip.pause).not.toHaveBeenCalled();

    const belly = document.querySelector('[aria-label="Hold to speak"]') as HTMLButtonElement;
    expect(belly).not.toBeNull();
    fireEvent.pointerDown(belly);

    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to submit"]')).not.toBeNull(),
    );
    expect(meaningClip.pause).toHaveBeenCalled();

    await act(async () => {
      const releaseTarget = document.querySelector('[aria-label="Release to submit"]') as HTMLButtonElement;
      fireEvent.pointerUp(releaseTarget);
    });
    await waitFor(() => expect(h.evaluate).toHaveBeenCalledTimes(1));
    // The interrupted meaning clip never resumes on its own.
    expect(meaningClip.play).toHaveBeenCalledTimes(1);
  });
});

describe("per-session meaning cache", () => {
  test("replaying the same phrase does not re-synthesize the English segment", async () => {
    const coachClip = await renderToCoachPlaying();
    await act(async () => {
      coachClip.onended?.();
    });
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(2));
    await act(async () => {
      audioInstances[1].onended?.();
    });
    await waitFor(() =>
      expect(screen.getByText(/Hold Bolo to speak/)).toBeInTheDocument(),
    );
    expect(meaningCalls()).toHaveLength(1);

    // Replay via the speaker affordance: state re-enters playing_coach; both
    // segments come from the session caches.
    const speaker = screen.getByLabelText("Hear the phrase again");
    fireEvent.click(speaker);
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(3));
    await act(async () => {
      audioInstances[2].onended?.();
    });
    await waitFor(() => expect(audioInstances.length).toBeGreaterThanOrEqual(4));
    expect(meaningCalls()).toHaveLength(1);
  });
});
