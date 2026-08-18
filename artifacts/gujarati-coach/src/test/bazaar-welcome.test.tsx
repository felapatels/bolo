import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { BazaarWelcome } from "@/components/bazaar-welcome";

// ---------------------------------------------------------------------------
// Chacha-ji's bazaar welcome, web half of the twin.
//
// The component shipped untested. The bug that prompted these tests: the
// reduced-motion still dismissed after 2200ms under a comment calling this a
// "2.04s voice clip". The shipped chacha-welcome.mp3 is 4.284s and is
// byte-identical to the file mobile bundles, so every reduced-motion learner
// lost the last two seconds of the greeting. The timing test below is the pin
// for that: it fails on 2200 and passes on 4600.
//
// The day-stamp key and value format are asserted literally rather than
// imported, because they are a CROSS-PLATFORM contract. Mobile writes the same
// key with the same unpadded format so a learner on both platforms gets one day
// boundary rather than two. A test that imported the constant would let both
// halves drift together silently.
// ---------------------------------------------------------------------------

const WELCOME_KEY = "bolo-bazaar-welcome-day";

/** Byte-for-byte what the component writes. Unpadded, local calendar day. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

class MockAudio {
  src = "";
  currentTime = 0;
  paused = true;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  static instances: MockAudio[] = [];
  constructor() {
    MockAudio.instances.push(this);
  }
}

/** The one audio element the component routes the voice through. */
function voice(): MockAudio {
  expect(MockAudio.instances.length).toBeGreaterThan(0);
  return MockAudio.instances[MockAudio.instances.length - 1];
}

function setReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  localStorage.removeItem(WELCOME_KEY);
  MockAudio.instances = [];
  vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("BazaarWelcome, once a day", () => {
  it("greets on the first visit of the day", () => {
    render(<BazaarWelcome />);
    expect(screen.getByTestId("bazaar-welcome")).toBeInTheDocument();
    expect(screen.getByTestId("bazaar-welcome-video")).toBeInTheDocument();
  });

  it("stamps the day so the second visit is silent", () => {
    const { unmount } = render(<BazaarWelcome />);
    expect(localStorage.getItem(WELCOME_KEY)).toBe(today());
    unmount();

    render(<BazaarWelcome />);
    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
  });

  it("greets again once the stamp is yesterday's", () => {
    localStorage.setItem(WELCOME_KEY, "2020-1-1");
    render(<BazaarWelcome />);
    expect(screen.getByTestId("bazaar-welcome")).toBeInTheDocument();
  });

  it("fails CLOSED when storage is unreadable", () => {
    // A browser with storage blocked must get the bazaar, not the greeting on
    // every single entry. This asserts the failure DIRECTION, which the code
    // comment says was once documented backwards.
    // Spied on the INSTANCE, not Storage.prototype: under Node 26 the suite
    // runs against setup.ts's in-memory stand-in, whose prototype is not the
    // global Storage. The instance is the object the component actually calls.
    const getItem = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    try {
      render(<BazaarWelcome />);
      expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
    } finally {
      getItem.mockRestore();
    }
  });
});

describe("BazaarWelcome, the voice", () => {
  it("plays the greeting clip", () => {
    render(<BazaarWelcome />);
    expect(voice().src).toContain("chacha-welcome.mp3");
    expect(voice().play).toHaveBeenCalled();
  });

  it("stops the voice when the greeting is skipped", () => {
    render(<BazaarWelcome />);
    const el = voice();
    fireEvent.click(screen.getByTestId("bazaar-welcome"));

    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
    // Chacha-ji carrying on talking over the shop is the defect this component
    // was written to avoid. Skipping must silence him, not just hide him.
    expect(el.pause).toHaveBeenCalled();
  });

  it("survives a refused play() rather than blocking the film", () => {
    // No user gesture yet (direct URL, refresh, restored tab). The greeting is
    // a nicety, so a rejected promise must not surface as an unhandled error.
    MockAudio.prototype.play = vi.fn(() => Promise.reject(new Error("gesture")));
    expect(() => render(<BazaarWelcome />)).not.toThrow();
    expect(screen.getByTestId("bazaar-welcome")).toBeInTheDocument();
    MockAudio.prototype.play = vi.fn(() => Promise.resolve());
  });
});

describe("BazaarWelcome, the film is a nicety and not a gate", () => {
  it("dismisses when the film fails to load", () => {
    render(<BazaarWelcome />);
    fireEvent.error(screen.getByTestId("bazaar-welcome-video"));
    // A learner who cannot play the film lands in the bazaar rather than
    // staring at a black rectangle.
    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
  });

  it("dismisses when the film ends", () => {
    render(<BazaarWelcome />);
    fireEvent.ended(screen.getByTestId("bazaar-welcome-video"));
    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<BazaarWelcome />);
    fireEvent.keyDown(screen.getByTestId("bazaar-welcome"), { key: "Escape" });
    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
  });
});

describe("BazaarWelcome, reduced motion", () => {
  beforeEach(() => {
    setReducedMotion(true);
  });

  it("shows the still instead of the film, and still speaks", () => {
    render(<BazaarWelcome />);
    expect(screen.getByTestId("bazaar-welcome-still")).toBeInTheDocument();
    expect(screen.queryByTestId("bazaar-welcome-video")).not.toBeInTheDocument();
    // Reduced motion suppresses movement, not sound.
    expect(voice().play).toHaveBeenCalled();
  });

  it("holds the still past the end of the 4.284s voice", () => {
    // THE REGRESSION PIN. The old timeout was 2200ms, which cut Chacha-ji off
    // more than two seconds early. If this drops below the clip length again,
    // the first assertion fails.
    vi.useFakeTimers();
    render(<BazaarWelcome />);

    act(() => {
      vi.advanceTimersByTime(4300);
    });
    expect(screen.queryByTestId("bazaar-welcome")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId("bazaar-welcome")).not.toBeInTheDocument();
  });
});
