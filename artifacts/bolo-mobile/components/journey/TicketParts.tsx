// Full-ticket boarding-pass fittings — react-native ports of the web pieces
// (gujarati-coach/src/components/ticket.tsx). Brand colors only, no artwork.
// Shared by the home hero pass and the journey map-header pass.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { AppFonts } from '@/constants/fonts';

let stripeSeq = 0;

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
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
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
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Rubber-stamp fare-zone ring in brand ink. */
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
  return (
    <View
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
      <Text style={[styles.stampLabel, { color: ink }]}>FARE ZONE</Text>
      <Text style={[styles.stampZone, { color: ink }]}>{zone}</Text>
      <Text numberOfLines={1} style={[styles.stampName, { color: ink, maxWidth: size * 0.8 }]}>
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
  return (
    <View style={styles.perf} pointerEvents="none">
      <Svg width={2} height="100%">
        <Line
          x1={1}
          y1={6}
          x2={1}
          y2="100%"
          stroke={dashColor}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      </Svg>
      <View style={[styles.notch, styles.notchTop, { backgroundColor: holeColor }]} />
      <View style={[styles.notch, styles.notchBottom, { backgroundColor: holeColor }]} />
    </View>
  );
}

/** Punched inspection hole. */
export function PunchHole({ color }: { color: string }) {
  return <View style={[styles.punchHole, { backgroundColor: color }]} />;
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
  stampLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 7,
    letterSpacing: 1,
    lineHeight: 8,
  },
  stampZone: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 19,
  },
  stampName: {
    fontFamily: AppFonts.extrabold,
    fontSize: 7,
    letterSpacing: 0.5,
    lineHeight: 8,
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
  punchHole: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
