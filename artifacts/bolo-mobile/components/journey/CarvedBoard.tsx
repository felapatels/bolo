// THE CARVED STATION BOARD, and there is exactly ONE of it.
//
// Extracted from journey.tsx on 2026-08-27, when the home hero was restyled to
// match the journey's zone cards ("maybe we make it look like the styling of
// the zone cards", owner, chat 12). Two screens now draw this board, and this
// repo's standing rule is that a second definition of the same thing is the
// defect rather than the fix. Web and mobile are already hand-maintained twins
// held together by prose; a third copy inside mobile itself would be worse.
//
// EVERY IMAGE HERE IS SIZED IN EXPLICIT POINTS, and that is not a style
// preference. On device, an RN `Image` sized by percentage or by absoluteFill
// inside this tree resolves to its INTRINSIC pixel size: the pediment came out
// at its own 760x142 and the panel at 760x202, which is the whole blank-board
// saga of builds 511 to 515 and the "zone card still doesn't look correct"
// side-by-side of chat 11. Anything added here takes a number, never a percent.
//
// Web twin: ZonePostcard in gujarati-coach/src/pages/journey.tsx.
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppFonts } from '@/constants/fonts';
import { ZONE_BOARD, ZONE_BOARD_ART, zoneBoardPedimentH } from '@/lib/zoneBackdrops';

