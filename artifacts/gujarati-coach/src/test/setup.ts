import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library leaves rendered trees in the jsdom document between
// tests; tear them down so each test starts from a clean slate.
afterEach(() => {
  cleanup();
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

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? vi.fn();
Element.prototype.hasPointerCapture =
  Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture =
  Element.prototype.setPointerCapture ?? vi.fn();
Element.prototype.releasePointerCapture =
  Element.prototype.releasePointerCapture ?? vi.fn();
