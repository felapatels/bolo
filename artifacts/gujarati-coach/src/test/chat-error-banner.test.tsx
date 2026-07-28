import React from "react";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Tests for the error banner clear behaviour in ChatPage:
//
//   1. The error banner appears in the DOM after a failed chat turn.
//   2. Tapping (pointerDown) the mic button clears the banner before the
//      next recording attempt starts.
// ---------------------------------------------------------------------------

// Mutable hoisted state shared across mocks.
const h = vi.hoisted(() => ({
  stopRecording: vi.fn<[], Promise<Blob>>(),
  startRecording: vi.fn<[unknown], Promise<void>>(),
  prepare: vi.fn<[], Promise<void>>(),
  isPlus: true,
  isOneLanguage: false,
}));

// ---------------------------------------------------------------------------
// framer-motion: passthrough so exit animations don't keep elements in the
// DOM while waiting for animation frames that never fire in jsdom.
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
        return React.createElement(
          tag as string,
          rest as React.HTMLAttributes<HTMLElement>,
          children as React.ReactNode,
        );
      };
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

vi.mock("@/lib/motion", () => ({
  springs: { snappy: {}, gentle: {}, poppy: {}, fast: {} },
}));

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

vi.mock("@workspace/integrations-openai-ai-react", () => ({
  useVoiceRecorder: () => ({
    getAmplitude: () => 0,
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: h.prepare,
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getChatTurnUrl: () => "/api/chat/turn",
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(res: { status: number }, data: unknown) {
      super("ApiError");
      this.name = "ApiError";
      this.status = res.status;
      this.data = data;
    }
  },
}));

vi.mock("@/components/mascot", () => ({
  Mascot: () => <div data-testid="mascot" />,
}));

vi.mock("@/components/chat-tip-card", () => ({
  ChatTipCard: () => <div data-testid="chat-tip-card" />,
}));

vi.mock("@/components/plus", () => ({
  PlusPill: () => <span>Plus</span>,
}));

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

/** Bottom-bar mic button (aria-label "Hold to speak" when idle/error). */
function micButton() {
  // There are two elements with pointerDown handlers (mascot area + bottom bar).
  // The bottom-bar button carries the aria-label.
  return document.querySelector<HTMLButtonElement>('[aria-label="Hold to speak"]')!;
}

/** Bottom-bar mic button while recording. */
function releaseButton() {
  return document.querySelector<HTMLButtonElement>('[aria-label="Release to send"]')!;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  h.startRecording.mockResolvedValue(undefined);
  h.prepare.mockResolvedValue(undefined);

  // stopRecording returns a non-empty blob by default so the turn proceeds to
  // the fetch step.  Individual tests can override this.
  h.stopRecording.mockResolvedValue(
    new Blob(["audio"], { type: "audio/webm" }),
  );

  vi.stubGlobal(
    "Audio",
    vi.fn(() => ({
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      load: vi.fn(),
      onended: null,
      onerror: null,
    })),
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chat error banner", () => {
  test("error banner appears after a failed turn", async () => {
    // Arrange: fetch rejects with a 500-like network error.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          json: () => Promise.resolve({}),
        }),
      ),
    );

    renderChat();

    // No banner visible at start.
    expect(screen.queryByRole("img", { hidden: true })).toBeDefined(); // just a sanity import
    expect(
      screen.queryByText(/Bolo ran into a snag/),
    ).not.toBeInTheDocument();

    // Act: hold mic → recording state.
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });
    await waitFor(() => expect(releaseButton()).not.toBeNull());

    // Release mic → triggers finishRecording.
    await act(async () => {
      fireEvent.pointerUp(releaseButton());
    });

    // Assert: error banner must appear.
    await waitFor(() => {
      expect(
        screen.getByText(/Bolo ran into a snag/),
      ).toBeInTheDocument();
    });
  });

  test("error banner clears when the learner taps to record again", async () => {
    // Arrange: first fetch fails (triggers error banner).
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          json: () => Promise.resolve({}),
        }),
      ),
    );

    renderChat();

    // Drive the component into the error state.
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });
    await waitFor(() => expect(releaseButton()).not.toBeNull());

    await act(async () => {
      fireEvent.pointerUp(releaseButton());
    });

    // Wait for the error banner to appear.
    await waitFor(() => {
      expect(screen.getByText(/Bolo ran into a snag/)).toBeInTheDocument();
    });

    // Now set up the next fetch to hang (so we can inspect the in-between state
    // without worrying about another error overwriting the cleared banner).
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    // stopRecording also hangs on the second attempt so the turn stays in-flight.
    h.stopRecording.mockReturnValue(new Promise(() => {}));

    // Act: tap mic button while in error state — this calls startRecording which
    // calls setErrorMsg(null) synchronously before the next await.
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });

    // Assert: banner must be gone immediately after the pointer-down.
    await waitFor(() => {
      expect(
        screen.queryByText(/Bolo ran into a snag/),
      ).not.toBeInTheDocument();
    });
  });
});
