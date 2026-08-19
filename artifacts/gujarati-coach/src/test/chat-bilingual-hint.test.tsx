import React from "react";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Tests for the persistent bilingual chat hint ("You can respond in English
// or Gujarati") that stays visible across all chat states.
//
// Assertions:
//   1. Hint is visible when messages = 0
//   2. Hint STAYS visible after the first message is added (pending learner
//      bubble) — it is persistent, unlike the old empty-state tip
//   3. Switching the language via the picker updates the language name in hint
// ---------------------------------------------------------------------------

// Mutable hoisted state shared across mocks.
const h = vi.hoisted(() => ({
  stopRecording: vi.fn<[], Promise<Blob>>(),
  startRecording: vi.fn<[unknown], Promise<void>>(),
  prepare: vi.fn<[], Promise<void>>(),
  chatLangOverride: null as string | null,   // not used; languages come from useLanguage
  isPlus: true,
  isOneLanguage: false,
}));

// ---------------------------------------------------------------------------
// framer-motion: replace AnimatePresence with a passthrough so exit animations
// don't keep elements in the DOM while waiting for animation frames that never
// fire in jsdom.
// ---------------------------------------------------------------------------
vi.mock("framer-motion", () => ({
  motion: new Proxy({} as Record<string, unknown>, {
    get(_t, tag: string) {
      return function MotionEl({
        children,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t2,
        whileHover: _wh,
        whileTap: _wt,
        ...rest
      }: Record<string, unknown>) {
        return React.createElement(tag as string, rest as React.HTMLAttributes<HTMLElement>, children as React.ReactNode);
      };
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

// ---------------------------------------------------------------------------
// @/lib/motion: springs are transition configs passed to framer-motion; since
// we mock framer-motion to ignore them, we only need the object to exist.
// ---------------------------------------------------------------------------
vi.mock("@/lib/motion", () => ({
  springs: { snappy: {}, gentle: {}, poppy: {}, fast: {} },
}));

// ---------------------------------------------------------------------------
// Language context: two languages so we can test switching.
// ---------------------------------------------------------------------------
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    ],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  nativeTextProps: (_lang: { code: string }) => ({
    style: {},
    dir: "ltr" as const,
    isNastaliq: false,
  }),
}));

// ---------------------------------------------------------------------------
// Entitlements: Plus user so no weekly-cap UI interferes with the tests.
// ---------------------------------------------------------------------------
vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    isPlus: h.isPlus,
    isOneLanguage: h.isOneLanguage,
    isLanguageAllowed: (_code: string) => true,
    entitlements: null,
  }),
  upgradeHref: () => "/upgrade",
  asUpgradeRequired: () => null,
}));

// ---------------------------------------------------------------------------
// Voice recorder: startRecording resolves immediately (moves to recording state);
// stopRecording is overridden per-test so we control when it resolves.
// ---------------------------------------------------------------------------
vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    getLastDurationSeconds: () => 2,
    getAmplitude: () => 0,
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: h.prepare,
  }),
}));

// ---------------------------------------------------------------------------
// API client: getChatTurnUrl and ApiError are the only exports chat.tsx uses.
// ---------------------------------------------------------------------------
vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  getChatTurnUrl: () => "/api/chat/turn",
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(res: { status: number }, data: unknown) {
      super("ApiError");
      this.status = res.status;
      this.data = data;
    }
  },
}));

// ---------------------------------------------------------------------------
// UI components that aren't under test — stub so we don't pull in their deps.
// ---------------------------------------------------------------------------
vi.mock("@/components/mascot", () => ({
  Mascot: () => <div data-testid="mascot" />,
}));

vi.mock("@/components/chat-tip-card", () => ({
  ChatTipCard: () => <div data-testid="chat-tip-card" />,
}));

vi.mock("@/components/plus", () => ({
  PlusPill: () => <span>Plus</span>,
}));

