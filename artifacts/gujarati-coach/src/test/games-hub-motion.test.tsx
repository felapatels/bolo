import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Task 986 pins: the games hub energy model.
//   - every card renders its preview vignette (the centerpiece)
//   - locked cards carry gv--locked (paused until hover; look-but-locked)
//   - off-screen vignettes pause via IntersectionObserver (gv--offscreen)
//   - reduced motion renders the same vignette DOM (static frames come from
//     the authored CSS base styles; nothing JS-side re-enables motion)
//   - the step-in press never delays navigation (Link navigates same-tick)
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  isPlus: false as boolean | undefined,
  isLoading: false,
  reduceMotion: false,
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: h.isLoading }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => h.reduceMotion };
});

import GamesPage from "@/pages/games/index";

const GAME_IDS = [
  "word-match",
  "listen-and-pick",
  "phrase-builder",
  "speed-round",
  "bolo-quiz",
] as const;
const LOCKED_IDS = ["phrase-builder", "speed-round", "bolo-quiz"] as const;
const FREE_IDS = ["word-match", "listen-and-pick"] as const;

function renderPage() {
  const loc = memoryLocation({ path: "/games", record: true });
  const utils = render(
    <Router hook={loc.hook}>
      <GamesPage />
    </Router>,
  );
  return { loc, ...utils };
}

/** Controllable IntersectionObserver stub (jsdom has none). */
class MockIO {
  static instances: MockIO[] = [];
  cb: IntersectionObserverCallback;
  el: Element | null = null;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element) {
    this.el = el;
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  h.isPlus = false;
  h.isLoading = false;
  h.reduceMotion = false;
  MockIO.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Games hub energy model (task 986)", () => {
  test("every card renders its vignette with the gv base class", () => {
    renderPage();
    for (const id of GAME_IDS) {
      const gv = screen.getByTestId(`game-preview-${id}`);
      expect(gv.classList.contains("gv")).toBe(true);
    }
  });

  test("free user: locked cards' vignettes are gv--locked, free cards' are not", () => {
    renderPage();
    for (const id of LOCKED_IDS) {
      expect(
        screen.getByTestId(`game-preview-${id}`).classList.contains("gv--locked"),
      ).toBe(true);
    }
    for (const id of FREE_IDS) {
      expect(
        screen.getByTestId(`game-preview-${id}`).classList.contains("gv--locked"),
      ).toBe(false);
    }
  });

  test("plus user: no vignette is gv--locked", () => {
    h.isPlus = true;
    renderPage();
    for (const id of GAME_IDS) {
      expect(
        screen.getByTestId(`game-preview-${id}`).classList.contains("gv--locked"),
      ).toBe(false);
    }
  });

  test("off-screen vignettes gain gv--offscreen and recover when visible again", () => {
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
    renderPage();
    // One observer per vignette; all five observed their element.
    expect(MockIO.instances.length).toBe(GAME_IDS.length);

    const first = MockIO.instances[0];
    act(() => {
      first.cb(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        first as unknown as IntersectionObserver,
      );
    });
    expect(first.el!.classList.contains("gv--offscreen")).toBe(true);

    act(() => {
      first.cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        first as unknown as IntersectionObserver,
      );
    });
    expect(first.el!.classList.contains("gv--offscreen")).toBe(false);
  });

  test("reduced motion: identical vignette DOM, no JS-side motion classes (static frames are pure CSS)", () => {
    h.reduceMotion = true;
    renderPage();
    for (const id of GAME_IDS) {
      const gv = screen.getByTestId(`game-preview-${id}`);
      expect(gv.classList.contains("gv")).toBe(true);
      expect(gv.classList.contains("gv--offscreen")).toBe(false);
      // Locked mapping is unchanged under reduced motion.
      const shouldBeLocked = (LOCKED_IDS as readonly string[]).includes(id);
      expect(gv.classList.contains("gv--locked")).toBe(shouldBeLocked);
    }
  });

  test("step-in press never delays navigation: clicking a free card navigates same-tick", () => {
    const { loc } = renderPage();
    const link = screen.getByText("Word Match").closest("a")!;
    fireEvent.click(link);
    expect(loc.history.at(-1)).toBe("/games/word-match");
  });
});
