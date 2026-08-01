// Full-ticket boarding-pass fittings — react-native ports of the web pieces
// (gujarati-coach/src/components/ticket.tsx). Brand colors only, no artwork.
// Shared by the home hero pass and the journey map-header pass.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { AppFonts } from '@/constants/fonts';

let stripeSeq = 0;

// SIZING CONTRACT (build-28 device regression, July 30, 2026): NOTHING in
// these fittings may render a percentage-sized <Svg> in normal layout flow.
// Web resolves a percentage of an indefinite parent to auto, but native Yoga
// asks react-native-svg to measure the node, and a percentage-height Svg
// inflates its ancestors until the ticket fills the entire screen (this
// shipped in build 28: home hero + journey header both went full-viewport on
// a real iPhone while Expo web looked perfect). Every Svg here now renders
// only AFTER an onLayout measure, with numeric dimensions, inside an
// absolutely-positioned wrapper — absolute children can never grow the card.

/** Diagonal ticket-stock stripes. The web version is a repeating CSS
 *  gradient; here an SVG pattern of rotated bars does the same job. `ink` is
 *  the stripe color including alpha, e.g. "rgba(255,255,255,0.05)" on accent
 *  or `${accent}08` on card stock. */
export function TicketStripes({ ink }: { ink: string }) {
  // Pattern ids are document-global in react-native-svg; keep them unique so
  // two tickets on one screen (home hero + journey header) don't collide.
  const idRef = React.useRef<string | null>(null);
  if (!idRef.current) idRef.current = `ticket-stripes-${++stripeSeq}`;
  const id = idRef.current;
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="ticket-stripes"
      onLayout={(e) => {
        const w = Math.ceil(e.nativeEvent.layout.width);
        const h = Math.ceil(e.nativeEvent.layout.height);
        if (w > 0 && h > 0 && (!dims || dims.w !== w || dims.h !== h)) setDims({ w, h });
      }}
    >
      {dims && (
        <Svg testID="ticket-stripes-svg" width={dims.w} height={dims.h}>
          <Defs>
            <Pattern
              id={id}
              patternUnits="userSpaceOnUse"
              width={26}
              height={26}
              patternTransform="rotate(-45)"
            >
              <Rect x={0} y={0} width={10} height={26} fill={ink} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={dims.w} height={dims.h} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

// The stamp is rotated -12 degrees, so its axis-aligned bounding box is
// larger than the stamp square by (cos 12 + sin 12) ~= 1.186x. Any slot that
// hosts a stamp must reserve this extent, or the rotated corners bleed over
// the slot edge (build-30 defect: a 48px stamp has ~57px bounds but sat in a
// 56px home slot, and a 44px stamp (~53px bounds) sat in a 52px header slot).
const STAMP_ROTATION_DEG = 12;
export function zoneStampExtent(size: number): number {
  const rad = (STAMP_ROTATION_DEG * Math.PI) / 180;
  return Math.ceil(size * (Math.cos(rad) + Math.sin(rad)));
}

/** Inverse of zoneStampExtent: the largest stamp size whose rotated visual
 *  extent fits the given slot width. Lets a host derive the stamp from its
 *  own column width (R1: label + circle scale as a unit to the stub). */
export function stampSizeForExtent(extent: number): number {
  const rad = (STAMP_ROTATION_DEG * Math.PI) / 180;
  return Math.floor(extent / (Math.cos(rad) + Math.sin(rad)));
}

// Deterministic fit for the stamp's geoName line. Real zone names run up to
// "Thiruvananthapuram Central"; the old fixed 7px font with maxWidth +
// numberOfLines={1} guaranteed an ellipsis for most of them. Instead, size
// the font so the longest WORD fits the chord budget and let the text wrap
// on spaces (no numberOfLines, so truncation is impossible). 0.7em per
// uppercase extrabold character is a conservative advance estimate; the
// floor keeps degenerate names from vanishing entirely.
// R1: the budget is 0.72 of the diameter, not 0.84 — the name sits BELOW the
// zone numeral, where the circle's chord is far narrower than the equator.
// The 0.84 budget let "AHMEDABAD" graze the lower arc and wrap mid-word.
export function stampNameFontSize(name: string, size: number): number {
  const budget = size * 0.72;
  const longestWord = Math.max(
    1,
    ...name.trim().split(/\s+/).map((w) => w.length),
  );
  return Math.max(3, Math.min(7, budget / (longestWord * 0.7)));
}

/** Rubber-stamp fare-zone ring in brand ink.
 *
 *  R1 sizing contract: EVERY piece of type inside the ring derives from
 *  `size`, so the label + circle scale as one unit wherever the stamp is
 *  placed. The old fixed 7px FARE ZONE label was wider than the chord near
 *  the top arc of a 48px ring, colliding with the dashed border. The stamp
 *  is a decorative ticket fitting (the zone name also appears in the pass
 *  subtitle), so its type is pinned against OS font scaling — accessibility
 *  text sizes must never re-introduce the collision. */
export function ZoneStamp({
  ink,
  zone,
  name,
  size = 52,
}: {
  ink: string;
  zone: number;
  name: string;
  size?: number;
}) {
  // Label chord: the label row sits ~0.3 diameters above center, where the
  // chord is ~0.8 of the diameter. 0.115em per glyph keeps FARE ZONE (9
  // glyphs + tracking) comfortably inside it at any size.
  const labelFontSize = Math.max(4, Math.round(size * 0.115));
  const zoneFontSize = Math.max(12, Math.round(size * 0.375));
  const nameFontSize = stampNameFontSize(name, size);
  return (
    <View
      testID="zone-stamp"
      style={[
        styles.stamp,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: ink,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.stampLabel,
          {
            color: ink,
            fontSize: labelFontSize,
            lineHeight: labelFontSize + 1,
            letterSpacing: labelFontSize >= 6 ? 0.6 : 0.3,
          },
        ]}
      >
        FARE ZONE
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          styles.stampZone,
          { color: ink, fontSize: zoneFontSize, lineHeight: zoneFontSize + 1 },
        ]}
      >
        {zone}
      </Text>
      <Text
        allowFontScaling={false}
        testID="zone-stamp-name"
        style={[
          styles.stampName,
          {
            color: ink,
            maxWidth: size * 0.72,
            fontSize: nameFontSize,
            lineHeight: nameFontSize + 1,
            // Tracking only at full size; squeezed names need every pixel.
            letterSpacing: nameFontSize >= 7 ? 0.5 : 0,
          },
        ]}
      >
        {name.toUpperCase()}
      </Text>
    </View>
  );
}

/** Vertical tear-off perforation with semicircle notch cutouts top and
 *  bottom. `dashColor` picks the dash ink for accent (light) vs card stock;
 *  `holeColor` is the page background the notches punch through to. */
export function TicketPerforationV({
  dashColor,
  holeColor,
}: {
  dashColor: string;
  holeColor: string;
}) {
  // ROOT CAUSE of the build-28 full-screen ticket: this used to render
  // <Svg width={2} height="100%"> as a normal-flow child. The strip's own
  // height is indefinite (alignSelf:'stretch' against a content-sized row),
  // so native Yoga measured the percentage Svg into an unbounded height and
  // the ticket grew to fill the screen. Now the strip has ZERO normal-flow
  // content (its height comes purely from the stretch), and the dash line is
  // drawn after measuring, numerically sized, absolutely positioned.
  const [height, setHeight] = React.useState(0);
  return (
    <View
      style={styles.perf}
      pointerEvents="none"
      testID="ticket-perforation"
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== height) setHeight(h);
      }}
    >
      {height > 0 && (
        <View style={StyleSheet.absoluteFill} testID="ticket-perforation-svg-wrap">
          <Svg testID="ticket-perforation-svg" width={2} height={height}>
            <Line
              x1={1}
              y1={6}
              x2={1}
              y2={height - 6}
              stroke={dashColor}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          </Svg>
        </View>
      )}
      <View style={[styles.notch, styles.notchTop, { backgroundColor: holeColor }]} />
      <View style={[styles.notch, styles.notchBottom, { backgroundColor: holeColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    transform: [{ rotate: '-12deg' }],
    flexShrink: 0,
  },
  // Font size, line height, and tracking are computed per size in ZoneStamp
  // (R1: the stamp's type scales as a unit with the ring).
  stampLabel: {
    fontFamily: AppFonts.extrabold,
  },
  stampZone: {
    fontFamily: AppFonts.extrabold,
  },
  // Size, line height, and tracking are computed per name in ZoneStamp.
  stampName: {
    fontFamily: AppFonts.extrabold,
    textAlign: 'center',
  },
  perf: {
    position: 'relative',
    width: 2,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  notch: {
    position: 'absolute',
    left: -9,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  notchTop: { top: -12 },
  notchBottom: { bottom: -12 },
});
