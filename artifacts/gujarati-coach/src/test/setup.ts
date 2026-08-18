import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { MEANING_AUDIO_STORAGE_KEY } from "@/lib/meaning-audio";
import { __resetBlessedAudioElementsForTests } from "@/lib/iosAudio";
import { __seedPricingForTests } from "@/lib/pricing";
import { PRICING_CATALOG } from "./fixtures";

// Node 26 ships its OWN `localStorage` global, gated behind
// --localstorage-file. Unflagged it is `undefined`, and because Node defines
// the property first, jsdom's real Storage never lands on globalThis: window
// .localStorage is undefined too. Every test that touches storage then dies in
// its own beforeEach, which took the suite from green to 258 failures the
// first time it was run on a Mac with Node 26 rather than on Replit.
//
// Guarded, so this is INERT wherever jsdom's Storage survives (Replit, CI, any
// Node before 26). Delete it when the repo pins a Node that does not shadow
// storage. Not a behaviour shim: it is the same get/set/remove/clear contract
// the tests were already written against.
if (typeof globalThis.localStorage === "undefined") {
  class MemoryStorage {
    #map = new Map<string, string>();
    get length(): number {
      return this.#map.size;
    }
    key(i: number): string | null {
      return Array.from(this.#map.keys())[i] ?? null;
    }
    getItem(k: string): string | null {
      return this.#map.has(String(k)) ? this.#map.get(String(k))! : null;
    }
    setItem(k: string, v: string): void {
      this.#map.set(String(k), String(v));
    }
    removeItem(k: string): void {
      this.#map.delete(String(k));
    }
    clear(): void {
      this.#map.clear();
    }
  }
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: new MemoryStorage(),
    });
  }
}

// React Testing Library leaves rendered trees in the jsdom document between
// tests; tear them down so each test starts from a clean slate.
afterEach(() => {
  cleanup();
});

// The spoken English meaning segment (Task 1003) defaults to ON for learners.
// The pre-existing practice tests drive the coach chain by firing a single
// Audio onended and were written for the phrase-only flow, so the suite
// defaults the preference OFF here to keep them deterministic. Tests that
// exercise the meaning segment re-enable it explicitly.
beforeEach(() => {
  // The coach/meaning audio elements are module-scope singletons (WebKit
  // element blessing); reset per test so each test's Audio mock captures its
  // own instances and counts stay deterministic.
  __resetBlessedAudioElementsForTests();
  // Plan prices come from GET /api/pricing at runtime. Seed the shared cache
  // with the live Stripe ladder so price assertions stay deterministic and no
  // test reaches for the network.
  __seedPricingForTests(PRICING_CATALOG);
  try {
    localStorage.setItem(MEANING_AUDIO_STORAGE_KEY, "off");
  } catch {
    // Environments without localStorage just fall back to the code default.
  }
});

// jsdom is missing a handful of browser APIs that Radix primitives (Dialog) and
// framer-motion reach for. Stub the ones our components touch so interaction
// tests don't crash on environment gaps unrelated to what we're asserting.
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
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

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no IntersectionObserver; the landing page's SpeakingDemo uses one to
// only animate while on screen. Stub it so the component mounts under test.
if (!("IntersectionObserver" in globalThis)) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? vi.fn();
Element.prototype.hasPointerCapture =
  Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture =
  Element.prototype.setPointerCapture ?? vi.fn();
Element.prototype.releasePointerCapture =
  Element.prototype.releasePointerCapture ?? vi.fn();
