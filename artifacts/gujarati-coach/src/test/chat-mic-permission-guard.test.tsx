import React from "react";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Tests for first-time-user mic behaviour on the chat page:
//
//   1. No permission prompt on page load: the mount-time prewarm only runs
//      when the Permissions API reports "granted".
//   2. Typing is available before grant and while a grant is pending.
//   3. Released-before-start guard: a permission grant that resolves after
//      the pointer went up must never start a recording — the recorder is
//      aborted and the page stays idle (typing stays available).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  startRecording: vi.fn<[unknown], Promise<void>>(),
  stopRecording: vi.fn<[], Promise<Blob>>(),
  abortRecording: vi.fn(),
  prepare: vi.fn<[], Promise<void>>(),
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
    isPlus: true,
    isOneLanguage: false,
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
    abortRecording: h.abortRecording,
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

import ChatPage from "@/pages/chat";

function renderChat() {
  const { hook } = memoryLocation({ path: "/chat" });
  return render(
    <Router hook={hook}>
      <ChatPage />
    </Router>,
  );
}

function micButton() {
  return document.querySelector<HTMLButtonElement>('[aria-label="Hold to speak"]')!;
}

function textInput() {
  return screen.getByLabelText("Type a message to Bolo") as HTMLInputElement;
}

/** Stub navigator.permissions.query to report the given mic permission state. */
function stubMicPermission(state: PermissionState) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(() => Promise.resolve({ state })) },
  });
}

beforeEach(() => {
  h.startRecording.mockReset().mockResolvedValue(undefined);
  h.prepare.mockReset().mockResolvedValue(undefined);
  h.abortRecording.mockReset();
  h.stopRecording.mockReset().mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
  // Must be a real class: the chat page constructs pooled elements
  // (`new Audio()`) synchronously in its pointer-down gesture handler
  // (iOS audio unlock).
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
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

describe("chat mic permission & released-before-start guard", () => {
  test("mount does not touch the mic when permission is not yet granted", async () => {
    stubMicPermission("prompt");
    renderChat();
    // Give the permissions promise a tick to settle.
    await act(async () => {});
    expect(h.prepare).not.toHaveBeenCalled();
    // Typing is available before any grant.
    expect(textInput().disabled).toBe(false);
  });

  test("mount prewarms the mic when permission is already granted", async () => {
    stubMicPermission("granted");
    renderChat();
    await waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(1));
  });

  test("grant resolving after release never starts recording; typing stays available throughout", async () => {
    stubMicPermission("prompt");
    // startRecording hangs like a pending Chrome permission prompt, until we
    // resolve it manually (the user clicking "Allow" much later).
    let resolveGrant!: () => void;
    h.startRecording.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGrant = resolve;
      }),
    );

    renderChat();

    // Before any interaction: typing available.
    expect(textInput().disabled).toBe(false);

    // Press record — permission prompt "opens" (startRecording pending).
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });
    // While the grant is pending the page is still idle: typing available.
    expect(textInput().disabled).toBe(false);

    // The user gives up holding and releases before granting.
    await act(async () => {
      fireEvent.pointerUp(micButton());
    });

    // Much later, the grant lands.
    await act(async () => {
      resolveGrant();
    });

    // Recording must NOT have started: recorder aborted, no stop/send state,
    // and typing still available.
    await waitFor(() => expect(h.abortRecording).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[aria-label="Release to send"]')).toBeNull();
    expect(h.stopRecording).not.toHaveBeenCalled();
    expect(textInput().disabled).toBe(false);
  });

  test("lost release: pointerup the button never sees still ends the hold; grant must not start recording", async () => {
    stubMicPermission("prompt");
    let resolveGrant!: () => void;
    h.startRecording.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGrant = resolve;
      }),
    );

    renderChat();
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });

    // The permission prompt steals the pointer: the release is delivered to
    // the window, never to the button element.
    await act(async () => {
      fireEvent.pointerUp(window);
    });

    // The grant lands later ("Allow" clicked) — no recording may start.
    await act(async () => {
      resolveGrant();
    });

    await waitFor(() => expect(h.abortRecording).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[aria-label="Release to send"]')).toBeNull();
    expect(h.stopRecording).not.toHaveBeenCalled();
    // Typing still works after the discarded grant.
    const input = textInput();
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "hello bolo" } });
    expect(input.value).toBe("hello bolo");
  });

  test("grant with no live hold (focus stolen, release unobservable) never starts recording", async () => {
    stubMicPermission("prompt");
    let resolveGrant!: () => void;
    h.startRecording.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGrant = resolve;
      }),
    );

    renderChat();
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });

    // The permission prompt steals focus entirely: no pointerup is ever
    // dispatched anywhere, only a window blur. The hold must end.
    await act(async () => {
      fireEvent.blur(window);
    });

    await act(async () => {
      resolveGrant();
    });

    await waitFor(() => expect(h.abortRecording).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[aria-label="Release to send"]')).toBeNull();
    expect(h.stopRecording).not.toHaveBeenCalled();
    const input = textInput();
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "typing works" } });
    expect(input.value).toBe("typing works");
  });

  test("a held press still records normally after the grant resolves", async () => {
    stubMicPermission("prompt");
    let resolveGrant!: () => void;
    h.startRecording.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveGrant = resolve;
      }),
    );

    renderChat();
    await act(async () => {
      fireEvent.pointerDown(micButton());
    });
    // Grant lands while the finger is still down — recording continues.
    await act(async () => {
      resolveGrant();
    });
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Release to send"]')).not.toBeNull(),
    );
    // While recording, typing is intentionally disabled.
    expect(textInput().disabled).toBe(true);
    expect(h.abortRecording).not.toHaveBeenCalled();
  });
});
