import { describe, test, expect } from "vitest";
import {
  ZONE_BOARD_CAP_W,
  ZONE_BOARD_MIN_PANEL_H,
  ZONE_BOARD_PEDIMENT_MAX_H,
  zoneBoardPanelH,
  zoneBoardPedimentH,
} from "@/lib/zone-backdrops";
import { SERPENTINE } from "@/pages/journey";

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
    // 320 is the narrowest phone worth drawing for; 390 is MAP_MAX_W, the
    // widest a phone's column gets; 560 is MAP_MAX_W_LG, the large-screen
    // column since 2026-08-30. The board is inset 16 a side.
    expect(SERPENTINE.MAP_MAX_W).toBe(390);
    expect(SERPENTINE.MAP_MAX_W_LG).toBe(560);
    for (const mapW of [320, 360, SERPENTINE.MAP_MAX_W, SERPENTINE.MAP_MAX_W_LG]) {
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

  test('gives the pediment its aspect up to the phone cap, and holds it there', () => {
    // Pure aspect on a phone: a board at 320 has a pediment of 320 * 142 / 760.
    // Past the phone's widest board (358, the 390 column less 16 a side) the
    // pediment holds, because the lg column is 560 and a cap that kept its
    // aspect would leave the panel under ZONE_BOARD_MIN_PANEL_H: the check
    // above runs at that width for exactly this reason (2026-08-30).
    expect(zoneBoardPedimentH(320)).toBeCloseTo((320 * 142) / 760, 5);
    expect(zoneBoardPedimentH(ZONE_BOARD_CAP_W)).toBeCloseTo(ZONE_BOARD_PEDIMENT_MAX_H, 5);
    expect(zoneBoardPedimentH(528)).toBeCloseTo(ZONE_BOARD_PEDIMENT_MAX_H, 5);
    expect(zoneBoardPedimentH(760)).toBeCloseTo(ZONE_BOARD_PEDIMENT_MAX_H, 5);
    expect(ZONE_BOARD_PEDIMENT_MAX_H).toBeCloseTo((358 * 142) / 760, 5);
  });
});
