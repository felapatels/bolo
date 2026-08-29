import { describe, test, expect } from "vitest";
import {
  ZONE_BOARD_MIN_PANEL_H,
  zoneBoardPanelH,
  zoneBoardPedimentH,
} from "@/lib/zone-backdrops";

/** The map's reserved height per fare-zone row, mirrored from journey.tsx.
 *  Both platforms hold 256 (build 17 on mobile, build 18 here: the zone
 *  card restyle) and a mismatch is exactly what this file exists to catch,
 *  so it is written out rather than imported from one of them. */
const PC_H_FOR_TEST = 256;

describe('the carved board leaves room for what it has to say', () => {
  // THE GUARD THAT WAS MISSING. The board shipped BLANK to TestFlight twice,
  // in 511 and 512, and both times a screenshot could only say "nothing is
  // there" while the cause was "does not fit": mobile's PC_H was 152 against
  // web's 184, so after the pediment took its aspect the panel had 85 points
  // for about 98 of content, and overflow hidden made the two look identical.
  //
  // Arithmetic can tell them apart. This is the check I should have written
  // instead of guessing from three screenshots.
  test('has a panel at least as tall as its content needs, at every width', () => {
    // 320 is the narrowest phone worth drawing for; 390 is MAP_MAX_W and the
    // widest the map column ever gets. The board is inset 16 a side.
    for (const mapW of [320, 360, 390]) {
      const boardW = mapW - 32;
      const panel = zoneBoardPanelH(boardW, PC_H_FOR_TEST);
      expect(panel).toBeGreaterThanOrEqual(ZONE_BOARD_MIN_PANEL_H);
    }
  });

  test('would have failed on the old mobile PC_H, which is the point', () => {
    // 152 was mobile's value through 512. If this assertion ever stops holding,
    // the guard above has stopped guarding anything.
    expect(zoneBoardPanelH(390 - 32, 152)).toBeLessThan(ZONE_BOARD_MIN_PANEL_H);
  });

  test('gives the pediment its aspect and nothing more', () => {
    // A board twice as wide has a pediment twice as tall: it is pure aspect,
    // which is why the panel budget shrinks as the column widens and why the
    // check above runs at the WIDEST column rather than the narrowest.
    expect(zoneBoardPedimentH(760)).toBeCloseTo(142, 5);
    expect(zoneBoardPedimentH(380)).toBeCloseTo(71, 5);
  });
});
