/**
 * THE RAIL TICKET (owner, 2026-09-05, with the component and the stylesheet
 * handed over as the spec).
 *
 * A port of the owner's RailTicket/RailTicket.css to react-native, replacing
 * the parchment sheet as the home pass's face. The artwork it came from is a
 * raster and could not be used: every value on it is painted into the pixels
 * (GANGA LINE, NEW DELHI, ZONE 1, STOP 6 OF 12, PLATFORM 1) and all five are
 * live, across 22 lines and every stop of every zone. So the design is rebuilt
 * and the words are real text.
 *
 * EVERYTHING SCALES OFF THE WIDTH. The CSS carries two breakpoints, 920 and
 * 700, and neither is a phone: the home pass is about 355 points on a 390
 * phone and 565 in the iPad's column. So the stylesheet's MOBILE values are
 * the base and everything multiplies by `width / 500`, clamped, which keeps
 * the proportions the owner tuned rather than inventing new ones.
 *
 * SIZED IN POINTS, NEVER PERCENTAGES, and no percentage-sized Svg anywhere in
 * normal flow. That is the build-28 rule from TicketParts.tsx: native Yoga
 * measures a percentage-height Svg into an unbounded height and the ticket
 * grows to fill the screen. Every box here is a number.
 *
 * The station art slot is the living platform film (ParchmentPass carries it),
 * dropped to the stylesheet's 0.3 and confined to the right 55%, so the words
 * on the left sit on ticket stock rather than on a moving picture. That is the
 * "lighter backing behind the words" a flat scrim could not give: a full-width
 * wash has no edge, so it reads as lighting rather than as a layer.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppFonts } from '@/constants/fonts';

/** The stylesheet's custom properties, verbatim. */
export const TICKET = {
  bg: '#F7E8C8',
  light: '#FFF5DC',
  gold: '#B48628',
  goldLight: '#D4AC52',
  brown: '#42240F',
  type: '#8E672D',
  meta: '#9E6F25',
  foot: '#966B32',
  stubLine: '#805A27',
  divider: '#9B6B1C',
  perfDot: '#A67931',
  stampInk: '#765021',
  ornament: '#98691B',
  /** The page the notches punch through to. */
  hole: '#F2EADC',
} as const;

/** The stock, as the CSS layers it: a warm diagonal with a light bloom. */
const STOCK = ['#FBEECF', '#F3DFB8', '#FAEDCC'] as const;

export interface RailTicketProps {
  width: number;
  height: number;
  line: string;
  city: string;
  zone: number;
  stop: number;
  totalStops: number;
  platform: number;
  /** The living platform, or any art, painted into the right 55%. */
  art?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function RailTicket({
  width,
  height,
  line,
  city,
  zone,
  stop,
  totalStops,
  platform,
  art,
  style,
  testID,
}: RailTicketProps) {
  // The stylesheet's 700px breakpoint is the base; 500 is where a phone pass
  // lands, so the scale is 1 there and grows into the iPad column.
  const s = Math.max(0.62, Math.min(1.45, width / 500));
  const px = (n: number) => Math.round(n * s);

  const radius = px(20);
  const stubW = Math.round(Math.min(width * 0.33, px(150)));
  const border = Math.max(2, px(3));
  const perfW = px(20);
  const stampSize = Math.min(px(100), Math.round(height * 0.42));
  const destSize = px(37);

  return (
    <View
      testID={testID}
      style={[styles.ticket, { width, height, borderRadius: radius }, style]}
    >
      {/* MAIN */}
      <View
        style={[
          styles.face,
          styles.main,
          {
            borderWidth: border,
            borderRightWidth: 0,
            borderTopLeftRadius: radius,
            borderBottomLeftRadius: radius,
          },
        ]}
      >
        <LinearGradient
          colors={[...STOCK]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* THE STATION ART, right 55%, behind everything and under a wash that
            fades it out toward the words. The CSS does this with a gradient
            over the image; here the art is a node so the film can be it. */}
        {art ? (
          <View style={[styles.art, { width: `55%` }]} pointerEvents="none">
            {art}
            <LinearGradient
              colors={['rgba(246,227,188,0.96)', 'rgba(246,227,188,0.20)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}
        <InnerBorder inset={px(10)} radius={px(14)} gap={px(5)} />
        <View style={[styles.content, { paddingHorizontal: px(25), paddingVertical: px(22) }]}>
          <View style={styles.heading}>
            <Text style={[styles.ornament, { fontSize: px(15), color: TICKET.ornament }]}>
              〰
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.line, { fontSize: px(17), letterSpacing: px(4), marginHorizontal: px(9) }]}
            >
              {line.toUpperCase()}
            </Text>
            <Text style={[styles.ornament, { fontSize: px(15), color: TICKET.ornament }]}>
              〰
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.type, { fontSize: px(11), letterSpacing: px(4), marginTop: px(6) }]}
          >
            BOARDING PASS
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.destination,
              { fontSize: destSize, lineHeight: Math.round(destSize * 0.98), marginTop: px(16) },
            ]}
          >
            {city.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.meta, { fontSize: px(13), letterSpacing: px(2), marginTop: px(8) }]}
          >
            ZONE {zone}
            <Text style={{ color: TICKET.meta }}>{'   •   '}</Text>
            STOP {stop} OF {totalStops}
          </Text>
          <View style={styles.spacer} />
          <View style={[styles.footRule, { paddingTop: px(8), borderTopWidth: 1 }]}>
            <Text
              numberOfLines={1}
              style={[styles.foot, { fontSize: px(8), letterSpacing: px(2) }]}
            >
              PEOPLE   •   PLACES   •   STORIES   •   AHEAD
            </Text>
          </View>
        </View>
      </View>

      {/* PERFORATION */}
      <View style={[styles.perf, { width: perfW, borderTopWidth: border, borderBottomWidth: border }]}>
        <LinearGradient
          colors={['#F3DFB8', '#F7E8C8', '#F3DFB8']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        {Array.from({ length: 11 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: px(7),
              height: px(7),
              borderRadius: px(7),
              backgroundColor: TICKET.perfDot,
            }}
          />
        ))}
        <Punch size={px(42)} border={border} top={-px(25)} />
        <Punch size={px(42)} border={border} bottom={-px(25)} />
      </View>

      {/* STUB */}
      <View
        style={[
          styles.face,
          {
            width: stubW,
            borderWidth: border,
            borderLeftWidth: 0,
            borderTopRightRadius: radius,
            borderBottomRightRadius: radius,
          },
        ]}
      >
        <LinearGradient
          colors={[...STOCK]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <InnerBorder inset={px(8)} radius={px(12)} gap={px(4)} />
        <View style={[styles.stubContent, { paddingHorizontal: px(14), paddingVertical: px(18) }]}>
          <View style={[styles.stubDivider, { height: Math.max(1, px(2)) }]} />
          <Text
            numberOfLines={1}
            style={[styles.admit, { fontSize: px(16), letterSpacing: px(1), paddingVertical: px(8) }]}
          >
            ADMIT ONE
          </Text>
          <View style={[styles.stubDivider, { height: Math.max(1, px(2)) }]} />
          <Text
            numberOfLines={1}
            style={[styles.stubLine, { fontSize: px(9), letterSpacing: px(3), marginTop: px(10) }]}
          >
            {line.toUpperCase()}
          </Text>
          <Stamp size={stampSize} platform={platform} city={city} px={px} />
        </View>
      </View>
    </View>
  );
}

