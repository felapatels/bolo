import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// The scroll-motion layer added 2026-08-28 ("living homepage"). Two things
// here are load-bearing and neither is visible in a screenshot:
//
//   1. SPLITTING A HEADING INTO WORDS DESTROYS ITS ACCESSIBLE NAME unless the
//      whole sentence is restated as an aria-label. The name-from-content
//      algorithm trims each text node before joining, so the spaces between
//      the animated spans disappear and the heading is announced as
//      "WhatusingBolo!isactuallylike". Two landing tests caught this the first
//      time; these pin it at the component so the next person to touch
//      SplitHeading finds out here rather than there.
//
//   2. REDUCE-MOTION IS NOT COVERED BY THE CSS RESET. index.css zeroes CSS
//      animation and transition durations, and framer-motion animates from JS,
//      so every one of these primitives has to opt out in its own code. The
//      only way to prove it stayed opted out is to assert it.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => h.reduceMotion };
});

import {
  Reveal,
  RevealChild,
  RevealStagger,
  ScrollProgressRail,
  SplitHeading,
} from "@/lib/motion";

describe("SplitHeading", () => {
  test("keeps the whole sentence as the heading's accessible name", () => {
    h.reduceMotion = false;
    render(<SplitHeading text="What using Bolo! is actually like" />);
    // The regression this guards against reads "WhatusingBolo!isactuallylike",
    // which an exact-name query is the only thing that catches.
    expect(
      screen.getByRole("heading", { name: "What using Bolo! is actually like" }),
    ).toBeInTheDocument();
  });

  test("still draws one word per span, with the spaces kept", () => {
    h.reduceMotion = false;
    const { container } = render(<SplitHeading text="Honest pricing, up front" />);
    const heading = container.querySelector("h2");
    const words = Array.from(heading?.querySelectorAll("span") ?? []);
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.textContent)).toEqual([
      "Honest ",
      "pricing, ",
      "up ",
      "front",
    ]);
    // Spaces survive a copy-paste of the rendered heading, not just the label.
    expect(heading?.textContent).toBe("Honest pricing, up front");
  });

  test("renders the requested heading level and id", () => {
    h.reduceMotion = false;
    render(<SplitHeading as="h3" id="pricing-heading" text="Two words" />);
    const heading = screen.getByRole("heading", { name: "Two words", level: 3 });
    expect(heading).toHaveAttribute("id", "pricing-heading");
  });
});

describe("reduce-motion", () => {
  test("the scroll progress rail does not render at all", () => {
    h.reduceMotion = true;
    const { container } = render(<ScrollProgressRail />);
    expect(container).toBeEmptyDOMElement();

    h.reduceMotion = false;
    const { container: moving } = render(<ScrollProgressRail />);
    expect(
      moving.querySelector('[data-testid="scroll-progress-rail"]'),
    ).toBeInTheDocument();
  });

  test("Reveal starts as a plain fade, with no offset to travel back from", () => {
    h.reduceMotion = true;
    const { container } = render(
      <Reveal from="left" y={40}>
        <p>copy</p>
      </Reveal>,
    );
    const style = container.firstElementChild?.getAttribute("style") ?? "";
    expect(style).toContain("opacity: 0");
    // No transform means nothing slides in from anywhere. The `from` prop is
    // ignored on purpose rather than being an error to pass.
    expect(style).not.toContain("translate");
  });

  test("Reveal does slide when motion is allowed", () => {
    h.reduceMotion = false;
    const { container } = render(
      <Reveal from="left" y={40}>
        <p>copy</p>
      </Reveal>,
    );
    expect(container.firstElementChild?.getAttribute("style") ?? "").toContain(
      "translateX(-40px)",
    );
  });
});

describe("RevealStagger", () => {
  test("renders as the tag the layout needs, so a list stays a list", () => {
    h.reduceMotion = false;
    const { container } = render(
      <RevealStagger as="ol">
        <RevealChild as="li">one</RevealChild>
        <RevealChild as="li">two</RevealChild>
      </RevealStagger>,
    );
    const list = container.querySelector("ol");
    expect(list).toBeInTheDocument();
    // Not divs-in-an-ol, which is what the hand-rolled version produced.
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(2);
    expect(list?.querySelector(":scope > div")).toBeNull();
  });
});
