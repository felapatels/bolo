<<<<<<< ours — interstitial `file_header` (T+S+F, confidence: low)
// hint: All three dimensions conflict. Manual review required.
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Task 954: journey stations resume at the first unmastered phrase.
//
// Re-entering a station (`/practice/:zone?group=<id>`) must auto-start at the
// first phrase whose bestScore is below the 80 credit edge (null = never
// attempted counts as unmastered), falling back to index 0 when every phrase
// is at 80+. The phrase SET is unchanged (nothing filtered — the x/y counter
// keeps the full length) and back navigation still returns to the journey.
// Category sessions without ?skipMastered are untouched.
//
// All runs use silent mode so the session lands on "idle" without any audio
// synthesis, keeping these tests purely about the starting position.
//
// NOTE: the session chrome (header, belly button) is already present in the
// brief "intro" render BEFORE the auto-start effect commits its index jump,
// so every assertion first settles pending effects (act) and then waits for
// the expected phrase — never for generic chrome.
// ---------------------------------------------------------------------------

=======
import React from "react";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// framer-motion: AnimatePresence as a passthrough so that the key-change cycle
// (old phrase exits, new phrase enters) resolves synchronously in jsdom.
// Without this, AnimatePresence mode="wait" defers the new phrase's mount
// until the exit animation completes — which never fires in jsdom.
// ---------------------------------------------------------------------------
vi.mock("framer-motion", () => ({
  motion: new Proxy({} as Record<string, unknown>, {
>>>>>>> theirs — interstitial `file_header` (T+S+F, confidence: low)
const h = vi.hoisted(() => ({
  groupPhrases: {} as Record<string, unknown>,
  categoryPhrases: {} as Record<string, unknown>,
}));

vi.mock("@/lib/silent-mode", () => ({
  loadSilentMode: () => true,
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
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListLessonGroupPhrases: () => h.groupPhrases,
  useListCategoryPhrases: () => h.categoryPhrases,
}));

// Imported after the mocks are declared.
import Practice from "@/pages/practice";

// Silent mode never constructs Audio, but stub it anyway so an accidental
// audio path fails an assertion instead of crashing jsdom.
class FakeAudio {
  onended: (() => void) | null = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
}
vi.stubGlobal("Audio", FakeAudio);

function renderPage(ui: ReactElement, path: string) {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

/** A group-member phrase with a controllable mastery score. */
function phraseAt(
  id: number,
  bestScore: number | null,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    nativeScript: `સ્ક્રિપ્ટ${id}`,
    romanized: `phrase-${id}`,
    english: `english ${id}`,
    bestScore,
    mastered: bestScore != null && bestScore >= 80,
    ...extra,
  };
}

/** The fixed M1 taste set: teaser rows carry per-phrase teaser progress. */
const TEASER = { teaser: { consumed: 1, limit: 3 } };

function loaded(data: unknown) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

const idle = () => loaded(undefined);

beforeEach(() => {
  h.groupPhrases = idle();
  h.categoryPhrases = idle();
});

/**
 * Settle the auto-start effect, then assert the session sits on `romanized`
 * shown as position `counter` of the FULL phrase set.
 */
async function expectStartsAt(romanized: string, counter: string) {
  // Flush the auto-start effect's queued updates (index jump + state flip).
  await act(async () => {});
  await waitFor(() => expect(screen.getByText(romanized)).toBeInTheDocument());
  expect(screen.getByText(counter)).toBeInTheDocument();
}

describe("practice start position (Task 954: station resume)", () => {
  test("station resumes at the first phrase below the 80 credit edge — exactly 80 counts as done, set stays unfiltered", async () => {
    h.groupPhrases = loaded([
      phraseAt(1, 95),
      phraseAt(2, 80), // boundary: 80 is AT the credit edge — mastered
      phraseAt(3, 45),
      phraseAt(4, null),
    ]);
    renderPage(<Practice />, "/practice/0?group=7");

    // Starts on phrase 3 (first below 80) as position 3 of the FULL set —
    // mastered phrases are skipped over, never removed.
    await expectStartsAt("phrase-3", "3/4");
    expect(screen.queryByText("phrase-1")).not.toBeInTheDocument();
  });

  test("never-attempted phrases (bestScore null) count as unmastered", async () => {
    h.groupPhrases = loaded([
      phraseAt(1, 90),
      phraseAt(2, null),
      phraseAt(3, 20),
    ]);
    renderPage(<Practice />, "/practice/0?group=7");

    await expectStartsAt("phrase-2", "2/3");
  });

  test("all-mastered station is a deliberate review visit: starts at phrase 1 with the full set", async () => {
    // Pin (not just fallback coverage): re-entering a fully-passed station is
    // a review session — it must start at phrase 1 and keep every phrase
    // practiceable (full-length counter), never bounce or skip ahead.
    h.groupPhrases = loaded([
      phraseAt(1, 95),
      phraseAt(2, 88),
      phraseAt(3, 80),
    ]);
    renderPage(<Practice />, "/practice/0?group=7");

    await expectStartsAt("phrase-1", "1/3");
  });

  test("teaser taste set is INERT to resume: always plays from the top, even with an attempted phrase", async () => {
    // A teaser-state caller gets the fixed free taste set (rows carry
    // `teaser` progress). Without the inertness guard, the attempted first
    // phrase (bestScore 95) would make resume skip straight to phrase 2 and
    // shorten the taste → upsell flow.
    h.groupPhrases = loaded([
      phraseAt(1, 95, TEASER),
      phraseAt(2, null, TEASER),
      phraseAt(3, null, TEASER),
    ]);
    renderPage(<Practice />, "/practice/0?group=1");

    await expectStartsAt("phrase-1", "1/3");
  });

  test("category sessions without ?skipMastered still start at the first phrase", async () => {
    h.categoryPhrases = loaded([
      phraseAt(1, 95),
      phraseAt(2, 30),
    ]);
    renderPage(<Practice />, "/practice/5");

    await expectStartsAt("phrase-1", "1/2");
  });

  test("back navigation from a resumed station still returns to the journey", async () => {
    h.groupPhrases = loaded([phraseAt(1, 90), phraseAt(2, 10)]);
    renderPage(<Practice />, "/practice/0?group=7");

    // Resumed at phrase 2, and the header back link is unchanged.
    await expectStartsAt("phrase-2", "2/2");
    expect(document.querySelector('a[href="/journey"]')).not.toBeNull();
  });
});

    get(_t, tag: string) {
      return function MotionEl({
        children,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t2,
        whileHover: _wh,
        whileTap: _wt,
        layout: _l,
        layoutId: _lid,
        style,
        ...rest
      }: Record<string, unknown>) {
        return React.createElement(
          tag as string,
          { ...(rest as React.HTMLAttributes<HTMLElement>), style: style as React.CSSProperties },
          children as React.ReactNode,
        );
      };
    },
