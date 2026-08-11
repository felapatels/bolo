import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Toggle confirmation toasts (web).
//
// The three header audio pills (Phrase, Feedback, Meaning) used to change only
// their own styling when tapped, so a learner could not tell what had just
// happened. Each tap now names the new state in the same MilestoneToast pill
// the session milestones use.
//
// Guards: the exact copy in both directions for all three toggles, and that a
// second tap REPLACES the pill rather than stacking a second one — the three
// sit together and get tapped in quick succession.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categoryPhrases: {} as Record<string, unknown>,
  reviewPhrases: {} as Record<string, unknown>,
  synth: vi.fn(),
  evaluate: vi.fn(),
  createAttempt: vi.fn(),
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

const phrase = {
  id: 10,
  nativeScript: "નમસ્તે",
  romanized: "namaste",
  english: "hello",
};

beforeEach(() => {
  localStorage.clear();
  // clear() wipes the suite-wide setup.ts pin, so restore it: the meaning
  // segment stays off, which also fixes the Meaning pill's starting state.
  localStorage.setItem("bolo.meaningAudio", "off");
  // Silent mode on so no coach clip plays into these assertions; it also
  // fixes the Phrase pill's starting state (phrase audio off).
  localStorage.setItem("bolo.silentMode", "on");
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
  h.evaluate.mockReset();
  h.createAttempt.mockReset();
});

/** Render practice and wait for the header controls to be interactive. */
async function reachIdle() {
  renderPage(<Practice />);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Hold to speak"]')).not.toBeNull(),
  );
}

function toggle(name: "Phrase" | "Feedback" | "Meaning") {
  return screen.getByRole("button", { name });
}

async function press(name: "Phrase" | "Feedback" | "Meaning") {
  await act(async () => {
    fireEvent.click(toggle(name));
  });
}

describe("toggle confirmation toasts", () => {
  test("the Phrase pill names the new state in both directions", async () => {
    await reachIdle();

    // Starts off (silent mode on), so the first tap turns phrase audio on.
    await press("Phrase");
    await waitFor(() =>
      expect(
        screen.getByText("Phrase audio on. Bolo reads each phrase first."),
      ).toBeInTheDocument(),
    );

    await press("Phrase");
    await waitFor(() =>
      expect(
        screen.getByText("Phrase audio off. You speak first."),
      ).toBeInTheDocument(),
    );
  });

  test("the Feedback pill names the new state in both directions", async () => {
    await reachIdle();

    // Spoken feedback defaults on, so the first tap turns it off.
    await press("Feedback");
    await waitFor(() =>
      expect(screen.getByText("Feedback aloud off.")).toBeInTheDocument(),
    );

    await press("Feedback");
    await waitFor(() =>
      expect(
        screen.getByText("Feedback aloud on. Your score is read out."),
      ).toBeInTheDocument(),
    );
  });

  test("the Meaning pill names the new state in both directions", async () => {
    await reachIdle();

    // Pinned off above, so the first tap turns the meaning segment on.
    await press("Meaning");
    await waitFor(() =>
      expect(
        screen.getByText("Meaning aloud on. English after each phrase."),
      ).toBeInTheDocument(),
    );

    await press("Meaning");
    await waitFor(() =>
      expect(screen.getByText("Meaning aloud off.")).toBeInTheDocument(),
    );
  });

  test("a second tap replaces the toast instead of stacking one", async () => {
    await reachIdle();

    await press("Phrase");
    await waitFor(() =>
      expect(
        screen.getByText("Phrase audio on. Bolo reads each phrase first."),
      ).toBeInTheDocument(),
    );

    // Tap a different toggle right away, as a learner adjusting the cluster
    // would. The pill must swap its message, not gain a neighbor.
    await press("Feedback");
    await waitFor(() =>
      expect(screen.getByText("Feedback aloud off.")).toBeInTheDocument(),
    );

    expect(screen.getAllByTestId("milestone-toast")).toHaveLength(1);
    expect(
      screen.queryByText("Phrase audio on. Bolo reads each phrase first."),
    ).toBeNull();
  });

  test("the toggle still changes what it controls, and the pill state with it", async () => {
    await reachIdle();

    expect(toggle("Feedback")).toHaveAttribute("aria-pressed", "true");
    await press("Feedback");

    expect(localStorage.getItem("bolo.spokenFeedback")).toBe("off");
    expect(toggle("Feedback")).toHaveAttribute("aria-pressed", "false");
  });
});
