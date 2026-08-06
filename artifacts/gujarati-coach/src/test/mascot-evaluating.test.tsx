import { describe, test, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Mascot } from "@/components/mascot";

// ---------------------------------------------------------------------------
// Build 36 items 1+2 (web half): the evaluating state.
//
// Practice used to float a Loader2 throbber over the mascot's belly and dim
// him to 0.55 behind it. Both are gone: Bolo plays the state himself, hanging
// upside down off his perch and swinging, through the existing whole-image
// activity layer (`activity="evaluating"`) — no second animation stack, no new
// artwork. The 180 deg is a class on an in-flow wrapper rather than a framer
// value, so it holds when animations are turned off.
// ---------------------------------------------------------------------------

/** Points framer's useReducedMotion at a "reduce" preference. */
function preferReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mascot evaluating state", () => {
  test("hangs upside down while evaluating, and only then", () => {
    const { container, rerender } = render(
      <Mascot pose="thinking" activity="evaluating" />,
    );

    // The mascot zone is aria-hidden decoration, so it is queried by test id /
    // DOM rather than by role.
    const hang = container.querySelector('[data-testid="mascot-hanging"]');
    expect(hang?.className).toContain("rotate-180");
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "mascot-thinking.png",
    );

    rerender(<Mascot pose="thinking" activity={null} />);
    expect(container.querySelector('[data-testid="mascot-hanging"]')).toBeNull();
  });

  test("no throbber is rendered in that state", () => {
    const { container } = render(<Mascot pose="thinking" activity="evaluating" />);
    // The Loader2 spinner that used to carry this state is gone from the
    // mascot's zone entirely.
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  test("the hang holds with reduced motion on", () => {
    preferReducedMotion(true);

    const { container } = render(<Mascot pose="thinking" activity="evaluating" />);

    // The pose is CSS, not a framer transform, so a learner with animations
    // off still sees an upside-down bird — a distinct working state rather
    // than an empty or frozen-upright one. (A slow opacity breathe carries
    // the "still working" beat; movement stays off.)
    const hang = container.querySelector('[data-testid="mascot-hanging"]');
    expect(hang?.className).toContain("rotate-180");
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