/** The two nested rules the CSS draws as .ticket-inner-border and its ::before. */
function InnerBorder({ inset, radius, gap }: { inset: number; radius: number; gap: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.innerBorder,
        { top: inset, right: inset, bottom: inset, left: inset, borderRadius: radius },
      ]}
    >
      <View
        style={[
          styles.innerBorderInner,
          { top: gap, right: gap, bottom: gap, left: gap, borderRadius: Math.max(2, radius - gap) },
        ]}
      />
    </View>
  );
}

/** A punch-out on the fold: the page showing through, rimmed in gold. */
function Punch({
  size,
  border,
  top,
  bottom,
}: {
  size: number;
  border: number;
  top?: number;
  bottom?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: -size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: TICKET.hole,
        borderWidth: border,
        borderColor: TICKET.gold,
        ...(top !== undefined ? { top } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
      }}
    />
  );
}

/** The platform stamp: two rings, one dashed, sitting a couple of degrees off
 *  true, exactly as the stylesheet rotates it. */
function Stamp({
  size,
  platform,
  city,
  px,
}: {
  size: number;
  platform: number;
  city: string;
  px: (n: number) => number;
}) {
  return (
    <View
      testID="rail-ticket-stamp"
      style={[
        styles.stamp,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginTop: px(12),
          paddingVertical: size * 0.12,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.stampRing, { borderRadius: size / 2, margin: size * 0.08 }]}
      />
      <Text style={[styles.stampTop, { fontSize: Math.max(6, px(8)) }]} numberOfLines={1}>
        PLATFORM {platform}
      </Text>
      <MaterialCommunityIcons
        name="train"
        size={Math.round(size * 0.34)}
        color={TICKET.brown}
      />
      <Text style={[styles.stampCity, { fontSize: Math.max(6, px(8)) }]} numberOfLines={1}>
        {city.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    // The CSS drop-shadows, as one iOS shadow plus Android elevation.
    shadowColor: '#462B12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  face: { position: 'relative', overflow: 'hidden', borderColor: TICKET.gold },
  main: { flex: 1, minWidth: 0 },
  art: { position: 'absolute', right: 0, top: 0, bottom: 0, opacity: 0.55, overflow: 'hidden' },
  innerBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(141, 96, 23, 0.9)',
    zIndex: 5,
  },
  innerBorderInner: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(177, 130, 47, 0.45)',
  },
  content: { flex: 1, zIndex: 3 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ornament: { fontFamily: AppFonts.regular },
  line: { fontFamily: AppFonts.extrabold, color: TICKET.brown },
  type: { fontFamily: AppFonts.semibold, color: TICKET.type, textAlign: 'center' },
  destination: { fontFamily: AppFonts.extrabold, color: TICKET.brown, letterSpacing: -0.5 },
  meta: { fontFamily: AppFonts.semibold, color: TICKET.brown },
  spacer: { flex: 1 },
  footRule: { borderTopColor: 'rgba(160, 113, 39, 0.45)' },
  foot: { fontFamily: AppFonts.semibold, color: TICKET.foot },
  perf: {
    alignItems: 'center',
    justifyContent: 'space-evenly',
    borderColor: TICKET.gold,
    zIndex: 10,
  },
  stubContent: { flex: 1, alignItems: 'center', zIndex: 3 },
  stubDivider: { alignSelf: 'stretch', backgroundColor: TICKET.divider },
  admit: { fontFamily: AppFonts.extrabold, color: TICKET.brown },
  stubLine: { fontFamily: AppFonts.semibold, color: TICKET.stubLine },
  stamp: {
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: TICKET.stampInk,
    transform: [{ rotate: '-2deg' }],
  },
  stampRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(99, 60, 20, 0.75)',
  },
  stampTop: { fontFamily: AppFonts.extrabold, color: TICKET.brown, letterSpacing: 1 },
  stampCity: { fontFamily: AppFonts.extrabold, color: TICKET.brown, letterSpacing: 1 },
});