export function CarvedBoard({
  width,
  height,
  nameplate,
  plate,
  opacity = 1,
  clipContent = true,
  bare = false,
  testID,
  pedimentTestID,
  children,
}: {
  /** The board's width in POINTS. Callers inset it from their own column. */
  width: number;
  /** The board's total height in POINTS, pediment included. */
  height: number;
  /** The carved nameplate's line, upper-cased by the caller. */
  nameplate: string;
  /** The small plate under it, e.g. "ZONE 2". */
  plate: string;
  /** Greys a board the learner cannot reach (showroom). */
  opacity?: number;
  /**
   * THE BOARD CLIPS BY DEFAULT, AND IT HAS TO. The panel takes exactly the
   * height it is given, so a cap plus overflow hidden is what stops content
   * spilling past the frame; it is also what crops a daily fact's last line
   * rather than letting it hang outside the art.
   *
   * Pass false for the length of an animation that must LEAVE the board. The
   * home hero's ticket tears off and sails away, and with all three boxes
   * clipping it vanished at the frame line instead: "now the ticket doesn't
   * tear" (owner, chat 12). Nothing resizes during that window, so the crop is
   * not doing any work while it is off.
   */
  clipContent?: boolean;
  /**
   * NO PANEL ART (build 17). The journey's zone board draws its own card
   * under the pediment now (owner: "this box should replace that box"), so
   * the parchment slice and the cream fill are skipped and the children get
   * the panel's full height, inset only to the pediment's own posts. The
   * home hero keeps the art.
   */
  bare?: boolean;
  testID?: string;
  pedimentTestID?: string;
  /** Whatever the panel says. Laid out inside the drawn frame. */
  children?: React.ReactNode;
}) {
  // The pediment takes its own aspect out of the board and the panel absorbs
  // precisely the remainder, so nothing here has to be measured.
  const pedimentH = zoneBoardPedimentH(width);
  const panelH = height - pedimentH;
  return (
    <View
      testID={testID}
      style={[
        styles.board,
        { width, height, opacity },
        clipContent ? null : styles.unclipped,
      ]}
    >
      {/* The pediment, aspect preserved: its rosettes and arch must not
          stretch, which is the whole reason the art is cut into slices. */}
      <View style={{ width, height: pedimentH }}>
        <Image
          testID={pedimentTestID}
          source={ZONE_BOARD_ART.top}
          style={{ width, height: pedimentH }}
          resizeMode="stretch"
        />
        {/* The plates. Positions are fractions of the slice, so the overlays
            track the board at any width. */}
        <View
          pointerEvents="none"
          style={[
            styles.namePlate,
            {
              left: `${ZONE_BOARD.namePlate.left * 100}%`,
              right: `${ZONE_BOARD.namePlate.right * 100}%`,
              top: `${ZONE_BOARD.namePlate.top * 100}%`,
              height: `${ZONE_BOARD.namePlate.height * 100}%`,
            },
          ]}
        >
          <Text numberOfLines={1} style={styles.namePlateText}>
            {nameplate}
          </Text>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.zonePlate,
            {
              width: `${ZONE_BOARD.zonePlate.width * 100}%`,
              top: `${ZONE_BOARD.zonePlate.top * 100}%`,
              height: `${ZONE_BOARD.zonePlate.height * 100}%`,
            },
          ]}
        >
          <Text numberOfLines={1} style={styles.zonePlateText}>
            {plate}
          </Text>
        </View>
      </View>
      {/* The panel. THE ONLY PART THAT STRETCHES, and it clips. */}
      <View style={[styles.panel, clipContent ? null : styles.unclipped]}>
        {/* Cream UNDER the art, and only as wide as the art's own frame. The
            slice's paper has partial alpha so it needs a fill behind it, and
            its outer margin is fully transparent, so that fill must stop there
            or the panel reads wider than the pediment above it. The two insets
            differ because the art is not centred in its own file. */}
        {!bare && <View pointerEvents="none" style={styles.panelFill} />}
        {!bare && (
          <Image
            source={ZONE_BOARD_ART.panel}
            resizeMode="stretch"
            style={{ position: 'absolute', left: 0, top: 0, width, height: panelH }}
          />
        )}
        {/* Everything the board says lives inside the drawn frame. The vertical
            insets are fractions of the PANEL'S HEIGHT and the horizontal ones
            of the board's WIDTH, which is why this is padded from two different
            bases rather than one. */}
        <View
          style={[
            styles.panelBody,
            bare
              ? {
                  paddingTop: 0,
                  paddingBottom: 0,
                  paddingLeft: `${ZONE_BOARD.panelInsetLeft * 100}%`,
                  paddingRight: `${ZONE_BOARD.panelInsetRight * 100}%`,
                }
              : {
                  paddingTop: panelH * ZONE_BOARD.contentInsetTop,
                  paddingBottom: panelH * ZONE_BOARD.contentInsetBottom,
                },
            clipContent ? null : styles.unclipped,
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // EXACTLY THE HEIGHT IT IS GIVEN, not "at most". A cap plus overflow hidden
  // crops whatever happens to be last, which is how the daily fact ended up
  // with its final line sliced off. As a column the pediment takes its aspect
  // and the panel absorbs precisely the remainder.
  board: { flexDirection: 'column', overflow: 'hidden' },
  namePlate: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  namePlateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: ZONE_BOARD.ink,
  },
  zonePlate: {
    position: 'absolute',
    left: '39.5%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonePlateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1,
    color: ZONE_BOARD.inkMuted,
  },
  // A FLEX CHILD, NOT AN ABSOLUTE BOX, and that was the third and last attempt
  // at this. It was a percentage top/bottom pair, then points, and both derived
  // a height from position, which Yoga does not do the way CSS does: the box
  // collapsed, and overflow hidden made an empty panel look exactly like a
  // missing one. Reported off three TestFlight builds running.
  //
  // flex:1 inside a parent that already has a height cannot collapse. The fill
  // and the art stay absolute BEHIND it; only the words use the flow.
  panel: { width: '100%', flex: 1, minHeight: 0, overflow: 'hidden' },
  panelFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `${ZONE_BOARD.panelInsetLeft * 100}%`,
    right: `${ZONE_BOARD.panelInsetRight * 100}%`,
    backgroundColor: ZONE_BOARD.panel,
  },
  // All three boxes clip, so all three have to be opened for a child to leave.
  unclipped: { overflow: 'visible' },
  panelBody: {
    flex: 1,
    paddingLeft: `${ZONE_BOARD.contentInset * 100}%`,
    paddingRight: `${ZONE_BOARD.contentInset * 100}%`,
    overflow: 'hidden',
  },
});
