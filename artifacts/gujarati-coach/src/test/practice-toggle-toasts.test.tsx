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
// second tap REPLACES the pill rather than stacking a second one, the three
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

/**
 * Task 1044: the three pills moved behind a settings gear. Radix opens its
 * menu on pointerdown, not click, and closes it on select, so every item
 * press is open-then-click.
 */
async function openMenu() {
  await act(async () => {
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Audio settings" }),
      { button: 0, ctrlKey: false, pointerType: "mouse" },
    );
  });
}

function toggle(name: "Autoplay phrase" | "Spoken feedback" | "Speak meaning") {
  return screen.getByRole("menuitemcheckbox", { name: new RegExp(`^${name}`) });
}

/**
 * Presses a menu item, optionally asserting the confirmation toast it raises.
 *
 * ORDER MATTERS. The toast self-dismisses after 1800ms of REAL time, and
 * MilestoneToast uses `AnimatePresence mode="wait"`, so a replacing toast is
 * only in the DOM after the previous one's exit animation finishes, it can
 * be neither read synchronously nor waited for at leisure. The toast
 * assertion therefore sits immediately after the click, and the wait for the
 * Radix menu to finish closing comes AFTER it. With the close-wait in between
 * (as it briefly was), a loaded machine burnt the whole dwell window inside
 * the helper and the toast was gone before the test looked.
 */
async function press(
  name: "Autoplay phrase" | "Spoken feedback" | "Speak meaning",
  expectToast?: string,
) {
  await openMenu();
  await act(async () => {
    fireEvent.click(toggle(name));
  });
  if (expectToast !== undefined) {
    await waitFor(() =>
      expect(screen.getByTestId("milestone-toast")).toHaveTextContent(
        expectToast,
      ),
    );
  }
  // The menu closes on select; let the dismiss/focus-restore settle so the
  // next open starts clean.
  await waitFor(() =>
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull(),
  );
}

describe("toggle confirmation toasts", () => {
  test("the Phrase pill names the new state in both directions", async () => {
    await reachIdle();

    // Starts off (silent mode on), so the first tap turns phrase audio on.
    await press(
      "Autoplay phrase",
      "Phrase audio on. Bolo reads each phrase first.",
    );
    await press("Autoplay phrase", "Phrase audio off. You speak first.");
  });

  test("the Feedback pill names the new state in both directions", async () => {
    await reachIdle();

    // Spoken feedback defaults on, so the first tap turns it off.
    await press("Spoken feedback", "Feedback aloud off.");
    await press(
      "Spoken feedback",
      "Feedback aloud on. Your score is read out.",
    );
  });

  test("the Meaning pill names the new state in both directions", async () => {
    await reachIdle();

    // Pinned off above, so the first tap turns the meaning segment on.
    await press(
      "Speak meaning",
      "Meaning aloud on. English after each phrase.",
    );
    await press("Speak meaning", "Meaning aloud off.");
  });

  test("a second tap replaces the toast instead of stacking one", async () => {
    await reachIdle();

    await press(
      "Autoplay phrase",
      "Phrase audio on. Bolo reads each phrase first.",
    );

    // Tap a different toggle right away, as a learner adjusting the cluster
    // would. The menu must swap its message, not gain a neighbor: the toast
    // assertion inside press() has already established that the SECOND
    // message is the one on screen, so a single mounted toast at that moment
    // is the "replaces, not stacks" invariant.
    await press("Spoken feedback", "Feedback aloud off.");
    expect(screen.getAllByTestId("milestone-toast")).toHaveLength(1);
  });

  test("the toggle still changes what it controls, and the menu state with it", async () => {
    await reachIdle();

    await openMenu();
    expect(toggle("Spoken feedback")).toHaveAttribute("aria-checked", "true");
    await act(async () => {
      fireEvent.click(toggle("Spoken feedback"));
    });

    expect(localStorage.getItem("bolo.spokenFeedback")).toBe("off");
    await waitFor(() =>
      expect(screen.queryByRole("menuitemcheckbox")).toBeNull(),
    );
    await openMenu();
    expect(toggle("Spoken feedback")).toHaveAttribute("aria-checked", "false");
  });
});

// ---------------------------------------------------------------------------
// Task 1044: the pills moved behind a settings gear, and the header finally
// names the language being practised.
// ---------------------------------------------------------------------------
describe("the audio settings gear", () => {
  test("the gear is on the lesson screen and its menu is closed until opened", async () => {
    await reachIdle();

    expect(
      screen.getByRole("button", { name: "Audio settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
    // The pills they replaced are gone from the header.
    expect(
      document.querySelector("header button[aria-pressed]"),
    ).toBeNull();
  });

  test("the menu holds all three items, each with a text label and an on/off state", async () => {
    await reachIdle();
    await openMenu();

    const items = screen.getAllByRole("menuitemcheckbox");
    expect(items).toHaveLength(3);
    // The label is how a learner tells the three apart; the fill colour used
    // to carry state, so each item now says On or Off in words too.
    expect(items[0]).toHaveTextContent(/^Autoplay phraseOff$/);
    expect(items[1]).toHaveTextContent(/^Spoken feedbackOn$/);
    expect(items[2]).toHaveTextContent(/^Speak meaningOff$/);
  });

  test("selecting an item closes the menu", async () => {
    await reachIdle();
    await openMenu();
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(3);

    await act(async () => {
      fireEvent.click(toggle("Autoplay phrase"));
    });
    await waitFor(() =>
      expect(screen.queryByRole("menuitemcheckbox")).toBeNull(),
    );
  });

  test("Escape closes the menu without changing anything", async () => {
    await reachIdle();
    await openMenu();

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole("menuitemcheckbox")).toBeNull(),
    );
    expect(localStorage.getItem("bolo.silentMode")).toBe("on");
  });

  test("the phrase card speaker still plays the target phrase in one tap", async () => {
    await reachIdle();
    h.synth.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Hear the phrase again"));
    });

    await waitFor(() => expect(h.synth).toHaveBeenCalled());
  });
});

describe("the display-only language chip", () => {
  test("renders the active language code uppercased, immediately left of the gear", async () => {
    await reachIdle();

    const chip = screen.getByTestId("lesson-language-chip");
    expect(chip).toHaveTextContent("GU");
    // Inert: the language cannot be changed mid-lesson, so no handler, no
    // button role, and not focusable.
    expect(chip.tagName).toBe("SPAN");
    expect(chip).not.toHaveAttribute("role");
    expect(chip).not.toHaveAttribute("tabindex");
    expect(chip.closest("button")).toBeNull();
    // It sits immediately before the gear in the header row.
    expect(chip.nextElementSibling).toBe(
      screen.getByRole("button", { name: "Audio settings" }),
    );
  });

  // The non-lesson case is guarded on a real non-lesson screen in
  // home-stats-banner.test.tsx; here we guard the practice page's own
  // non-lesson header variant, which is left bare on purpose.
  test("does not appear on the loading header variant", async () => {
    h.categoryPhrases = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: true,
      refetch: vi.fn(),
    };
    renderPage(<Practice />);

    await waitFor(() =>
      expect(document.querySelector("header")).not.toBeNull(),
    );
    expect(screen.queryByTestId("lesson-language-chip")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Audio settings" }),
    ).toBeNull();
  });
});
