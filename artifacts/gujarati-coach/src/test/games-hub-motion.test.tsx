import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// The games hub energy model, as re-cut in Build 35.
//   - the five games WITH vignette assets render them (the centerpiece)
//   - gated cards animate too: the Build 35 locked grammar is full-color art
//     plus a badge and lock chip, NOT a paused or washed-out tile
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
// The hero's language line is the LanguagePicker's trigger; the picker
// itself (the dialog, the entitlement reads) is another file's test.
vi.mock("@/components/language-picker", () => ({
  LanguagePicker: ({ trigger }: { trigger?: React.ReactNode }) => <>{trigger}</>,
}));
// The hero's language line reads the language context and the learner's
// current city; neither has a provider here.
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    languages: [],
    setActiveLang: () => {},
    isLoading: false,
  }),
}));
vi.mock("@/lib/useJourneyProgress", () => ({
  useJourneyProgress: () => ({ current: null, doneCount: 0, isLoading: false, planBlocked: false }),
}));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => h.reduceMotion };
});

import GamesPage from "@/pages/games/index";

/** The games that ship an animated vignette. The other five keep static art. */
const VIGNETTE_IDS = [
  "word-match",
  "listen-and-pick",
  "phrase-builder",
  "speed-round",
  "bolo-quiz",
] as const;

/**
 * One observer per rendered vignette. The hero (Luggage Match) is one of the
 * five games with no vignette, so it adds no observer: the count is exactly
 * the five catalog vignettes.
 */
const OBSERVED_VIGNETTES = VIGNETTE_IDS.length;

function renderPage() {
  const loc = memoryLocation({ path: "/games", record: true });
  const utils = render(
    <Router hook={loc.hook}>
      <GamesPage />
    </Router>,
  );
  return { loc, ...utils };
}

function catalog() {
  return screen.getByTestId("games-catalog");
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

describe("Games hub energy model", () => {
  test("every vignette-bearing card renders its vignette with the gv base class", () => {
    renderPage();
    for (const id of VIGNETTE_IDS) {
      const gv = within(catalog()).getByTestId(`game-preview-${id}`);
      expect(gv.classList.contains("gv")).toBe(true);
    }
  });

  test("free user: gated cards still animate — no vignette is gv--locked", () => {
    renderPage();
    for (const id of VIGNETTE_IDS) {
      expect(
        within(catalog()).getByTestId(`game-preview-${id}`).classList.contains("gv--locked"),
      ).toBe(false);
    }
  });

  test("all-access user: no vignette is gv--locked either", () => {
    h.isPlus = true;
    renderPage();
    for (const id of VIGNETTE_IDS) {
      expect(
        within(catalog()).getByTestId(`game-preview-${id}`).classList.contains("gv--locked"),
      ).toBe(false);
    }
  });

  test("ambient loops are staggered so no two vignettes pulse in sync", () => {
    renderPage();
    const delays = VIGNETTE_IDS.map((id) =>
      within(catalog())
        .getByTestId(`game-preview-${id}`)
        .style.getPropertyValue("--gv-delay"),
    );
    expect(new Set(delays).size).toBe(delays.length);
    // The hero is a static-icon game, so it contributes no vignette phase and
    // cannot beat against the grid.
    expect(screen.queryByTestId("featured-game-preview")).toBeNull();
  });

  test("off-screen vignettes gain gv--offscreen and recover when visible again", () => {
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
    renderPage();
    expect(MockIO.instances.length).toBe(OBSERVED_VIGNETTES);

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
    for (const id of VIGNETTE_IDS) {
      const gv = within(catalog()).getByTestId(`game-preview-${id}`);
      expect(gv.classList.contains("gv")).toBe(true);
      expect(gv.classList.contains("gv--offscreen")).toBe(false);
      expect(gv.classList.contains("gv--locked")).toBe(false);
    }
  });

  test("step-in press never delays navigation: clicking a free card navigates same-tick", () => {
    const { loc } = renderPage();
    const link = within(catalog()).getByTestId("game-card-ticket-check").closest("a")!;
    fireEvent.click(link);
    expect(loc.history.at(-1)).toBe("/games/ticket-check");
  });

  test("a gated card press goes to the upgrade route, never a dead end", () => {
    const { loc } = renderPage();
    const link = within(catalog()).getByTestId("game-card-word-match").closest("a")!;
    fireEvent.click(link);
    expect(loc.history.at(-1)).toBe("/upgrade");
  });
});