// Dialog: always render trigger + content so language picker buttons are
// reachable without going through Radix portals.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Imported after all mocks are declared.
import ChatPage from "@/pages/chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderChat() {
  const { hook } = memoryLocation({ path: "/chat" });
  return render(
    <Router hook={hook}>
      <ChatPage />
    </Router>,
  );
}

/** Mic button when idle: aria-label "Hold to speak" */
function micButton() {
  return document.querySelector<HTMLButtonElement>('[aria-label="Hold to speak"]')!;
}

/** Mic button when recording: aria-label "Release to send" */
function releaseButton() {
  return document.querySelector<HTMLButtonElement>('[aria-label="Release to send"]')!;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // startRecording resolves immediately (so the component moves to "recording").
  h.startRecording.mockResolvedValue(undefined);

  // stopRecording hangs by default — we only need the pending-message state
  // that's set *before* the first await in finishRecording.
  h.stopRecording.mockReturnValue(new Promise(() => {}));

  h.prepare.mockResolvedValue(undefined);

  // Stub global fetch so any accidental resolution of stopRecording doesn't
  // throw on the subsequent network call.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

  // Stub Audio so playback code doesn't crash in jsdom. Must be a real class:
  // the chat page constructs pooled elements (`new Audio()`) synchronously in
  // its pointer-down gesture handler (iOS audio unlock).
  class FakeChatAudio {
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    load = vi.fn();
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onplay: (() => void) | null = null;
    src = "";
    currentTime = 0;
  }
  vi.stubGlobal("Audio", FakeChatAudio);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bilingual hint — visibility", () => {
  test("hint is visible before any message is sent", () => {
    renderChat();

    // Greeting bubble and the persistent hint should be in the DOM initially.
    expect(
      screen.getByText(/Hold my belly to chat in English or Gujarati/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You can respond in English or Gujarati/),
    ).toBeInTheDocument();
  });

  test("hint stays visible after the first message is added", async () => {
    renderChat();

    // Confirm hint is present before we do anything.
    expect(
      screen.getByText(/You can respond in English or Gujarati/),
    ).toBeInTheDocument();

    // Simulate hold-to-talk: pointerDown starts recording.
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });

    // Wait for the component to move to recording state.
    await waitFor(() => expect(releaseButton()).not.toBeNull());

    // pointerUp triggers finishRecording, which synchronously pushes a pending
    // learner bubble (messages.length → 1) before awaiting stopRecording.
    await act(async () => {
      fireEvent.pointerUp(releaseButton());
    });

    await waitFor(() => {
      // The empty-state greeting bubble goes away…
      expect(
        screen.queryByText(/Hold my belly to chat in English or Gujarati/),
      ).not.toBeInTheDocument();
      // …but the persistent hint remains visible.
      expect(
        screen.getByText(/You can respond in English or Gujarati/),
      ).toBeInTheDocument();
    });
  });
});

describe("bilingual hint — language picker", () => {
  test("switching language in the picker updates the language name in the hint", async () => {
    renderChat();

    // Gujarati is the default language.
    expect(
      screen.getByText(/You can respond in English or Gujarati/),
    ).toBeInTheDocument();

    // The Dialog mock renders content inline; find and click the Hindi button.
    // The button text matches the English name ("Hindi").
    const hindiButtons = screen.getAllByRole("button", { name: /Hindi/i });
    // The language picker renders each language as a button with English + native name.
    // At least one should be the "Hindi" picker entry.
    expect(hindiButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(hindiButtons[0]);
    });

    // After switching, the hint should show "Hindi".
    await waitFor(() => {
      expect(
        screen.getByText(/You can respond in English or Hindi/),
      ).toBeInTheDocument();
    });

    // And "Gujarati" should no longer appear in the hint.
    expect(
      screen.queryByText(/You can respond in English or Gujarati/),
    ).not.toBeInTheDocument();
  });
});
