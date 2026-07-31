/**
 * Five-band ladder component tests (web).
 *
 * The result-card ladder must always render all five band labels, highlight
 * exactly the achieved band, never render a raw numeric score, and render
 * nothing at all for nocatch (a system miss is not a rung on the ladder).
 */
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";

import { BandLadder } from "@/components/ui/band-ladder";
import { BAND_LADDER, bandLabel, type ScoredBand } from "@/components/ui/band-pill";

const ALL_LABELS = ["Perfect", "Great", "Good", "Almost", "Try again"];

describe("BandLadder", () => {
  test("renders all five band labels top to bottom", () => {
    const { container } = render(<BandLadder band="good" />);
    const items = Array.from(container.querySelectorAll("li"));
    expect(items.map((li) => li.textContent)).toEqual(ALL_LABELS);
  });

  test.each(BAND_LADDER as readonly ScoredBand[])(
    "highlights exactly the achieved band: %s",
    (band) => {
      const { container } = render(<BandLadder band={band} />);
      const achieved = Array.from(
        container.querySelectorAll("li[data-achieved]"),
      );
      expect(achieved).toHaveLength(1);
      expect(achieved[0]?.getAttribute("data-band")).toBe(band);
      expect(achieved[0]?.textContent).toBe(bandLabel(band));
      expect(achieved[0]?.getAttribute("aria-current")).toBe("true");
      // The other four rungs are muted (no data-achieved marker).
      expect(container.querySelectorAll("li")).toHaveLength(5);
    },
  );

  test("renders nothing for nocatch (system miss never shows the ladder)", () => {
    const { container } = render(<BandLadder band="nocatch" />);
    expect(container.innerHTML).toBe("");
  });

  test("never renders a raw numeric score", () => {
    const { container } = render(<BandLadder band="perfect" />);
    expect(container.textContent).not.toMatch(/\d/);
  });
});
