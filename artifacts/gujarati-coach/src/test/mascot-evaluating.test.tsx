import { describe, test, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Mascot } from "@/components/mascot";

// ---------------------------------------------------------------------------
// The evaluating state.
//
// Practice used to float a Loader2 throbber over the mascot's belly and dim
// him to 0.55 behind it. Both are gone: Bolo plays the state himself — he
// zooms out small and spins in place while the score comes back, then zooms
// back in — through the existing whole-image activity layer
// (`activity="evaluating"`), so no second animation stack and no new artwork.
// The shrink is a class on an in-flow wrapper rather than a framer value, so
// it holds when animations are turned off, and the class carries
// `transition-transform`, which is what makes adding and dropping it read as
// a zoom rather than a jump.
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
  test("zooms out small while evaluating, and only then", () => {
    const { container, rerender } = render(
      <Mascot pose="thinking" activity="evaluating" />,
    );

    // The mascot zone is aria-hidden decoration, so it is queried by test id /
    // DOM rather than by role.
    const shrunk = container.querySelector('[data-testid="mascot-working"]');
    expect(shrunk?.className).toContain("scale-[0.45]");
    // The zoom out and back in are the CSS transition on this same wrapper.
    expect(shrunk?.className).toContain("transition-transform");
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "mascot-thinking.png",
    );

    rerender(<Mascot pose="thinking" activity={null} />);
    expect(container.querySelector('[data-testid="mascot-working"]')).toBeNull();
    // Back to full size: the shrink class is what carried it, so dropping the
    // state is the zoom back in.
    expect(container.querySelector(".scale-\\[0\\.45\\]")).toBeNull();
  });

  test("no throbber is rendered in that state", () => {
    const { container } = render(<Mascot pose="thinking" activity="evaluating" />);
    // The Loader2 spinner that used to carry this state is gone from the
    // mascot's zone entirely: Bolo himself is the spinner now.
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  test("the shrink holds with reduced motion on", () => {
    preferReducedMotion(true);

    const { container } = render(<Mascot pose="thinking" activity="evaluating" />);

    // The small size is CSS, not a framer transform, so a learner with
    // animations off still sees a bird who has zoomed away to work — a
    // distinct state rather than an empty or frozen full-size one. (A slow
    // opacity breathe carries the "still working" beat; the spin stays off.)
    const shrunk = container.querySelector('[data-testid="mascot-working"]');
    expect(shrunk?.className).toContain("scale-[0.45]");
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
