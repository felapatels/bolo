import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ZoneVista } from "@/components/journey-scenery";
import {
  ZONE_VISTA,
  ZONE_VISTA_Y,
  zoneBackdrop,
  zoneVistaY,
} from "@/lib/zone-backdrops";

// THE POSTCARD'S PICTURE SIDE IS A CROP OF THE ZONE'S OWN PAINTING.
//
// It was a hand-coded SVG landmark until 2026-08-26, which was right while the
// map was flat and wrong the moment the zones were painted: a drawn gateway
// sitting on top of a painted one, the last vector left on a painted map.
//
// The band is only about 9% of the painting's height, so WHICH 9% is the whole
// design, and it is a per-zone table rather than one number. These tests pin
// the table and the wiring. What they cannot pin is whether the crop looks
// right, which was settled by cutting all six at 350x56 and looking at them.
//
// Mobile twin: bolo-mobile/__tests__/journey-zone-vista.test.tsx, which has an
// extra job here because React Native has no object-position and has to work
// the same offset out by hand.

describe("which band of the painting each postcard shows", () => {
  test("the six offsets are exactly this table", () => {
    // Exact-shape, the STALL_PLACEMENT idiom: mobile asserts the same six, so
    // a value edited on one platform fails on the other.
    // Re-picked by eye for the new art, 2026-09-14 (was [8, 8, 8, 0, 8, 16]).
    expect(ZONE_VISTA_Y).toEqual([40, 40, 8, 24, 8, 24]);
  });

  test("shows each new painting's landmark, for stated reasons", () => {
    // Re-picked 2026-09-14 when the owner replaced all six paintings. The old
    // exceptions (zone 4 at 0, zone 6 at 16) described pictures that no longer
    // exist. Now: the arch and the lane dome sit low in zones 1 and 2 (40),
    // the clock face and the bazaar arches sit high in zones 3 and 5 (8), and
    // the water tower and the fireworks over the domes sit between (24).
    for (const low of [0, 1]) expect(zoneVistaY(low)).toBe(40);
    for (const high of [2, 4]) expect(zoneVistaY(high)).toBe(8);
    for (const mid of [3, 5]) expect(zoneVistaY(mid)).toBe(24);
  });

  test("an unknown zone falls back to the skyline rather than to zero", () => {
    // Zero is not a chosen value since the 2026-09-14 re-pick, but it still must
    // not be the "no idea" answer: a band at the very top of an unknown
    // painting is sky, and the skyline default is the safer guess.
    expect(zoneVistaY(99)).toBe(8);
  });

  test("the picture side is 56 tall and the paintings are 860x1359", () => {
    expect(ZONE_VISTA).toEqual({
      height: 56,
      grayedOpacity: 0.55,
      artW: 860,
      artH: 1359,
    });
  });
});

describe("the vista draws the painting, not the drawn scene", () => {
  const vista = (zoneIndex: number) =>
    render(
      (<ZoneVista zoneIndex={zoneIndex} accent="#c2410c" />) as ReactElement,
    );

  test("every zone shows its own painting at its own offset", () => {
    for (let z = 0; z < 6; z++) {
      const { container, unmount } = vista(z);
      const img = container.querySelector("img");
      expect(img, `zone ${z} drew no painting`).not.toBeNull();
      expect(img!.getAttribute("src")).toBe(zoneBackdrop(z));
      // THE OFFSET IS THE DESIGN. An img that covers but sits at the default
      // 50% would show the middle of the painting, which is the road, on every
      // one of the six.
      expect(img!.style.objectPosition).toBe(`center ${zoneVistaY(z)}%`);
      expect(img!.style.objectFit || "").toBe("");
      expect(img!.className).toContain("object-cover");
      unmount();
    }
  });

  test("a zone with no painting keeps the drawn scene", () => {
    // ZONE_BACKDROPS is typed to allow a gap. Six ship art today, so this
    // branch is unreachable in production and exists because a blank accent
    // band would be the ugliest possible way to discover a seventh zone.
    const { container } = vista(99);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
