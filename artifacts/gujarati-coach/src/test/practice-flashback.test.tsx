import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// THE FLASHBACK BETWEEN STOPS (build 20, owner ruling 2026-08-29). Pins: the
// flashback mode asks the review route for FLASHBACK_SIZE phrases and no more
// (three or fewer is the server's free door); it carries a Skip straight to
// `next`; nothing due means no flashback at all (straight on, no empty
// screen); and the plain review still asks for the full session. Harness
// cloned from practice-short-clip-guard so the mocks match the suites that
// already render this page.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  lastReviewParams: null as unknown,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
  // Wall-clock duration the mocked recorder reports for the last recording.
  lastDurationSeconds: 2,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => true, // silent mode: belly available without coach audio
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
    getLastDurationSeconds: () => h.lastDurationSeconds,
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
  useListReviewPhrases: (params: unknown) => {
    h.lastReviewParams = params;
    return h.reviewPhrases;
  },
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
import Practice, { FLASHBACK_SIZE } from "@/pages/practice";

// jsdom's Audio can't play; a permissive stub keeps the page's audio wiring quiet.
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

const phrase = { id: 10, nativeScript: "છ", romanized: "chha", english: "six" };
const phrase2 = { id: 11, nativeScript: "સાત", romanized: "saat", english: "seven" };

beforeEach(() => {
  h.lastReviewParams = null;
  h.categoryPhrases = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  h.reviewPhrases = { data: [phrase, phrase2], isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() };
  h.synth.mockReset().mockResolvedValue({ format: "mp3", audioBase64: "AAA" });
  h.evaluate.mockReset();
  h.createAttempt.mockReset().mockResolvedValue({ newlyEarnedBadges: [] });
});

function renderAt(ui: ReactElement, path: string) {
  const loc = memoryLocation({ path, record: true });
  render(<Router hook={loc.hook}>{ui}</Router>);
  return loc;
}

describe("the flashback between stops", () => {
  test("asks for three phrases at most and offers Skip straight to the next stop", async () => {
    renderAt(<Practice mode="flashback" />, "/flashback?next=/journey");
    const skip = await screen.findByTestId("flashback-skip");
    expect(skip.getAttribute("href")).toBe("/journey");
    expect(skip).toHaveTextContent("Skip");
    expect(FLASHBACK_SIZE).toBe(3);
    expect(h.lastReviewParams).toEqual({ lang: "gu", limit: 3 });
  });

  test("nothing due means no flashback: straight on to the next stop", async () => {
    h.reviewPhrases = { ...h.reviewPhrases, data: [] };
    const loc = renderAt(<Practice mode="flashback" />, "/flashback?next=/journey");
    await waitFor(() => expect(loc.history.at(-1)).toBe("/journey"));
    expect(screen.queryByText("Nothing to review right now.")).toBeNull();
  });

  test("the plain review still asks for the full session and has no Skip", async () => {
    renderAt(<Practice mode="review" />, "/review");
    await waitFor(() => expect(h.lastReviewParams).toEqual({ lang: "gu" }));
    expect(screen.queryByTestId("flashback-skip")).toBeNull();
  });
});
