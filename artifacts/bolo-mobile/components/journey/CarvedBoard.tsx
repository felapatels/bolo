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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { AppFonts } from '@/constants/fonts';
import { ZONE_BOARD, ZONE_BOARD_ART, zoneBoardPedimentH } from '@/lib/zoneBackdrops';

/** The modern card's own colours (build 22): ivory paper, a lavender edge,
 *  the plate in the app's violet. Static rather than themed, like the ticket
 *  stock: the card lies on a painting, not on the app's background. */
const MODERN = {
  paper: '#FFFDF9',
  edge: '#CFC8F0',
  arc: '#B9B0E8',
  plateTop: '#6D5BF4',
  plateBottom: '#4F46E5',
  tagPaper: '#EFEBFA',
  tagInk: '#4B3F8F',
} as const;
const MODERN_RADIUS = 18;

export function CarvedBoard({
  width,
  height,
  nameplate,
  plate,
  opacity = 1,
  clipContent = true,
  bare = false,
  variant = 'carved',
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
  /**
   * 'carved' is the painted station board: the wood pediment with its
   * rosettes and brass plates. 'modern' (build 22, the owner's zone card
   * crop: "i like this new zone card style") keeps the board's exact
   * geometry, so nothing that measures the map moves, and draws the pediment
   * in code instead: an ivory cap with rounded shoulders and a faint arch, a
   * violet plate carrying the zone's name, and a small ZONE tag straddling
   * the cap and the body. The body below is the caller's card, flush to the
   * cap's width.
   */
  variant?: 'carved' | 'modern';
  testID?: string;
  pedimentTestID?: string;
  /** Whatever the panel says. Laid out inside the drawn frame. */
  children?: React.ReactNode;
}) {
  // The pediment takes its own aspect out of the board and the panel absorbs
  // precisely the remainder, so nothing here has to be measured.
  const pedimentH = zoneBoardPedimentH(width);
  const panelH = height - pedimentH;
  if (variant === 'modern') {
    const plateH = 30;
    const tagH = 18;
    return (
      <View
        testID={testID}
        style={[styles.board, { width, height, opacity }, clipContent ? null : styles.unclipped]}
      >
        <View
          testID={pedimentTestID}
          style={[styles.modernCap, { width, height: pedimentH }]}
        >
          {/* The arch, a whisper of the carved board's curve, drawn once. */}
          <Svg
            pointerEvents="none"
            width={width}
            height={pedimentH}
            viewBox={`0 0 ${width} ${pedimentH}`}
            style={StyleSheet.absoluteFill}
          >
            <Path
              d={`M ${width * 0.06} ${pedimentH - 4} Q ${width / 2} ${-pedimentH * 0.35} ${width * 0.94} ${pedimentH - 4}`}
              stroke={MODERN.arc}
              strokeWidth={1.5}
              strokeOpacity={0.55}
              fill="none"
            />
          </Svg>
          <View pointerEvents="none" style={[styles.modernPlate, { top: Math.max(6, (pedimentH - tagH - plateH) / 2 - 2), height: plateH }]}>
            <LinearGradient
              colors={[MODERN.plateTop, MODERN.plateBottom]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text numberOfLines={1} style={styles.modernPlateText}>
              {nameplate}
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.modernTag, { bottom: -tagH / 2, height: tagH }]}>
            <Text numberOfLines={1} style={styles.modernTagText}>
              {plate}
            </Text>
          </View>
        </View>
        <View style={[styles.panel, clipContent ? null : styles.unclipped]}>
          <View style={[styles.panelBody, styles.modernBody, clipContent ? null : styles.unclipped]}>
            {children}
          </View>
        </View>
      </View>
    );
  }
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
  // THE MODERN CAP (build 22): ivory, rounded shoulders, a lavender edge on
  // three sides; the body's card closes the fourth.
  modernCap: {
    backgroundColor: MODERN.paper,
    borderTopLeftRadius: MODERN_RADIUS,
    borderTopRightRadius: MODERN_RADIUS,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: MODERN.edge,
    overflow: 'visible',
    zIndex: 2,
  },
  modernPlate: {
    position: 'absolute',
    left: '17%',
    right: '17%',
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2B1A12',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modernPlateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: '#FFFFFF',
  },
  modernTag: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: MODERN.tagPaper,
    borderWidth: 1,
    borderColor: MODERN.edge,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  modernTagText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: MODERN.tagInk,
  },
  modernBody: { paddingLeft: 0, paddingRight: 0 },
  panelBody: {
    flex: 1,
    paddingLeft: `${ZONE_BOARD.contentInset * 100}%`,
    paddingRight: `${ZONE_BOARD.contentInset * 100}%`,
    overflow: 'hidden',
  },
});
