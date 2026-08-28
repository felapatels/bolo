import React from "react";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// THE MEMORY DISCLOSURE ON WEB CHAT.
//
// Web posts to the same /openai/chat that calls rememberFromTurn, so it has
// been keeping notes about learners since 2026-08-27 while saying nothing at
// all. Mobile carried the disclosure from day one; web never got it.
//
// Held here because a disclosure is the kind of thing that gets quietly
// refactored out of an empty state by someone tidying layout, and nobody
// notices a sentence that stopped appearing.
//
// Mocks mirror chat-bilingual-hint.test.tsx, which renders the same screen.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  stopRecording: vi.fn<[], Promise<Blob>>(),
  startRecording: vi.fn<[unknown], Promise<void>>(),
  prepare: vi.fn<[], Promise<void>>(),
  isPlus: true,
  isOneLanguage: false,
}));

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
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
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
    getLastDurationSeconds: () => 2,
    getAmplitude: () => 0,
    state: "idle",
    startRecording: h.startRecording,
    stopRecording: h.stopRecording,
    abortRecording: vi.fn(),
    prepare: h.prepare,
  }),
}));

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

import ChatPage from "@/pages/chat";

function renderChat() {
  const { hook } = memoryLocation({ path: "/chat" });
  return render(
    <Router hook={hook}>
      <ChatPage />
    </Router>,
  );
}

const micButton = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Hold to speak"]')!;
const releaseButton = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Release to send"]')!;

beforeEach(() => {
  h.startRecording.mockResolvedValue(undefined);
  h.stopRecording.mockReturnValue(new Promise(() => {}));
  h.prepare.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
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

describe("web chat — the memory disclosure", () => {
  test("tells the learner Bolo remembers, before the first turn", () => {
    renderChat();
    expect(screen.getByTestId("chat-memory-tip")).toBeInTheDocument();
    expect(
      screen.getByText(/I remember what you tell me, so we can pick up where we left off/),
    ).toBeInTheDocument();
  });

  test("gives a way to go and look, which is the half a disclosure alone misses", () => {
    renderChat();
    const link = screen.getByRole("link", { name: "See what I remember" });
    expect(link).toHaveAttribute("href", "/account");
  });

  test("steps out of the way once a conversation is running", async () => {
    renderChat();
    expect(screen.getByTestId("chat-memory-tip")).toBeInTheDocument();

    await act(async () => {
      fireEvent.pointerDown(micButton());
    });
    await waitFor(() => expect(releaseButton()).not.toBeNull());
    await act(async () => {
      fireEvent.pointerUp(releaseButton());
    });

    // Deliberate, and it matches mobile: they have read it, and it would
    // otherwise sit between the learner and the thing they came to do.
    await waitFor(() =>
      expect(screen.queryByTestId("chat-memory-tip")).not.toBeInTheDocument(),
    );
  });
});
