// Spec D1b-M: the journey map, ported from the shipped web page
// (gujarati-coach/src/pages/journey.tsx — the source of truth; this is a
// translation, not a redesign). One themed rail line per language (structured
// content in lib/journeyLines.ts), six fare zones in authoritative category
// order, one station per lesson group (phrase-stage stops before
// sentence-stage), states straight from the unlock API. For plan-locked
// languages the map renders in teaser/exhausted "showroom" mode per the API's
// access envelope: full structure, everything locked except the marked teaser
// station. tested_out = express stamp, sentence stage = first-class diamond +
// All-Access chip, locked showroom zones = grayscale postcards.
//
// The rail is the web's PRONOUNCED serpentine railway track — stations
// alternate left/right, twin rails with sleeper ties curve between them,
// completed segments solid, locked segments faded and dashed. Rendering
// approach (approved): react-native-svg with the web's exact path geometry,
// split into per-zone Svg blocks inside the ScrollView for scroll perf.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop as GradStop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  ApiError,
  useGetTokens,
  useListCategories,
  useListCategoryLessonGroups,
  useListZoneStamps,
  useListScenarios,
  useRecordSignalWave,
  useRecordChachaEncounter,
  useUnlockStop,
  type LessonGroupList,
  type LessonGroupSummary,
  type ChachaEncounterResult,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { LessonError } from '@/components/LessonError';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import {
  storyBookFor,
  storyStopIndexIn,
  isStoryTeaserBook,
  type StoryBook,
} from '@workspace/story';
import {
  hasEmergency,
  EMERGENCY_AFTER_STOP,
  EMERGENCY_JOURNEY,
} from '@workspace/emergency';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useTraceStopProgress } from '@/lib/useTraceStopProgress';
import {
  traceStopCopy,
  traceStopFor,
  traceStopIndexIn,
  traceStopPassedCount,
  traceStopStatus,
  type TraceStop,
} from '@workspace/script-trace';
import { asUpgradeRequired } from '@/lib/entitlements';
import { JOURNEY_ZONES, getJourneyLine, getRailBrand } from '@/lib/journeyLines';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import { SignalGlyph, type SignalState } from '@/components/journey/SignalGlyph';
import {
  SignalEncounterDialog,
  type SignalEncounter,
} from '@/components/journey/SignalEncounter';
import { MilestoneToast } from '@/components/MilestoneToast';
import { planTracksideSignals, signalContextRef } from '@/lib/tracksideSignals';
import { gameForSignal } from '@/lib/quick-games';
import { useSignalMemory } from '@/lib/signalMemory';
import { isChachaEncounterStation, useChachaMemory } from '@/lib/chachaMemory';
import { ChachaEncounterDialog } from '@/components/journey/ChachaEncounter';
import { closeoutOwed, useCloseoutMemory } from '@/lib/closeoutMemory';
import { ZoneCloseoutOverlay } from '@/components/journey/ZoneCloseout';
import { playStopSplash } from '@/lib/stopSplash';
import { RAIL, RAIL_GLOW_PASSES, RAIL_STROKE } from '@/lib/railPalette';
import {
  BADGE,
  MAP_GLYPH_PLATE,
  MAP_GLYPH_PLATE_FILL,
  TICKET,
} from '@/lib/ticketStock';
import {
  INTRO_SCROLL,
  introScrollDurationMs,
  introScrollEase,
  introScrollLead,
} from '@/lib/journeyIntroScroll';
import {
  ZONE_BACKDROP_SCRIM,
  ZONE_BACKDROP_SCRIM_COLOR,
  ZONE_BOARD,
  ZONE_BOARD_ART,
  ZONE_TILE_ASPECT,
  zoneBackdrop,
  zoneFootTone,
} from '@/lib/zoneBackdrops';
import {
  stopEmblem,
  type StopEmblemKind,
} from '@/lib/stopEmblems';
import { factForZone } from '@/lib/indiaFactForZone';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import {
  Bunting,
  SceneryElement,
  ZoneVista,
  SCENERY_GRAY,
  SCENERY_PLACEMENT,
  STALL_PLACEMENT,
  planChachaStalls,
  planZoneScenery,
} from '@/components/journey/Scenery';
import { useColors } from '@/hooks/useColors';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

const GRAY = SCENERY_GRAY; // rail/marker color for locked showroom zones

// Serpentine layout rhythm — identical to the web map (which is itself
// mobile-width, max 390px).
const MAP_MAX_W = 390;
// Task 1082 item 2: web parity. The station card was slimmed (tighter padding
// and line spacing, and no "Bolo is waiting here" fragment, which used to wrap
// the current stop's status onto a second line), so the slot holding it comes
// down with it. Chacha-ji's stall now sits in the station's own row, to the
// LEFT of the marker, so a card growing a second line no longer reaches it.
const STATION_H = 88; // vertical rhythm per station row
const CARD_PROGRESS_W = 80; // mastered-progress track width (web: w-20)
// 184, MATCHING WEB, and it was 152 until the carved board shipped. That gap
// is why the board's panel rendered EMPTY on the phone through 511 and 512: the
// pediment takes width * 142/760 of the board, about 67pt at a 358pt column,
// and 152 left only 85 for the panel against roughly 98 of content and inset.
// With overflow hidden, "not enough room" looks exactly like "nothing there".
//
// I fixed this twice from screenshots without checking the number, which is the
// whole lesson: the two platforms had never shared this constant, and I assumed
// they did. ZONE_BOARD.minPanelH now asserts the budget on both sides so a
// board that cannot fit fails a test rather than shipping blank.
const PC_H = 184; // vertical rhythm per fare-zone postcard (incl. picture side)
const ZONE_BOARD_GAP = 18; // air between the carved board and the first stop card
/**
 * The scroll content's own top pad, named because two places must agree on it:
 * the contentContainerStyle that creates it, and the slide-in maths that turns
 * a card's canvas y into a SCROLL CONTENT y. A literal in both is how an
 * entrance animation ends up firing 18pt early forever.
 */
const SCROLL_CONTENT_TOP = 18;
const TERM_H = 92; // terminus row
// CHACHA-JI'S HALT ROW, RETIRED 2026-08-26. It was a scenery-only row after
// every encounter station, 96 high, existing only so his stall had a lane clear
// of the station card. Six of them over a journey is about 576 of map carrying
// no stop and nothing tappable, and at 96 it spent MORE height on a decoration
// than STATION_H spends on a stop.
//
// It went once the stall moved to the LEFT of the marker. The whole reason the
// row existed, and the reason HALT_H had to grow from 74 to 96 on 2026-08-25
// when a card's second line reached the stall, is that the old lane put the
// stall on the SAME side as the card. Encounter stations are always left-flank,
// so their card is on the right and their left is empty. See
// STALL_PLACEMENT.laneDxLeft for the arithmetic.
//
// The underlying mismatch the old comment named is still real and still not
// fixed: rows are laid out on a fixed pitch while a card's height is variable.
// Moving the stall took it off that collision course rather than solving it.
// Item 3: drop of the terminus label below the terminus dot's center. The dot
// is 28px across, so its lowest ink is termY+14; the bunting hangs ABOVE it.
// 18 clears both and keeps the label inside the terminus row.
const TERM_LABEL_DY = 18;
const TOP_PAD = 10;
const LEFT_X = 92; // marker x for even-index stations

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
  /**
   * Present ONLY on the story stop, and the discriminator for it.
   *
   * Same arrangement as `trace` below and for the same reason: a story stop is
   * not a lesson group, so it has no row, no phrases and no id. EVERYTHING that
   * renders, measures or opens a station must branch on this alongside `trace`.
   * Build 5 found out on the web what happens otherwise: a non-phrase row that
   * advances `k` slides Chacha-ji's stall down the line and flips every card
   * onto the wrong side of the track, and one missing condition broke five
   * things at once.
   */
  story?: StoryBook;
  /**
   * Present ONLY on the tracing stop, and the discriminator for it.
   *
   * A trace stop is not a lesson group: no row, no phrases, no id. It is
   * synthesised and marked, and everything that renders or opens a station
   * branches on this rather than on a sentinel id, which would be one refactor
   * away from colliding with a real one.
   */
  trace?: TraceStop;
  /** The stop's own status line, resolved where the passed set is in scope. */
  traceCopy?: string;
  /** The tracing stop's own progress, carried so the card can draw a track:
   *  its copy already counted the letters and only the bar was missing. */
  traceDone?: number;
  traceTotal?: number;
};

type LockInfo = {
  kind: 'progression' | 'sentence' | 'language' | 'plan';
  stopLabel: string;
  zoneTitle: string;
  /** Route pieces for the progression dialog's test-out action. */
  zoneId?: number;
  groupId?: number;
  /** Server says this locked stop can be opened with Chai (first zone only). */
  chaiUnlockable?: boolean;
};

/** Chai stop-unlock failures. Insufficient balance keeps the wallet's exact
 *  copy register so every Chai refusal in the app reads the same way. */
function unlockErrorCopy(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const data = error.data as
      | { error?: string; balance?: number; cost?: number }
      | null;
    if (data?.error === 'insufficient_tokens') {
      return `Not enough Chai yet. You have ${data.balance ?? 0}, this costs ${data.cost ?? 0}. Keep riding to earn more.`;
    }
  }
  return 'That unlock did not go through. Try again in a moment.';
}

function stageRank(g: LessonGroupSummary): number {
  return g.stage === 'sentence' ? 1 : 0;
}

function isStatusAccessible(status: LessonGroupSummary['status']): boolean {
  return (
    status === 'unlocked' ||
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'tested_out'
  );
}

/** Station signboard silhouette shown beside the current stop's name — the
 *  rn-svg port of the web StationSignGlyph (journey.tsx). */
function StationSignGlyph({ color }: { color: string }) {
  return (
    <Svg testID="station-sign-glyph" width={14} height={12} viewBox="0 0 14 12" fill="none">
      <Path d="M1 4 L7 0.5 L13 4 Z" fill={color} />
      <Rect x={2.5} y={4.5} width={9} height={3.5} rx={1} fill={color} opacity={0.3} />
      <Rect x={3.5} y={8} width={1.4} height={4} fill={color} />
      <Rect x={9.1} y={8} width={1.4} height={4} fill={color} />
    </Svg>
  );
}

/** Pulsing zone-colored ring around the current stop's signboard card (web:
 *  station-stop-glow keyframes, 2.6s opacity 0.45→1). Extracted so the loop
 *  hook lives outside the station map loop; callers gate on reduced motion.
 *  Opacity-only animation; the ring + shadow are static styles. */
function StopGlowPulse({ color }: { color: string }) {
  const progress = useLoopProgress(2600, true);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.45, 1, 0.45]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      testID="stop-glow"
      // R2 (32.1): the ring carries an iOS soft shadow (shadowRadius 8) and
      // pulses opacity every frame. Rasterizing lets Core Animation fade one
      // cached texture instead of recompositing the shadow per frame; the
      // Android hardware-texture hint gives the same cached-layer fade.
      shouldRasterizeIOS
      renderToHardwareTextureAndroid
      style={[styles.stopGlow, { borderColor: color, shadowColor: color }, style]}
    />
  );
}

const AnimatedG = Animated.createAnimatedComponent(G);

// Rail comet tuning, mirroring the web source of truth (RAIL_PULSE in
// lib/motion.tsx plus the --rail-pulse-* custom properties in index.css):
// 10 bezier samples per segment, r=4 dots, one 3.4s traversal of the run.
const RAIL_PULSE = {
  dotsPerSegment: 10,
  dotRadius: 4,
} as const;
const RAIL_PULSE_CYCLE_MS = 3400;

// 2.5D depth pass tuning (web Task 985, DEPTH_2_5D in lib/motion.tsx): the
// scenery layer's scroll parallax factor and the rail-bed underlay offset.
const DEPTH_2_5D = {
  parallaxFactor: 0.03,
  railBedDy: 2.5,
  railBedOpacity: 0.18,
} as const;

/** One comet dot: opacity follows the web keyframes (invisible at 0%, sharp
 *  attack to full strength at 4%, slow decay back to zero through 22%),
 *  phase-shifted by the dot's order along the run so one bright head with a
 *  fading tail travels from the current stop toward the next station. The
 *  larger soft circle underneath stands in for the web's currentColor
 *  drop-shadow glow (rn-svg has no CSS filters). */
function RailPulseDot({
  x,
  y,
  delayFrac,
  color,
  progress,
}: {
  x: number;
  y: number;
  delayFrac: number;
  color: string;
  progress: SharedValue<number>;
}) {
  // R2 (32.1): ONE animated node per dot. The halo used to carry its own
  // useAnimatedProps (0.35x the head keyframe), doubling the per-frame SVG
  // prop writes on the UI thread; a shared group opacity with a static 0.35
  // halo fill opacity is visually equivalent and halves that work.
  const groupProps = useAnimatedProps(() => ({
    opacity: interpolate(
      (progress.value - delayFrac + 1) % 1,
      [0, 0.04, 0.22, 1],
      [0, 1, 0, 0],
    ),
  }));
  return (
    <AnimatedG animatedProps={groupProps}>
      <Circle
        cx={x}
        cy={y}
        r={RAIL_PULSE.dotRadius + 3}
        fill={color}
        opacity={0.35}
      />
      <Circle
        testID="rail-pulse-dot"
        cx={x}
        cy={y}
        r={RAIL_PULSE.dotRadius}
        fill={color}
      />
    </AnimatedG>
  );
}

/** Comet sweep on the active run (web tasks #917/#973 port): dots sampled on
 *  the same cubic beziers the rail draws, delay fraction growing with sample
 *  order from the current stop toward the next station. One shared clock per
 *  Svg slice keeps that slice's dots in phase; slices start their clocks on
 *  the same mount pass, so the sweep stays continuous across postcard seams.
 *  Callers gate on reduced motion (the dot list is empty). */
function RailPulseDots({
  dots,
  start,
  end,
  color,
}: {
  dots: { x: number; y: number }[];
  start: number;
  end: number;
  color: string;
}) {
  const progress = useLoopProgress(RAIL_PULSE_CYCLE_MS, true);
  return (
    <>
      {dots.map((d, i) =>
        d.y >= start && d.y < end ? (
          <RailPulseDot
            key={i}
            x={d.x}
            y={d.y}
            delayFrac={i / dots.length}
            color={color}
            progress={progress}
          />
        ) : null,
      )}
    </>
  );
}

/** Marker sitting on the rail: a cut brass emblem saying what KIND of stop
 *  this is, and a train at the current one. */
/**
 * THE ZONE'S PAINTING, PINNED TO THE VIEWPORT WHILE ITS ZONE IS ON SCREEN
 * (chat 11). The band used to scroll with its stops and the owner called it
 * on sight: "look like the background is scrolling with the cards which isn't
 * correct" — the painting is the zone's WALL, not one of the objects on it.
 * A scroll-driven counter-translation holds it still relative to the
 * viewport, clamped to its own zone's block, so it parks at the zone
 * boundary and the NEXT zone's wall pushes it out exactly when the next
 * board takes over: "background image shouldn't change until you hit zone 2."
 * Same mechanism as the scenery parallax (scrollY shared value on the UI
 * thread), which ships in production today.
 */
function ZoneBandFixed({
  zi,
  start,
  end,
  layerTop,
  windowW,
  windowH,
  mapW,
  scrollY,
  contentTop,
  mode = 'block',
}: {
  zi: number;
  start: number;
  end: number;
  layerTop: number;
  windowW: number;
  windowH: number;
  mapW: number;
  scrollY: SharedValue<number>;
  contentTop: number;
  /** 'block': the zone block's wall, the box counter-scrolls. 'cap': the same
   *  wall's top rows INSIDE the sticky board child, so scrolling cards pass
   *  BEHIND the board instead of gliding visibly through its transparent
   *  margins; here the box is fixed and the tiles counter-scroll within. */
  mode?: 'block' | 'cap';
}) {
  const bandH = windowH + PC_H + ZONE_BOARD_GAP;
  const travel = Math.max(0, end - start - windowH);
  const pin = useAnimatedStyle(() => {
    const shift = Math.min(
      travel,
      Math.max(0, scrollY.value - (start + contentTop)),
    );
    return { transform: [{ translateY: mode === 'cap' ? -shift : shift }] };
  });
  const art = zoneBackdrop(zi);
  const tileH = windowW / ZONE_TILE_ASPECT;
  if (!art) return null;
  const tiles = (
    <>
      {Array.from({ length: Math.max(1, Math.ceil(bandH / tileH)) }).map(
        (_, ti) => (
          <Image
            key={ti}
            source={art}
            style={{
              position: 'absolute',
              top: ti * tileH,
              width: windowW,
              height: tileH,
            }}
            resizeMode="stretch"
          />
        ),
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: ZONE_BACKDROP_SCRIM_COLOR,
            opacity: ZONE_BACKDROP_SCRIM,
          },
        ]}
      />
    </>
  );
  if (mode === 'cap') {
    return (
      <View
        testID={`journey-board-cap-${zi}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -(windowW - mapW) / 2,
          top: 0,
          width: windowW,
          // +2 laps the block band so the cap's bottom edge cannot show as a
          // hairline seam under the board.
          height: PC_H + ZONE_BOARD_GAP + 2,
          backgroundColor: zoneFootTone(zi),
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ position: 'absolute', left: 0, top: 0, width: windowW, height: bandH }, pin]}
        >
          {tiles}
        </Animated.View>
      </View>
    );
  }
  return (
    <Animated.View
      testID={`journey-backdrop-${zi}`}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: -(windowW - mapW) / 2,
          top: layerTop,
          width: windowW,
          height: bandH,
          backgroundColor: zoneFootTone(zi),
          overflow: 'hidden',
        },
        pin,
      ]}
    >
      {tiles}
    </Animated.View>
  );
}

/**
 * THE TAG'S OWN SHAPE, drawn rather than styled (chat 11). The reference cuts
 * every stop card as a LUGGAGE TAG: one end tapers to the eyelet it hangs by,
 * and "each card has a slightly different shape". A View border cannot taper,
 * so the stock, the edge, the hairline rule, the eyelet and the per-kind
 * dressing are all one Svg behind the content:
 *
 *   plain    parchment gradient, single rule
 *   ahead    the same tag, aged stock, drained edge
 *   done     gold-foil stock, gold rule, accent corner ornament
 *   trace    parchment with a folded dog-ear on the far corner
 *   story    parchment with a DOUBLE rule, the reference's framed plaque
 *   current  parchment with the zone accent for an edge
 *
 * The gradient down the stock is what reads as "more rustic" against the flat
 * fills these replaced; the taper is what makes the card hang off the rail
 * instead of floating beside it.
 */
function TagCardBack({
  w,
  h,
  side,
  variant,
  accent,
}: {
  w: number;
  h: number;
  side: 'left' | 'right';
  variant: 'plain' | 'ahead' | 'done' | 'trace' | 'story' | 'current';
  accent: string;
}) {
  const r = 10; // corner rounding on the square end
  const T = 15; // the tag point's depth on the eyelet end
  // THE MIX (chat 11, "some of them with points, some of them rectangles.
  // like my example"): phrase stops hang as pointed luggage tags; the tracing
  // stop is a square-cut paper sheet with its dog-ear and the story stop a
  // square-cut framed plaque, which is exactly how the reference cuts them.
  const pointed = variant !== 'trace' && variant !== 'story';
  const gid = `tag-${variant}-${side}`;
  // Completed tags are NOT a different paper: a full gold stock read as "why
  // are some different colors?" (chat 11). Done shows in the gold EDGE, the
  // gold rule and the corner ornament, on the same parchment as every tag.
  const [c0, c1] =
    variant === 'ahead'
      ? [TICKET.stockAheadTop, TICKET.stockAheadBottom]
      : [TICKET.stockTop, TICKET.stockBottom];
  const edge =
    variant === 'done'
      ? TICKET.edgeGold
      : variant === 'current'
        ? accent
        : variant === 'ahead'
          ? TICKET.edgeAhead
          : TICKET.edge;
  const rule =
    variant === 'done' ? TICKET.ruleGold : variant === 'ahead' ? '#D8CBB4' : TICKET.rule;
  // FLAT TOP AND BOTTOM, POINTED END (chat 11, two corrections in a row):
  // the first cut sloped the long edges into the point ("are the top of the
  // card and the bottom of the card horizonal parallels?"), the second cut
  // the point entirely and was reversed on sight ("the point is ok"). The
  // long edges run dead level from the shoulder; only the two short cuts
  // between the shoulders and the tip are angled, which is how a real
  // luggage tag is die-cut.
  const L = 1;
  const Tp = 1;
  const mid = h / 2;
  const i = 5;
  const R = w - 1;
  const B = h - 1;
  const outline =
    side === 'left'
      ? `M ${L} ${mid} L ${L + T} ${Tp} L ${R - r} ${Tp} Q ${R} ${Tp} ${R} ${Tp + r} L ${R} ${B - r} Q ${R} ${B} ${R - r} ${B} L ${L + T} ${B} Z`
      : `M ${R} ${mid} L ${R - T} ${Tp} L ${L + r} ${Tp} Q ${L} ${Tp} ${L} ${Tp + r} L ${L} ${B - r} Q ${L} ${B} ${L + r} ${B} L ${R - T} ${B} Z`;
  const ruleD =
    side === 'left'
      ? `M ${L + i + 4} ${mid} L ${L + T + i} ${Tp + i} L ${R - r - 1} ${Tp + i} Q ${R - i} ${Tp + i} ${R - i} ${Tp + r} L ${R - i} ${B - r} Q ${R - i} ${B - i} ${R - r - 1} ${B - i} L ${L + T + i} ${B - i} Z`
      : `M ${R - i - 4} ${mid} L ${R - T - i} ${Tp + i} L ${L + r + 1} ${Tp + i} Q ${L + i} ${Tp + i} ${L + i} ${Tp + r} L ${L + i} ${B - r} Q ${L + i} ${B - i} ${L + r + 1} ${B - i} L ${R - T - i} ${B - i} Z`;
  const eyeX = pointed ? (side === 'left' ? L + 13 : R - 13) : side === 'left' ? 9 : w - 9;
  // The dog-ear and the corner ornament live on the far top corner.
  const foldD =
    side === 'left'
      ? `M ${R - 18} ${Tp} L ${R} ${Tp + 18} L ${R} ${Tp + r} Q ${R} ${Tp} ${R - r} ${Tp} Z`
      : `M ${L + 18} ${Tp} L ${L} ${Tp + 18} L ${L} ${Tp + r} Q ${L} ${Tp} ${L + r} ${Tp} Z`;
  const ornD =
    side === 'left'
      ? `M ${R - 22} ${Tp} L ${R} ${Tp} L ${R} ${Tp + 22} Q ${R - 4} ${Tp + 4} ${R - 22} ${Tp} Z`
      : `M ${L + 22} ${Tp} L ${L} ${Tp} L ${L} ${Tp + 22} Q ${L + 4} ${Tp + 4} ${L + 22} ${Tp} Z`;
  return (
    <Svg
      testID={`tag-back-${variant}`}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
    >
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <GradStop offset="0" stopColor={c0} />
          <GradStop offset="1" stopColor={c1} />
        </LinearGradient>
      </Defs>
      {pointed ? (
        <Path
          d={outline}
          fill={`url(#${gid})`}
          stroke={edge}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ) : (
        <Rect
          x={L}
          y={Tp}
          width={w - 2}
          height={h - 2}
          rx={r}
          fill={`url(#${gid})`}
          stroke={edge}
          strokeWidth={2}
        />
      )}
      {pointed ? (
        <Path d={ruleD} fill="none" stroke={rule} strokeWidth={1} strokeLinejoin="round" />
      ) : (
        <Rect
          x={L + i}
          y={Tp + i}
          width={w - 2 - 2 * i}
          height={h - 2 - 2 * i}
          rx={r - 4}
          fill="none"
          stroke={rule}
          strokeWidth={1}
        />
      )}
      {variant === 'story' && (
        <Rect
          x={L + i + 3}
          y={Tp + i + 3}
          width={w - 2 - 2 * (i + 3)}
          height={h - 2 - 2 * (i + 3)}
          rx={r - 6}
          fill="none"
          stroke={rule}
          strokeWidth={1}
          opacity={0.55}
          strokeDasharray="3 3"
        />
      )}
      {variant === 'trace' && (
        <>
          <Path d={foldD} fill={TICKET.stockBottom} stroke={TICKET.edge} strokeWidth={1.4} />
        </>
      )}
      {variant === 'done' && <Path d={ornD} fill={accent} opacity={0.75} />}
      {/* The eyelet at the tip, ring and hole, exactly the old View pair. */}
      <Circle cx={eyeX} cy={mid} r={6} fill={TICKET.eyelet} />
      <Circle cx={eyeX} cy={mid} r={2.6} fill={TICKET.eyeletHole} />
    </Svg>
  );
}

/**
 * A STOP CARD THAT SLIDES ONTO THE RAIL AS IT COMES INTO VIEW.
 *
 * Asked for 2026-08-27: "can we add animation while we scroll to have the
 * stops slide in from left or right?" Each card enters from ITS OWN FLANK, so
 * a right-hand tag arrives from the right and settles against its medallion.
 * Sliding them all from one side would read as a list loading; from their own
 * side it reads as the tag being hung on the rail.
 *
 * A COMPONENT, NOT AN INLINE useAnimatedStyle, AND THAT IS NOT STYLE. The
 * card list is built with .map over a row array whose LENGTH CHANGES with the
 * data, so a hook called inside that loop is a conditional hook: this exact
 * file has already shipped one of those, on both platforms. One component per
 * card keeps every hook unconditional by construction.
 *
 * TRANSFORM AND OPACITY ONLY. Both are cheap and neither touches layout, so
 * fifty of these cannot cost a single layout pass on a map that is already
 * drawing an SVG rail, a painted backdrop and the scenery.
 *
 * It reads the SAME scrollY the parallax and the pinned zone band already use,
 * so this adds a subscriber rather than a second source of scroll truth.
 */
const SLIDE_DX = 44;
/** How much scrolling it takes a card to settle, in points. */
const SLIDE_TRAVEL = 240;
/** How far up the viewport a card is fully home. 0.82 means it finishes just
 *  after it clears the bottom edge, rather than still moving mid-screen. */
const SLIDE_LEAD = 0.82;

function SlidingCardSlot({
  cardY,
  side,
  windowH,
  scrollY,
  reduceMotion,
  style,
  children,
}: {
  /** The card's top in SCROLL CONTENT coordinates, not canvas ones. */
  cardY: number;
  side: 'left' | 'right';
  windowH: number;
  scrollY: SharedValue<number>;
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const anim = useAnimatedStyle(() => {
    // Reduced motion gets the resting frame, never a slower slide: a learner
    // who asked the system to stop moving things asked for that.
    if (reduceMotion) return {};
    const start = cardY - windowH * SLIDE_LEAD;
    const p = Math.min(1, Math.max(0, (scrollY.value - start) / SLIDE_TRAVEL));
    return {
      opacity: 0.4 + 0.6 * p,
      transform: [{ translateX: (1 - p) * SLIDE_DX * (side === 'right' ? 1 : -1) }],
    };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
  background,
  border,
  goldPalette,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  background: string;
  border: string;
  goldPalette?: { chassis: string; body: string; trim: string; steam: string };
}) {
  if (isCurrent) {
    // White pill + accent ring + soft outer ring (web: box-shadow rings).
    return (
      <View style={[styles.markerCurrentOuter, { backgroundColor: `${color}33` }]}>
        <View style={[styles.markerCurrentRing, { backgroundColor: color }]}>
          <View style={styles.markerCurrentPill}>
            <TrainEngine tint={color} width={32} height={22} motion="bob" palette={goldPalette} />
          </View>
        </View>
      </View>
    );
  }
  const done = station.status === 'completed' || station.status === 'tested_out';

  // WHAT KIND OF STOP, not what state it is in. The card beside every stop
  // already says "Completed" and "8/10 mastered", so a marker that only encoded
  // status was repeating it while leaving the thing it alone could say, that
  // this one is a tracing stop and that one is a story, to a chip.
  //
  const kind: StopEmblemKind = station.trace
    ? 'trace'
    : station.story
      ? 'story'
      : 'station';
  // NO DIAMOND ANY MORE, and the question that killed it was the right one:
  // "why are some diamond behind and some circle?" The rotated frame meant
  // "first-class sentence stop", so the marker carried TWO encodings at once,
  // shape for entitlement and emblem for kind, on a 26px disc. That is exactly
  // the doubling-up the medallions were introduced to end. A sentence stop
  // already says so on its card, in words, with an ALL-ACCESS plate.
  //
  // BIGGER, TOO. The reference draws these as prominent brass discs.
  return (
    <View testID={`station-medallion-${kind}`} style={styles.medallion}>
      {/* THE ART, AT FULL STRENGTH, AND NOTHING ELSE. No disc, no rim, no
          locked ring, no knock-back alpha. Reported three times off the
          preview: "medallions shouldn't be opaque", "still see circles",
          "some icons still too transparent". Every one of those was chrome
          drawn around art that already is a medallion.
          Whether a stop is reached is said twice over already, by the card's
          drained stock and by the rail arriving dashed instead of green. */}
      <Image
        source={stopEmblem(kind)}
        style={styles.medallionArt}
        resizeMode="contain"
      />
    </View>
  );
}

/** A trackside signal seated in the gap after an odd global stop, with the
 *  geometry the map needs on top of the encounter payload the dialog needs. */
type SignalSpot = SignalEncounter & {
  signalIndex: number;
  x: number;
  y: number;
  /** True when the run is held at this crossing (the train stopped here). */
  held: boolean;
};

/** Signal glyph half-width and the nudge off the rail, in map px. */
const SIGNAL_HALF_W = 20;
const SIGNAL_GAP_DX = 30;

/**
 * Soft stop: reaching a held signal auto-opens its encounter ONCE per signal
 * per session. Renders nothing; it exists as a component purely so the effect
 * can live below the map's early returns. Waved and cleared signals are never
 * held, so they can never trigger this.
 */
function SignalSoftStop({
  sig,
  blocked,
  hydrated,
  isStopSeen,
  markStopSeen,
  onOpen,
}: {
  sig: SignalSpot | null;
  blocked: boolean;
  hydrated: boolean;
  isStopSeen: (gap: number) => boolean;
  markStopSeen: (gap: number) => void;
  onOpen: (sig: SignalSpot) => void;
}) {
  const gap = sig?.gap;
  useEffect(() => {
    // Never over another dialog, and never before the device's cleared marks
    // have hydrated: a signal that is really cleared must not burn its one
    // auto-open of the session showing a stale state.
    if (!sig || gap === undefined || blocked || !hydrated) return;
    if (isStopSeen(gap)) return;
    markStopSeen(gap);
    onOpen(sig);
  }, [sig, gap, blocked, hydrated, isStopSeen, markStopSeen, onOpen]);
  return null;
}
/**
 * Seen is written when the server answers, not here: a request that never
 * lands must not cost the learner this station's chai. The in-flight guard
 * keeps a re-render from firing a second arrival, and it resets on remount so
 * a failed one is retried the next time they open the map.
 */
function ChachaSoftStop({
  station,
  blocked,
  hydrated,
  isSeen,
  onOpen,
}: {
  station: number | null;
  blocked: boolean;
  hydrated: boolean;
  isSeen: (station: number) => boolean;
  onOpen: (station: number) => void;
}) {
  const asked = useRef<number | null>(null);
  useEffect(() => {
    if (station === null || blocked || !hydrated) return;
    if (isSeen(station)) return;
    if (asked.current === station) return;
    asked.current = station;
    onOpen(station);
  }, [station, blocked, hydrated, isSeen, onOpen]);
  return null;
}


/**
 * THE EMERGENCY, fired between stop 8 and stop 9 of a zone. Twin of the web's
 * EmergencySoftStop, and the same shape as the two watchers above it.
 *
 * NOTHING IS DRAWN ON THE MAP FOR IT, which is the property to protect. It adds
 * no station to `stations`, no point to `pts`, and nothing to `rowStations`. An
 * interruption you can see on the timetable is an appointment; and because it
 * never touches the geometry, it cannot repeat the bug where a new row advanced
 * `k` and slid Chacha-ji's stalls down the line.
 *
 * The ref is why it does not loop. Standing on stop 9 renders many times and a
 * bare condition would fire on every one.
 */
function EmergencySoftStop({
  zone,
  blocked,
  onFire,
}: {
  /** 1-based zone whose stop 9 the learner is standing on, or null. */
  zone: number | null;
  blocked: boolean;
  onFire: (zone: number) => void;
}) {
  const fired = useRef<number | null>(null);
  // THE ZONE THE LEARNER WAS ALREADY STANDING IN WHEN THE MAP OPENED. Firing on
  // it made the journey bounce straight into the Emergency game on arrival, so
  // the boarding pass appeared to skip the map entirely.
  //
  // THE JOURNEY IS THE DESTINATION. An encounter is something you CROSS INTO
  // while you are on the map, not something that meets you at the door, so the
  // first zone this sees in a visit arms the watcher rather than firing it.
  // Web twin: EmergencyWatcher in gujarati-coach/src/pages/journey.tsx.
  const armedAt = useRef<number | null>(null);
  useEffect(() => {
    if (zone === null || blocked) return;
    if (armedAt.current === null) {
      armedAt.current = zone;
      return;
    }
    if (zone === armedAt.current) return;
    // A zone with no film has no Emergency, silently.
    if (!hasEmergency(EMERGENCY_JOURNEY, zone)) return;
    if (fired.current === zone) return;
    fired.current = zone;
    onFire(zone);
  }, [zone, blocked, onFire]);
  useEffect(() => {
    if (zone === null) fired.current = null;
  }, [zone]);
  return null;
}


export default function JourneyScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width: windowW, height: windowH } = useWindowDimensions();
  // The main render opts out of Screen's top padding (padTop={false}) so the
  // header hugs the top edge, which shoved it under the status bar/notch on
  // native. Pad the header itself with the same inset Screen would apply
  // (web preview uses Screen's fixed 67px chrome offset). The loading/error
  // branches below use a plain <Screen> and keep its default padding, so
  // only this header needs the explicit inset.
  const insets = useSafeAreaInsets();
  const headerTopInset = Platform.OS === 'web' ? 67 : insets.top;
  const { activeLang, activeLanguage } = useLanguage();
  // Only for placing the free taste: which tracing stops this learner may open.
  // Everything else on this screen gates on the server's own planLocked flag.
  const { isPlus } = useEntitlements();
  // Which letters are already traced, so each zone's tracing stop shows real
  // progress rather than always reading as untouched.
  const { passedCharacterIds } = useTraceStopProgress(activeLang);
  const railBrand = getRailBrand(activeLang);
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [signalDlg, setSignalDlg] = useState<SignalSpot | null>(null);
  // The closeout payoff beat opens the wallet, so the map hosts the sheet.
  const [walletOpen, setWalletOpen] = useState(false);
  const [waveToast, setWaveToast] = useState({ message: '', key: 0 });
  const reduceMotion = useReducedMotion();
  // Task 985 port: light scroll parallax on the scenery layer. ONE
  // scroll-linked transform on the scenery wrapper, so it drifts slightly
  // slower than the rail and reads as sitting behind it. Entirely absent
  // under reduced motion (transform pinned to 0).
  const scrollY = useSharedValue(0);
  const onMapScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // Task 1082 item 4: bring the learner's current stop into view when the map
  // opens. The latch fires once per visit (this screen mounts once), never
  // again on refetch or state change, and a learner who starts dragging first
  // owns the scroll view outright.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const autoScrolledRef = useRef(false);
  const userScrolledRef = useRef(false);
  const sceneryParallaxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : scrollY.value * DEPTH_2_5D.parallaxFactor },
    ],
  }));
  // Web measures the map column with a ResizeObserver; on native the window
  // width is authoritative (map column = screen width capped at 390, with the
  // same 0 side padding the web column has inside its centering wrapper).
  const mapW = Math.min(MAP_MAX_W, windowW);
  // The carved board's panel height, in points. The board is exactly PC_H and
  // the pediment takes its own aspect out of that, so the remainder is known
  // without measuring anything. postcardWrap insets the board by 16 a side.
  const boardW = mapW - 32;
  // EXPLICIT POINTS, NOT width:'100%' + aspectRatio. On device (both build 515
  // and the dev client) the pediment Image resolved the percentage against an
  // auto-width wrapper as its INTRINSIC 760x142, overflowing the board
  // sideways and leaving the panel 42pt of the 117 it was owed, which is the
  // whole blank-board saga of builds 511-515 in one line. RNTL's renderer
  // resolves the percentage happily, which is why every suite stayed green.
  // The width is known exactly here, so nothing needs to be inferred.
  const boardPedimentH = (boardW * ZONE_BOARD.topH) / ZONE_BOARD.artW;
  const boardPanelH = PC_H - boardPedimentH;
  // EVEN-SIZED STOP CARDS (chat 11): "I want it to look like this. Even sized
  // cards." Every stop card is the same width, anchored beside its marker with
  // the same 36pt eyelet gap, instead of stretching to whatever the flank left
  // over (which made right-flank cards a different width from left-flank ones
  // and the current card a different size again). The value is the widest that
  // fits BOTH flanks inside the 16pt map margins at this mapW.
  const cardW = mapW - 140;

  // One language's map never fetches another language's data: exactly six
  // fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  // Which zones already have a capstone conversation stamped, and which zones
  // have a capstone to offer at all in this language. Both feed the closeout's
  // beat 2: a capstone is only offered where one exists and has not been done.
  // The scene list comes from the server rather than a hand-written table,
  // which web used to carry and mobile would otherwise have had to copy.
  const zoneStampsQuery = useListZoneStamps({ lang: activeLang });
  const scenariosQuery = useListScenarios({ lang: activeLang });
  const stampedZoneIndices = React.useMemo(
    () => new Set((zoneStampsQuery.data ?? []).map((z) => z.zoneIndex)),
    [zoneStampsQuery.data],
  );
  const scenarioIdByZone = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const sc of scenariosQuery.data ?? []) m.set(sc.zoneIndex, sc.id);
    return m;
  }, [scenariosQuery.data]);

  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  const languageName = activeLanguage?.name ?? 'this language';

  // Signal memory hydrates off AsyncStorage; render only ever reads the
  // synchronous snapshot it exposes (see lib/signalMemory.ts).
  const signalMemory = useSignalMemory(activeLang);
  const chachaMemory = useChachaMemory(activeLang);
  const recordChachaEncounter = useRecordChachaEncounter();
  const [chachaDlg, setChachaDlg] = useState<ChachaEncounterResult | null>(null);
  // Zone closeout stages hydrate the same way, and for the same reason.
  const closeoutMemory = useCloseoutMemory(activeLang);
  const recordSignalWave = useRecordSignalWave();

  // Chai stop unlock (web parity). The offer, its price and its cap all come
  // from the server payload; this only spends and then re-reads. A success
  // refetches the zones (the bought stop returns status "unlocked") and the
  // wallet. Ownership is a ledger row, so it survives a reinstall.
  const tokensQuery = useGetTokens();
  // First Class gold: derive at the source of the tokens query and pass down to
  // every train render site rather than running a second query. The three sites
  // (marker pill, boarding pass, signal encounter) are all reachable from here.
  const goldPalette = (() => {
    const until = tokensQuery.data?.firstClassActiveUntil;
    if (!until) return undefined;
    if (new Date(until) <= new Date()) return undefined;
    return { chassis: '#6B4A0F', body: '#E8B93C', trim: '#FFE39A', steam: '#FFF6E0' } as const;
  })();
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const unlockStop = useUnlockStop({
    mutation: {
      onSuccess: () => {
        setUnlockError(null);
        setLock(null);
        void tokensQuery.refetch();
        zoneQueries.forEach((q) => void q.refetch());
      },
      onError: (e) => setUnlockError(unlockErrorCopy(e)),
    },
  });

  /** Wave through: mark locally, persist, re-derive, close, never shame. */
  const waveSignal = (sig: SignalEncounter) => {
    hapticLight();
    signalMemory.markWaved(sig.gap);
    // The local mark is the optimistic cache; this is the durable one.
    // Idempotent server-side, so a replayed wave is a no-op.
    recordSignalWave.mutate({
      data: { languageCode: activeLang, categoryId: sig.zoneId, gap: sig.gap },
    });
    setSignalDlg(null);
    setWaveToast((t) => ({
      key: t.key + 1,
      message:
        sig.game === null
          ? 'Green flag, straight through!'
          : 'Waved through. The signalman kept your Chai warm, come back anytime.',
    }));
  };

  /** Launch the offered game with the signal context the server needs to
   *  decide the Chai grant. The shell parses and validates these params. */
  const playSignalGame = (sig: SignalEncounter & { game: NonNullable<SignalEncounter['game']> }) => {
    hapticLight();
    setSignalDlg(null);
    router.push({
      pathname: `/(app)/(tabs)/games/${sig.game.id}` as never,
      params: { cat: String(sig.zoneId), ctx: 'signal', gap: String(sig.gap) },
    });
  };

  // Plain-locked language (no teaser set): the API keeps its pre-M1 402 and
  // the map defers to the standard upgrade screen.
  const upgrade = zoneQueries
    .map((q) => asUpgradeRequired(q.error))
    .find((u) => u !== null);

  // Task #906: zone display titles come from the categories listing the map
  // already fetches, so a server-side rename shows up here without an app
  // release. The JOURNEY_ZONES table keeps the id joins authoritative and its
  // hardcoded titles serve only as the loading-state fallback (the old
  // title-mismatch hard stop is gone; ids alone define the mapping).
  const categories = categoriesQuery.data;

  // M1 access envelope: present only in showroom (teaser/exhausted) mode.
  const access =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.access).find(Boolean) ??
    null;
  const teaserProgress =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.teaser).find(Boolean) ??
    null;
  const showroom = access !== null;
  // Served price of a Chai stop unlock. Present only for the first zone (the
  // only zone whose stops the server will sell), never hardcoded here.
  const stopUnlockCost =
    zoneQueries
      .map((q) => (q.data as LessonGroupList | undefined)?.stopUnlock?.cost)
      .find((c) => typeof c === 'number') ?? null;

  const zones = JOURNEY_ZONES.map((z, i) => {
    const groups = [...((zoneQueries[i]!.data as LessonGroupList | undefined)?.lessonGroups ?? [])]
      // Phrase-stage stops before sentence-stage, then position order.
      .sort((a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0));
    const stations: Station[] = groups.map((g, gi) => ({
      ...g,
      zoneId: z.id,
      zoneIndex: i,
      stopNumber: gi + 1,
      stopCount: groups.length,
    }));

    // TWO LISTS, and the split is the whole design, identical to the web map.
    //
    // `stations` stays exactly what it always was: the graded lesson groups.
    // Every derivation counts off it, and must keep doing so — the rail
    // progress, Chacha-ji's stalls, the trackside signals, zone folding, the
    // current stop, and the global counter that places them all.
    //
    // `rowStations` is what the map DRAWS: the same stations with the tracing
    // stop spliced into the middle and the whole run renumbered, so a learner
    // reads "Stop 2 of 10" and the tracing stop is a stop like any other.
    //
    // Added, never substituted: no phrase stop is displaced, so a zone of nine
    // stops becomes ten. traceStopIndexIn() decides WHERE, and both clients
    // call it rather than each choosing, or the web and the phone would
    // disagree about which stop a learner is on.
    const trace = traceStopFor(activeLang, 1, i + 1);
    const withTrace = [...stations];
    // IS THIS WHOLE ZONE INCLUDED FOR THIS LEARNER? Derived from the phrase
    // stations the server already sent, never from a hardcoded language list.
    // Hindi's fare zones 1 and 2 serve free in full (owner ruling 2026-08-24),
    // and on 2026-08-25 the map was still stamping FREE TASTE on them, which
    // reads as a sample of something the learner already owns outright. A zone
    // whose every phrase stop is plan-visible is INCLUDED, so its tracing and
    // story rows are neither locked nor a taste. Deriving it means a future
    // widening of the free tier needs no change here, and it cannot drift from
    // what the server actually serves.
    const zoneIncluded =
      stations.length > 0 && stations.every((st) => st.planLocked !== true);
    // THE ZONE GATE, DECIDED ONCE AT THE ZONE BOUNDARY. With the cross-zone
    // gate on, the server reports EVERY group in an unreachable zone as
    // 'locked', so a zone where no phrase station is open is a zone the
    // learner may not enter yet. Rows this client invents (the tracing stop,
    // the story stop, and whatever comes next) are not in that payload and
    // would otherwise each have to remember to lock themselves, which is
    // exactly how a stop ends up standing open at the top of a zone.
    //
    // Asked for on 2026-08-25: "add a hard gate (invisible) right after the
    // zone card, so we never have to count stops". This is that gate. A new
    // row type inherits it by being inside the zone rather than by joining a
    // list. With the flag off the first station of every zone is unlocked, so
    // this is false everywhere and nothing changes.
    const zoneGateLocked =
      stations.length > 0 && stations.every((st) => st.status === 'locked');
    // NOT IN SHOWROOM. A locked-language preview already carries its own free
    // taste, the three-phrase voice teaser, and a tracing stop offering a
    // second "FREE TASTE" chip beside it reads as two competing offers on a
    // language the learner cannot open yet.
    //
    // ADDED, NEVER SUBSTITUTED, and you can only add to something: a zone with
    // no phrase stops at all gets no tracing stop either, or an unloaded zone
    // draws a lone tracing row under an empty postcard.
    // WHERE THE TRACING ROW LANDED, kept so the story stop can sit directly
    // after it. null when this zone has no tracing stop, which storyStopIndexIn
    // handles by taking the mid-zone break the tracing stop would have had.
    let traceIdx: number | null = null;
    if (trace && stations.length > 0 && !showroom) {
      traceIdx = traceStopIndexIn(stations.length, trace.journey, trace.zone);
      withTrace.splice(traceIdx, 0, {
        title: trace.title,
        stage: 'phrase',
        status: zoneGateLocked
          ? 'locked'
          : traceStopStatus(trace, passedCharacterIds),
        zoneId: z.id,
        zoneIndex: i,
        stopNumber: 0,
        stopCount: 0,
        trace,
        traceCopy: traceStopCopy(trace, traceStopPassedCount(trace, passedCharacterIds)),
        traceDone: traceStopPassedCount(trace, passedCharacterIds),
        traceTotal: trace.characters.length,
        // THE FREE TASTE, and where it stops. Journey 1 zone 1 is open to
        // everyone (its first three characters, which the game enforces);
        // every later zone is All-Access. A tracing stop is still never
        // PROGRESSION-locked, which is a different thing.
        planLocked:
          !isPlus && !zoneIncluded && !(trace.journey === 1 && trace.zone === 1),
        teaserStation:
          !isPlus && !zoneIncluded && trace.journey === 1 && trace.zone === 1,
      } as Station);
    }
    // THE STORY STOP, spliced after the tracing one and by the same rules.
    // storyStopIndexIn() decides where, and both clients call it rather than
    // each choosing, or the web and the phone would disagree about which stop a
    // learner is on. Added, never substituted, and never in showroom: a locked
    // language preview already carries its own free taste.
    const storyBook = storyBookFor(1, i + 1);
    if (storyBook && stations.length > 0 && !showroom) {
      withTrace.splice(storyStopIndexIn(withTrace.length, 1, i + 1, traceIdx), 0, {
        title: storyBook.title,
        stage: 'phrase',
        // A story stop is never PROGRESSION-locked: it teaches nothing the
        // phrase stops gate. "unlocked" is the honest value, and the row render
        // branches on `story` before it ever reads this.
        status: zoneGateLocked ? 'locked' : 'unlocked',
        zoneId: z.id,
        zoneIndex: i,
        stopNumber: 0,
        stopCount: 0,
        story: storyBook,
        // The taste is the WHOLE of zone 1's book; every later zone is
        // All-Access. Same shape as the tracing teaser above it.
        planLocked: !isPlus && !zoneIncluded && !isStoryTeaserBook(storyBook),
        teaserStation:
          !isPlus && !zoneIncluded && isStoryTeaserBook(storyBook),
      } as Station);
    }

    const rowStations: Station[] = withTrace.map((st, gi) => ({
      ...st,
      stopNumber: gi + 1,
      stopCount: withTrace.length,
    }));

    return {
      ...z,
      title: categories?.find((c) => c.id === z.id)?.title ?? z.title,
      geoName: line.zones[i]!,
      stations,
      rowStations,
      // Every stop in the fare zone finished. An empty zone is never "done":
      // a zone whose groups have not loaded must not fire a celebration.
      zoneAllDone:
        stations.length > 0 &&
        stations.every((s) => s.status === 'completed' || s.status === 'tested_out'),
    };
  });

  const allStations = zones.flatMap((z) => z.stations);
  const doneCount = allStations.filter(
    (s) => s.status === 'completed' || s.status === 'tested_out',
  ).length;
  const totalCount = allStations.length;
  const currentId = allStations.find(
    (s) => s.status === 'unlocked' || s.status === 'in_progress',
  )?.id;
  const currentStation = allStations.find((s) => s.id === currentId) ?? null;

  // WHICH ZONE'S CROSSING THE LEARNER IS STANDING ON, or null. Zone-relative,
  // not journey-wide: each of the six zones has its own film, and a
  // journey-wide index would put the only Emergency inside zone 1 and leave the
  // other five unreachable.
  const emergencyZone = (() => {
    if (currentId == null) return null;
    for (let zi = 0; zi < zones.length; zi++) {
      const idx = zones[zi]!.stations.findIndex((st) => st.id === currentId);
      if (idx === EMERGENCY_AFTER_STOP) return zi + 1;
    }
    return null;
  })();
  const currentZone = currentStation ? zones[currentStation.zoneIndex]! : null;

  // THE ARRIVAL FILM, symmetric with the departure one. Asked for 2026-08-26:
  // the same zone splash that plays on the way INTO a stop also plays when the
  // journey itself loads, so the map fades up out of the scene rather than
  // snapping in. It reuses the six films already bundled for the departure, so
  // it costs nothing extra.
  //
  // FIRED WHEN currentZone FIRST RESOLVES, not on bare mount, because the zone
  // is not known until the queries land and the wrong zone's painting is worse
  // than none. On a return visit those queries are cached and this is the same
  // tick as mount; on a cold load the screen is in its loading state anyway, so
  // neither case shows the map and then covers it.
  //
  // Once per mount. Popping back from a stop refocuses this screen rather than
  // recreating it, so returning from a lesson does not replay the film.
  const arrivalPlayed = useRef(false);
  useEffect(() => {
    if (arrivalPlayed.current || !currentZone) return;
    arrivalPlayed.current = true;
    playStopSplash(currentZone.id);
  }, [currentZone]);

  const openPaywallForLanguage = () => {
    setLock(null);
    router.push({
      pathname: '/(app)/paywall',
      params: {
        lang: activeLang,
        reason: access === 'exhausted' ? 'teaser_exhausted' : 'language_locked',
      },
    });
  };

  // --- Serpentine geometry (identical math to the web map): stations
  // alternate left/right down the map column; the track curves between them.
  const rightX = mapW - 94; // mirror of LEFT_X within the column
  const stationX = (k: number) => (k % 2 === 0 ? LEFT_X : rightX);
  type Pt = {
    x: number;
    y: number;
    /**
     * 'trace' is drawn like a station but COUNTS as nothing: it advances the
     * layout without advancing `k`, as the retired 'halt' row used to. That is
     * what keeps the serpentine phase, Chacha-ji's stalls, the trackside
     * signals and every stop number identical to what they were before a
     * tracing row existed.
     */
    kind: 'station' | 'postcard' | 'terminus' | 'trace' | 'story';
    lit: boolean;
    station?: Station;
    /** The GRADED index this row sits at, which is what picks the flank. Render
     *  order cannot be used: a tracing row would flip every card below it. */
    globalIdx?: number;
    zoneIndex?: number;
  };
  const pts: Pt[] = [];
  const postcardYs: { y: number; zoneIndex: number }[] = [];
  let layoutY = TOP_PAD;
  let k = 0; // global station index (drives the serpentine phase)
  for (let zi = 0; zi < zones.length; zi++) {
    const zone = zones[zi]!;
    const zoneLit = zone.stations.some(
      (s) => isStatusAccessible(s.status) || s.teaserStation,
    );
    postcardYs.push({ y: layoutY, zoneIndex: zi });
    // Path point mid-postcard, x interpolated between neighbor stations.
    const xPrev = k === 0 ? stationX(0) : stationX(k - 1);
    const xNext = stationX(k);
    pts.push({
      x: (xPrev + xNext) / 2,
      y: layoutY + PC_H / 2,
      kind: 'postcard',
      // WAS `!showroom || zoneLit`, which is `true` for every ordinary learner
      // and lit the run from a zone's last stop into the NEXT zone's card on
      // every zone at once: "the last stop to the zone card is green on all".
      // The showroom half was doing real work and the other half was cancelling
      // it. A zone card is travelled when the zone has been reached, in both
      // modes, which is what zoneLit already says.
      lit: zoneLit,
      zoneIndex: zi,
    });
    // A breath between the board and the first card (chat 11): "add a little
    // more space between the zone and first card". The gap belongs to the
    // zone row, so every derived y (stations, scenery, signals, the intro
    // scroll target) moves with it by construction.
    layoutY += PC_H + ZONE_BOARD_GAP;
    for (const s of zone.rowStations) {
      // The tracing row: drawn like a stop, counted like nothing. It takes the
      // flank the NEXT graded stop will take, so the rail runs straight down
      // into that stop and the serpentine gains no extra zigzag. `k` does not
      // move, which is the whole reason everything downstream is unaffected.
      // BOTH non-phrase rows take this branch. `k` does not move for either,
      // which is the whole reason everything downstream is unaffected. A new
      // row of any kind added later MUST join this condition.
      if (s.trace || s.story) {
        pts.push({
          x: stationX(k),
          y: layoutY + STATION_H / 2,
          kind: s.story ? 'story' : 'trace',
          // WAS HARDCODED true, AND THAT LIT THE RAIL THROUGH LOCKED ZONES.
          // Reported 2026-08-26 off a TestFlight build: "i haven't gotten to
          // those stops 4, 5 and 6 on zone 2, why is the line green?" The
          // answer was that a tracing row is never PROGRESSION-locked, so
          // somebody wrote true and it was right for that one reason and wrong
          // for every other: a trace or story row in an All-Access zone a Free
          // learner has not bought is locked, wears a padlock on its own card,
          // and was still lighting the track either side of itself.
          //
          // The same rule the CARD uses, so the rail and the padlock beside it
          // can never disagree again. Web derives both branches from one `lit`
          // and never had this.
          lit: s.planLocked !== true && isStatusAccessible(s.status),
          station: s,
          globalIdx: k,
        });
        layoutY += STATION_H;
        continue;
      }
      // Free-tier content policy: a plan-gated sentence stop arrives
      // status "locked" (planLocked) from the server, so unlocked means lit.
      const lit =
        s.status === 'completed' ||
        s.status === 'tested_out' ||
        s.status === 'in_progress' ||
        s.status === 'unlocked';
      pts.push({
        x: stationX(k),
        y: layoutY + STATION_H / 2,
        kind: 'station',
        lit,
        station: s,
        globalIdx: k,
      });
      layoutY += STATION_H;
      k++;
      // CHACHA-JI'S HALT ROW WAS RETIRED HERE ON 2026-08-26. It used to insert
      // a 96-high scenery-only row after every encounter station, purely to
      // give his stall a lane clear of the station card. That is six rows over
      // a journey, about 576 of map length carrying no stop, no number and
      // nothing tappable, and at 96 it was spending MORE height on a decoration
      // than STATION_H spends on a stop.
      //
      // The stall did not go with it. It moved to the LEFT of the marker, which
      // is empty on an encounter station because those are always left-flank
      // and their card sits to the right. See STALL_PLACEMENT.laneDxLeft.
      //
      // The mechanic never depended on any of this: ChachaSoftStop fires off
      // chachaStationIdx, which comes from the current station index, and the
      // free chai is granted by recordChachaEncounter on that trigger. Nothing
      // taps the stall. Checked before the row was touched.
    }
  }
  // Closeout suppression, direction one (web parity): the signal soft stop
  // holds while a celebration is owed, so the two never race for the screen.
  // Unseeded counts as owed — the seeding pass has not run yet.
  const closeoutPending =
    !showroom && closeoutOwed(closeoutMemory, zones.map((z) => z.zoneAllDone));

  const allDone = doneCount === totalCount && totalCount > 0;
  const termX = k > 0 ? stationX(k - 1) : LEFT_X;
  const termY = layoutY + TERM_H / 2;
  pts.push({ x: termX, y: termY, kind: 'terminus', lit: allDone });
  const totalH = layoutY + TERM_H + 8;

  const segs = pts.slice(1).map((p, i) => {
    const a = pts[i]!;
    const dy = (p.y - a.y) / 2;
    return {
      d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${p.x} ${p.y - dy}, ${p.x} ${p.y}`,
      lit: p.lit,
      y0: a.y,
      y1: p.y,
    };
  });

  // Per-zone Svg slices (approved perf treatment): each zone owns the strip
  // from its postcard top to the next postcard top; the last zone's slice
  // runs to the bottom and carries the bunting + terminus row.
  const slices = postcardYs.map(({ y }, i) => {
    const start = y;
    const end = i + 1 < postcardYs.length ? postcardYs[i + 1]!.y : totalH;
    return { start, end };
  });

  // COUNTS. Every derivation below keys off this and must keep doing so.
  const stationPts = pts.filter((p) => p.kind === 'station');
  // DRAWS. The same stops plus the tracing rows, in layout order.
  // THE ROWS THAT DRAW. Every non-phrase row must be listed here as well as
  // taking the no-k branch above, and missing this is a silent failure rather
  // than a loud one: the row is still COUNTED, so "Stop 2 of 4" appears and the
  // stop itself does not, which reads as a numbering bug rather than a missing
  // feature. Found exactly that way on 2026-08-24 when the story stop landed.
  //
  // stationPts below stays station-only on purpose: that is what COUNTS, and
  // adding a non-phrase row to it is the mistake that moves Chacha-ji's stalls.
  const rowPts = pts.filter(
    (p) => p.kind === 'station' || p.kind === 'trace' || p.kind === 'story',
  );

  // Trackside scenery plan (Task 985 port): deterministic per-zone placement
  // in the free strip beside a station row, same side as the marker
  // (opposite its card), on the same edge inset and ground line the web map
  // uses. Locked showroom zones gray out with their postcards.
  //
  // Chacha-ji's stall rides in the same layer as a permanent LANDMARK at every
  // encounter station, ahead of the learner and behind, so the stop that pays
  // is visible before it is reached (web parity, identical lane and ground
  // line). Pure client geometry off the same predicate the arrival check uses:
  // no server call, no state, no encounter row. Rendering is NOT triggering.

  const chachaStalls = planChachaStalls(stationPts.length).flatMap((station) => {
    const p = stationPts[station - 1];
    if (!p) return [];
    const zone = zones[p.station!.zoneIndex]!;
    const zoneAccessible = zone.stations.some(
      (st) => isStatusAccessible(st.status) || st.teaserStation,
    );
    return [
      {
        key: `chacha-stall-${station}`,
        testID: `chacha-stall-${station}`,
        kind: 'chaiStall' as const,
        station,
        zoneIndex: p.station!.zoneIndex,
        // LEFT of the marker, in the encounter station's OWN row. Encounter
        // stations are always left-flank so their card is on the right, which
        // is what makes this side free and what let the halt row go.
        x: p.x - STALL_PLACEMENT.laneDxLeft,
        y: p.y + STALL_PLACEMENT.groundDy,
        gray: showroom && !zoneAccessible,
      },
    ];
  });
  // Zone-local rows carrying a stall, so the decorative plan leaves that strip
  // alone: decoration there would double as a second, meaningless stall right
  // beside the landmark.
  const stallRowsByZone = new Map<number, Set<number>>();
  for (const stall of chachaStalls) {
    const zonePts = stationPts.filter((p) => p.station!.zoneIndex === stall.zoneIndex);
    const row = zonePts.findIndex(
      (p) => p.station!.id === stationPts[stall.station - 1]!.station!.id,
    );
    if (row < 0) continue;
    const rows = stallRowsByZone.get(stall.zoneIndex) ?? new Set<number>();
    rows.add(row);
    stallRowsByZone.set(stall.zoneIndex, rows);
  }
  const sceneryPlacements = [
    ...zones.flatMap((zone, zi) => {
      const zonePts = stationPts.filter((p) => p.station!.zoneIndex === zi);
      const zoneAccessible = zone.stations.some(
        (st) => isStatusAccessible(st.status) || st.teaserStation,
      );
      const stallRows = stallRowsByZone.get(zi);
      return planZoneScenery(zi, zonePts.length)
        .filter(({ row }) => !stallRows?.has(row))
        .map(({ kind, row }, i) => {
          const p = zonePts[row]!;
          return {
            key: `${zi}-${i}`,
            testID: undefined as string | undefined,
            kind,
            x: p.x < mapW / 2 ? SCENERY_PLACEMENT.edgeX : mapW - SCENERY_PLACEMENT.edgeX,
            y: p.y + SCENERY_PLACEMENT.groundDy,
            gray: showroom && !zoneAccessible,
          };
        });
    }),
    ...chachaStalls.map(({ key, testID, kind, x, y, gray }) => ({
      key,
      testID,
      kind,
      x,
      y,
      gray,
    })),
  ];

  // ── Trackside signals (Build 35 mobile parity) ─────────────────────────
  // TRAP 1: signals are NOT pushed into `pts`. `segs` draws the rail between
  // consecutive pts, so a signal point would route the actual track through
  // the crossing. Their positions are derived HERE, as a separate array of
  // gap positions taken off the station points, that nothing else consumes.
  // TRAP 5: a showroom (plan-locked) map gets no interactive signals at all,
  // matching web, or a locked line would advertise Chai the server refuses.
  void signalMemory.version; // re-derive after any local mark
  const currentGlobalIdx =
    currentId != null ? allStations.findIndex((s) => s.id === currentId) : -1;
  // Task 1082 item 1: the boarding pass used to read "{doneCount}/{totalCount}
  // stations", so the number in the current-station slot was actually the
  // COUNT OF FINISHED STOPS — it said 2 while the map highlighted stop 1. Both
  // numbers now come off `allStations`, the one flattened list the map, the
  // server payload and the Chacha encounter logic already share: the total is
  // its length and the stop number is the very index the encounter check uses,
  // so the header can never disagree with the stop the map lights up.
  const headerStations =
    currentGlobalIdx >= 0
      ? `Stop ${currentGlobalIdx + 1} of ${totalCount} stations`
      : allDone
        ? `All ${totalCount} stations complete`
        : `${totalCount} stations`;
  // Item 4: y of the current stop inside the map column, off the same
  // serpentine points the markers are drawn from. The map's own offset inside
  // the scroll content is only known once it has been laid out, which is also
  // the earliest moment the scroll view can be told to move — so the jump
  // rides that layout pass rather than an effect that would fire too early.
  const currentStopY =
    currentGlobalIdx >= 0 ? stationPts[currentGlobalIdx]?.y ?? null : null;
  /**
   * THE OPENING SHOT: the map opens at the top, holds on the fare-zone card,
   * then travels down to the learner's current stop.
   *
   * WHY IT IS HAND-ROLLED AND NOT `scrollTo({ animated: true })`. React Native's
   * animated scroll has no duration control at all, and what it does have grows
   * with distance, which is the opposite of what was asked for: a learner six
   * zones down should travel the same shot FASTER, not for six times as long.
   * The tween below takes its duration from introScrollDurationMs, which caps
   * at 900ms, and drives the scroll view a frame at a time.
   *
   * Web twin: AutoScrollToCurrentStop in gujarati-coach/src/pages/journey.tsx.
   * Same hold, same cap, same ease, same skip.
   */
  const introHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTarget = useRef<number | null>(null);

  /** Stop the shot wherever it is and put the learner on their card. */
  const landIntro = useCallback(() => {
    if (introHold.current != null) {
      clearTimeout(introHold.current);
      introHold.current = null;
    }
    const y = introTarget.current;
    if (y == null) return;
    introTarget.current = null;
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [scrollRef]);

  // Leaving the screen mid-shot must not leave a frame loop or a timer behind
  // pointing at an unmounted scroll view.
  useEffect(
    () => () => {
      if (introHold.current != null) clearTimeout(introHold.current);
    },
    [],
  );

  const onMapLayout = (e: LayoutChangeEvent) => {
    if (autoScrolledRef.current || userScrolledRef.current) return;
    if (currentStopY == null) return;
    autoScrolledRef.current = true;
    // Comfortable framing: the stop lands about a third of the way down the
    // viewport, clear of the boarding-pass header and never at the bottom edge.
    // layout.y is the FIRST BOARD child now, which sits TOP_PAD into the old
    // canvas space currentStopY still measures in, so the pad comes back off.
    const to = Math.max(
      0,
      e.nativeEvent.layout.y - TOP_PAD + currentStopY - introScrollLead(windowH),
    );
    introTarget.current = to;
    // Reduced motion gets no hold and no travel, only the destination.
    if (reduceMotion || to <= 0) return void landIntro();

    introHold.current = setTimeout(() => {
      introHold.current = null;
      introTarget.current = null;
      // THE PLATFORM'S OWN ANIMATED SCROLL, not a hand-rolled tween.
      //
      // The tween drove scrollTo({ animated: false }) once per
      // requestAnimationFrame. It passed every test, because the test renderer
      // hands out the frames itself, and it did not move the map on a device.
      // Reported twice off TestFlight: "the AutoZone didn't work".
      //
      // The duration control it bought is worth less than working: a shot that
      // never fires has no pace to tune. `animated: true` is what this screen
      // used before the hold existed and is known to move a real ScrollView.
      // The HOLD is the half the owner actually asked for and it is kept.
      scrollRef.current?.scrollTo({ y: to, animated: true });
    }, INTRO_SCROLL.holdMs);
  };

  // Chacha-ji counts stations 1-based off the same flattened list. The
  // showroom has no live progress, so he never turns up there.
  const chachaStationIdx =
    !showroom && currentGlobalIdx >= 0 && isChachaEncounterStation(currentGlobalIdx + 1)
      ? currentGlobalIdx + 1
      : null;

  // Leaving the stall carries on into that stop's first item, which is where
  // tapping the stop card would have landed anyway. Decline does the same: he
  // never asks twice.
  const leaveChachaStall = () => {
    const stop = chachaDlg ? allStations[chachaDlg.station - 1] : undefined;
    setChachaDlg(null);
    if (!stop) return;
    // No splash leaving the stall either, same reason as the stop cards: the
    // learner has already watched the arrival film on this visit.
    router.push({
      pathname: '/(app)/practice/[id]',
      params: { id: String(stop.zoneId), group: String(stop.id) },
    });
  };

  const openChachaEncounter = (stationIdx: number) => {
    recordChachaEncounter.mutate(
      { data: { languageCode: activeLang, station: stationIdx } },
      {
        onSuccess: (res) => {
          // Spent only once he has actually answered; see ChachaSoftStop.
          chachaMemory.markSeen(stationIdx);
          setChachaDlg(res);
          if (res.granted) {
            void tokensQuery.refetch();
          }
        }
      }
    );
  };

  const visibleCountForZone = (zoneId: number) =>
    categories?.find((c) => c.id === zoneId)?.phraseCount ?? 0;
  const signals: SignalSpot[] = showroom
    ? []
    : planTracksideSignals(totalCount).flatMap(({ afterStop, signalIndex }) => {
        const a = stationPts[afterStop - 1];
        if (!a) return [];
        const station = a.station!;
        const zone = zones[station.zoneIndex]!;
        // TRAP 4: web seats the crossing opposite the stop's label card, but
        // mobile lays that card out itself, so the card slot is recomputed
        // here with the station row's own formula and the overlap is really
        // CHECKED rather than assumed. If the preferred flank collides, the
        // signal is pushed clear of the card box instead of sitting on it.
        const cardSide: 'left' | 'right' = (afterStop - 1) % 2 === 0 ? 'right' : 'left';
        // Even cards (chat 11): the card slot this collision check recomputes
        // moved to a fixed width, so the check moves with it or it is checking
        // a box that no longer exists.
        const boxLeft = cardSide === 'right' ? a.x + 30 : a.x - 30 - (mapW - 140);
        const boxWidth = mapW - 140;
        // CHACHA-JI OWNS THE LEFT FLANK AT AN ENCOUNTER STATION and the signal
        // was taking it too, so the crossing drew straight over his stall:
        // "chacha hidden behind signal". Encounter stations are always
        // left-flank, so their card is on the right and the rule above sends
        // the signal left, which is exactly where the stall stands. Where they
        // would share a side, the signal yields: he is a character with a name
        // on the map and it is a piece of track furniture. Web twin carries the
        // same rule.
        const signalLeft = isChachaEncounterStation(afterStop)
          ? false
          : cardSide === 'right';
        let x = signalLeft ? a.x - SIGNAL_GAP_DX : a.x + SIGNAL_GAP_DX;
        if (x + SIGNAL_HALF_W > boxLeft && x - SIGNAL_HALF_W < boxLeft + boxWidth) {
          x =
            cardSide === 'right'
              ? boxLeft - SIGNAL_HALF_W - 4
              : boxLeft + boxWidth + SIGNAL_HALF_W + 4;
        }
        x = Math.min(mapW - SIGNAL_HALF_W, Math.max(SIGNAL_HALF_W, x));
        const stopDone =
          station.status === 'completed' || station.status === 'tested_out';
        // Server truth first (ledger-backed clears and persisted waves off
        // the zone payload), local memory second as the optimistic cache.
        // CLEARED IS CHECKED BEFORE WAVED on both sides, so a later clear
        // always supersedes an earlier wave.
        const zoneSignals = zoneQueries[station.zoneIndex]?.data?.signals;
        const gapRef = signalContextRef(afterStop);
        const state: SignalState =
          zoneSignals?.clears.includes(gapRef) || signalMemory.isCleared(afterStop)
            ? 'cleared'
            : zoneSignals?.waves.includes(gapRef) || signalMemory.isWaved(afterStop)
              ? 'waved'
              : stopDone
                ? 'active'
                : 'upcoming';
        return [
          {
            gap: afterStop,
            signalIndex,
            x,
            y: a.y + 30,
            zoneId: zone.id,
            state,
            // Served by the zone payload, never a constant.
            rewardChai: zoneSignals?.rewardChai ?? 1,
            game: gameForSignal(signalIndex, visibleCountForZone(zone.id)),
            held: state === 'active' && afterStop === currentGlobalIdx,
          },
        ];
      });
  /** The crossing the train is stopped at, if any. */
  const heldSignal = signals.find((s) => s.held) ?? null;

  // Rail comet (#917/#973 web port): dots sampled on the segment(s) leaving
  // the current station toward the next stop (any postcard midpoint between
  // them included), lit in order so the bright head travels from the train
  // toward wherever Bolo goes next. A locked next stop still gets the comet,
  // the energy points at it either way. The terminus is never a target on
  // its own (a current station always exists when the comet runs). No
  // current station (fresh line, showroom, all done) or reduced motion means
  // no dots at all.
  const pulseDots: { x: number; y: number }[] = [];
  if (currentId && !reduceMotion) {
    const curPtIdx = pts.findIndex(
      (p) => p.kind === 'station' && p.station?.id === currentId,
    );
    if (curPtIdx >= 0) {
      let nextStopIdx = -1;
      for (let i = curPtIdx + 1; i < pts.length; i++) {
        if (pts[i]!.kind !== 'postcard') {
          nextStopIdx = i;
          break;
        }
      }
      if (nextStopIdx > curPtIdx) {
        // Sample the same cubic beziers segs[] draws: control points sit at
        // half the vertical gap, x pinned to each endpoint.
        for (let i = curPtIdx; i < nextStopIdx; i++) {
          const a = pts[i]!;
          const b = pts[i + 1]!;
          const dy = (b.y - a.y) / 2;
          for (let s = 0; s < RAIL_PULSE.dotsPerSegment; s++) {
            const t = (s + 0.5) / RAIL_PULSE.dotsPerSegment;
            const mt = 1 - t;
            pulseDots.push({
              x:
                mt * mt * mt * a.x +
                3 * mt * mt * t * a.x +
                3 * mt * t * t * b.x +
                t * t * t * b.x,
              y:
                mt * mt * mt * a.y +
                3 * mt * mt * t * (a.y + dy) +
                3 * mt * t * t * (b.y - dy) +
                t * t * t * b.y,
            });
          }
        }
      }
    }
  }

  // THE THREE EARLY EXITS LIVE DOWN HERE, BELOW EVERY HOOK, AND THAT IS THE
  // WHOLE POINT. They sat right after the queries with FOUR hooks below them:
  // arrivalPlayed, its effect, landIntro and the opening shot's cleanup. React
  // therefore ran fewer hooks on the loading and error branches than on the
  // loaded one, so every "Laying the tracks" to map transition changed the
  // hook count and threw.
  //
  // WEB HAD THE IDENTICAL BUG and was fixed first, from a runtime overlay the
  // owner screenshotted. Nothing surfaced it here because a React Native
  // screen has no such overlay: it would have shipped in the next build.
  //
  // Moving the RETURNS is safe where hoisting the hooks was not: everything
  // between reads its data through `?.data?.x ?? []`, so it computes over
  // empty arrays while the queries are in flight and the result is discarded
  // by the exit below. The arrival effect could not move up at all, because it
  // depends on currentZone, which needs the loaded data.
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title={
          upgrade.reason === 'teaser_exhausted'
            ? "You've tried this language!"
            : 'Unlock this language'
        }
        message={upgrade.message}
        onUpgrade={() =>
          router.push({
            pathname: '/(app)/paywall',
            params: {
              lang: activeLang,
              ...(upgrade.reason ? { reason: upgrade.reason } : {}),
            },
          })
        }
        onBack={() => router.back()}
      />
    );
  }
  if (zoneQueries.some((q) => q.isError)) {
    return (
      <Screen>
        <LessonError
          onRetry={() => {
            zoneQueries.forEach((q) => void q.refetch());
          }}
          isRetrying={zoneQueries.some((q) => q.isFetching)}
          onBack={() => router.back()}
        />
      </Screen>
    );
  }
  if (zoneQueries.some((q) => q.isLoading)) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Mascot pose="wave" size={88} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Laying the tracks…
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      {/* Boarding-pass header — full-ticket treatment */}
      <View
        testID="journey-header"
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: 10 + headerTopInset,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Back to home"
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={[styles.backBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View
          testID="journey-header-ticket"
          // FULL COLOUR, matching the home screen pass. This was colors.card
          // with a 3% accent wash, which read as a pale outline beside the vivid
          // card on home and did not look like the same object.
          style={[styles.headerTicket, { borderColor: '#FFFFFF66', backgroundColor: line.accent }]}
        >
          <TicketStripes ink="#FFFFFF1A" />
          <View style={styles.headerTicketRow}>
            <View style={styles.headerTicketBody}>
              {/* Native-script brand must use the language font (Latin UI
                  font = tofu); same per-script handling as the picker. */}
              <Text
                style={[
                  styles.ticketEyebrow,
                  { color: '#FFFFFFCC' },
                  railBrand.native && isTallCascadingScript(activeLanguage)
                    ? styles.ticketEyebrowTall
                    : null,
                ]}
              >
                BOARDING PASS ·{' '}
                <Text
                  style={
                    railBrand.native
                      ? [styles.ticketEyebrowNative, nativeTextStyle(activeLanguage, { bold: true })]
                      : null
                  }
                >
                  {railBrand.text}
                </Text>
              </Text>
              <Text numberOfLines={1} style={[styles.ticketLine, { color: '#FFFFFF' }]}>
                {line.lineName}
              </Text>
              {/* Item 1: this line carries the number the whole item is about,
                  so it wraps instead of clipping to one line. On a 320pt
                  screen the route alone fills the ticket, and numberOfLines=1
                  cut the stop count off the end entirely. */}
              <Text numberOfLines={2} style={[styles.ticketRoute, { color: '#FFFFFFDD' }]}>
                {line.zones[0]} → {line.zones[5]} · {headerStations}
              </Text>
              {access === 'teaser' && teaserProgress && (
                <Text style={[styles.ticketTeaser, { color: '#FFFFFF' }]}>
                  Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                </Text>
              )}
            </View>
            {/* THE STUB IS GONE, AND THE PERFORATION IS NOW A TORN EDGE.
                Removed 2026-08-25: "technically, the ticket is already torn,
                just get rid of the stub". A boarding pass being read on the
                train has had its stub taken; keeping one attached was the
                detail that made the header look like a ticket nobody had
                collected yet.
                It was also invisible rather than empty, which is worth
                recording so nobody re-adds it thinking it never worked: the
                stamp was drawn with ink={line.accent} on a ticket whose
                background IS line.accent, so it was green on green. Web
                passed "#FFFFFF" for the same stamp and showed it fine.
                TicketPerforationV stays as the right-hand edge: a perforated
                edge with nothing past it is what a torn ticket looks like. */}
            <TicketPerforationV dashColor={colors.border} holeColor={colors.background} />
          </View>
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={zones.map(
          (_, zi) => (access === 'exhausted' ? 1 : 0) + zi * 2,
        )}
        showsVerticalScrollIndicator={false}
        onScroll={onMapScroll}
        // A TOUCH LANDS YOU ON YOUR CARD, it does not cancel. Cancelling is
        // what this used to do, and it left a learner who reached for the
        // screen stranded halfway down a map at a position nobody chose.
        // onTouchStart catches the tap the owner asked for; the drag handler
        // catches a flick, which is the same intent with more finger.
        onTouchStart={() => {
          userScrolledRef.current = true;
          landIntro();
        }}
        onScrollBeginDrag={() => {
          userScrolledRef.current = true;
          landIntro();
        }}
        scrollEventThrottle={16}
      >
        {access === 'exhausted' && (
          <View style={[styles.exhaustedCard, { borderColor: line.accent, backgroundColor: colors.card }]}>
            <Text style={[styles.exhaustedTitle, { color: colors.foreground }]}>
              You've tried the {line.lineName}! All {teaserProgress?.limit ?? 3} free
              phrases are used.
            </Text>
            <Text style={[styles.exhaustedBody, { color: colors.mutedForeground }]}>
              Unlock {languageName} to board every stop on the line.
            </Text>
            <Pressable
              onPress={() => {
                hapticLight();
                openPaywallForLanguage();
              }}
              style={[styles.exhaustedCta, { backgroundColor: line.accent }]}
            >
              <Feather name="star" size={16} color="#ffffff" />
              <Text style={styles.exhaustedCtaText}>Get your ticket</Text>
            </Pressable>
          </View>
        )}

        {/* Serpentine railway: track + zone postcards + stations. */}
        {/* CUT PER FARE ZONE (chat 11): each zone is a STICKY carved board
            child over a block child holding that zone's painting, scenery,
            track, stops and signals. stickyHeaderIndices pins the board to
            the viewport top while its own stops scroll beneath it, and the
            next zone's board pushes it away: "allow scrolling within the
            stop list and secondary scrolling when you reach the bottom of
            the stops in each zone to scroll to the next zone", and "the
            background image for Zone 1 should stay with the zone one header
            and zone one stops". The painted band, the scenery and the rail
            live in the BLOCK, drawn from layerTop (one postcard row above
            the block's own top), so the painting is continuous behind the
            board at rest and keeps scrolling under it while it is stuck.
            Slice arithmetic is untouched: a block draws its slice shifted
            by its own flow position. */}
        {zones.flatMap((zone, zi) => {
          const { start, end } = slices[zi]!;
          const blockTop = start + PC_H + ZONE_BOARD_GAP;
          const blockH = end - blockTop;
          const layerTop = -(PC_H + ZONE_BOARD_GAP);
            const pt = pts.find((p) => p.kind === 'postcard' && p.zoneIndex === zi)!;
            const zoneAccessible = zone.stations.some(
              (s) => isStatusAccessible(s.status) || s.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const cardColor = grayed ? GRAY : line.accent;
            // Zone gate-lock (web parity, owner-corrected): every stop locked
            // by progression, none by plan, and the listing is NOT a showroom
            // payload (no top-level access field). Showroom forces every
            // station locked with planLocked unset, so without the access
            // check the affordance would render for teaser and exhausted
            // callers. Pre-flip the first stop of every zone is unlocked, so
            // this stays dormant until CROSS_ZONE_GATE_ENABLED flips
            // server-side.
            const zoneGateLocked =
              access === null &&
              zone.stations.length > 0 &&
              zone.stations.every((s) => s.status === 'locked') &&
              !zone.stations.some((s) => s.planLocked === true);
            const boardChild = (
            <View
              key={`zone-board-${zone.id}`}
              testID={`zone-board-child-${zi}`}
              style={{
                width: mapW,
                alignSelf: 'center',
                height: PC_H + ZONE_BOARD_GAP,
                zIndex: 20,
              }}
              onLayout={zi === 0 ? onMapLayout : undefined}
            >
              <ZoneBandFixed
                zi={zi}
                start={start}
                end={end}
                layerTop={0}
                windowW={windowW}
                windowH={windowH}
                mapW={mapW}
                scrollY={scrollY}
                contentTop={18}
                mode="cap"
              />
                <View style={[styles.postcardWrap, { top: 10 }]}>
                  {/* THE CARVED STATION BOARD, cut into three so only the
                      panel stretches. See ZONE_BOARD in lib/zoneBackdrops.ts
                      for why it is three files and why it is capped. Web twin:
                      ZonePostcard in gujarati-coach/src/pages/journey.tsx. */}
                  <View style={[styles.board, { opacity: grayed ? 0.8 : 1 }]}>
                    {/* The pediment, aspect preserved: its rosettes and arch
                        must not stretch, which is the whole reason for the
                        three-slice. Sized in points computed from boardW: see
                        boardPedimentH above for why no percentage may appear
                        here. */}
                    <View style={{ width: boardW, height: boardPedimentH }}>
                      <Image
                        testID={`zone-board-top-${zi}`}
                        source={ZONE_BOARD_ART.top}
                        style={{ width: boardW, height: boardPedimentH }}
                        resizeMode="stretch"
                      />
                      {/* The nameplate. Positions are fractions of the slice,
                          so the overlay tracks the board at any width. */}
                      <View
                        pointerEvents="none"
                        style={[
                          styles.boardNamePlate,
                          {
                            left: `${ZONE_BOARD.namePlate.left * 100}%`,
                            right: `${ZONE_BOARD.namePlate.right * 100}%`,
                            top: `${ZONE_BOARD.namePlate.top * 100}%`,
                            height: `${ZONE_BOARD.namePlate.height * 100}%`,
                          },
                        ]}
                      >
                        <Text numberOfLines={1} style={styles.boardNamePlateText}>
                          {zone.title.toUpperCase()}
                        </Text>
                      </View>
                      <View
                        pointerEvents="none"
                        style={[
                          styles.boardZonePlate,
                          {
                            width: `${ZONE_BOARD.zonePlate.width * 100}%`,
                            top: `${ZONE_BOARD.zonePlate.top * 100}%`,
                            height: `${ZONE_BOARD.zonePlate.height * 100}%`,
                          },
                        ]}
                      >
                        <Text style={styles.boardZonePlateText}>ZONE {zi + 1}</Text>
                      </View>
                    </View>
                    {/* The panel. THE ONLY PART THAT STRETCHES, and it clips:
                        the map reserves PC_H for this row and the board may
                        never push into the first station beneath it. */}
                    <View style={styles.boardPanel}>
                      {/* Cream UNDER the art, and only as wide as the art's own
                          frame. The slice's paper has partial alpha so it needs
                          a fill behind it, and its outer 3.9% is fully
                          transparent so that fill must stop there or the panel
                          reads wider than the pediment above it. */}
                      <View pointerEvents="none" style={styles.boardPanelFill} />
                      {/* EXPLICIT POINTS, same cure as the pediment above: on
                          device this Image resolved absoluteFill to its
                          INTRINSIC 760x202, so the learner saw the art's left
                          frame line mid-panel and no right or bottom frame at
                          all ("zone card still doesn't look correct",
                          side-by-side, chat 11). */}
                      <Image
                        source={ZONE_BOARD_ART.panel}
                        resizeMode="stretch"
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: boardW,
                          height: boardPanelH,
                        }}
                      />
                      {/* Everything the board says lives inside the drawn
                          frame. */}
                      <View
                        style={[
                          styles.boardPanelBody,
                          {
                            paddingTop: boardPanelH * ZONE_BOARD.contentInsetTop,
                            paddingBottom: boardPanelH * ZONE_BOARD.contentInsetBottom,
                          },
                        ]}
                      >
                      {/* address side */}
                      <View style={styles.postcardAddress}>
                        <View style={styles.postcardLeft}>
                          {/* The fare-zone line came off the panel when the
                              carved board landed: the pediment's nameplate
                              carries the topic and the small plate carries the
                              number, so this said both a second time. */}
                          {/* Ink from the board, not a theme token: the panel
                              is cream in both themes and a cool slate reads
                              cold on it. */}
                          <Text
                            numberOfLines={1}
                            style={[styles.postcardGeoName, { color: ZONE_BOARD.ink }]}
                          >
                            {zone.geoName}
                          </Text>
                          <Text style={[styles.postcardStops, { color: ZONE_BOARD.inkMuted }]}>
                            {/* ROWS DRAWN, NOT PHRASE STATIONS. The card
                                said 9 while the rows beneath it said "Stop 1
                                of 11": the tracing and story stops are rows a
                                learner counts and this number never knew
                                about them. */}
                            {zone.rowStations.length} {zone.rowStations.length === 1 ? 'stop' : 'stops'} in this zone
                          </Text>
                          {/* THE DAILY FACT, web parity (chat 11): web's board
                              has carried a DID YOU KNOW strip since hotfix 3
                              and mobile's panel never got it, which the
                              owner's side-by-side called out. Static rather
                              than the web strip's 6-second rotation: per-frame
                              motion is not trusted on this app's release
                              builds (see CLAUDE.md, the native animation
                              driver), and a board read in passing needs one
                              fact, not a slideshow. Same factForZone
                              arithmetic, so both platforms show the same fact
                              for the same zone on the same day. */}
                          {!zoneGateLocked && (
                          <View
                            testID={`board-fact-${zi}`}
                            style={[styles.boardFact, { borderColor: `${cardColor}55` }]}
                          >
                            <Text style={[styles.boardFactLabel, { color: cardColor }]}>
                              DID YOU KNOW?
                            </Text>
                            <Text
                              numberOfLines={2}
                              style={[styles.boardFactText, { color: ZONE_BOARD.inkMuted }]}
                            >
                              {factForZone({
                                zoneIndex: zi,
                                geoName: zone.geoName,
                                lineName: line.lineName,
                              })}
                            </Text>
                          </View>
                          )}
                        </View>
                        {/* THE POSTMARK AND THE ZONE STAMP CAME OFF with the
                            carved board. The pediment's small plate says ZONE
                            n, so the stamp said it a second time, and a franked
                            postcard's furniture on a carved station board was
                            two different objects at once. */}
                      </View>
                      {/* Zone test-out affordance (web parity:
                          link-zone-test-out-{i}) — present only when the zone
                          is gate-locked; dormant pre-flip by construction. */}
                      {zoneGateLocked && (
                        <Pressable
                          testID={`link-zone-test-out-${zi}`}
                          accessibilityRole="button"
                          onPress={() => {
                            hapticLight();
                            router.push({
                              pathname: '/(app)/practice/[id]',
                              params: { id: String(zone.id), mode: 'testout', scope: 'zone' },
                            });
                          }}
                          style={[styles.postcardTestOut, { borderColor: cardColor }]}
                        >
                          <Text style={[styles.postcardTestOutText, { color: cardColor }]}>
                            Test out of this zone
                          </Text>
                        </Pressable>
                      )}
                      </View>
                    </View>
                  </View>
                </View>
                {/* interchange diamond pinned where the track meets the zone
                    card (top border) so it never collides with the card text */}
                <View
                  style={[
                    styles.interchange,
                    {
                      left: pt.x - 8,
                      top: 2,
                      backgroundColor: cardColor,
                    },
                  ]}
                >
                  <View style={styles.interchangeInner} />
                </View>
            </View>
            );
          const blockChild = (
            <View
              key={`zone-block-${zone.id}`}
              testID={`zone-block-child-${zi}`}
              style={{ width: mapW, alignSelf: 'center', height: blockH }}
            >
            <ZoneBandFixed
              zi={zi}
              start={start}
              end={end}
              layerTop={layerTop}
              windowW={windowW}
              windowH={windowH}
              mapW={mapW}
              scrollY={scrollY}
              contentTop={18}
            />
            <Animated.View
              testID={`journey-scenery-layer-${zi}`}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, sceneryParallaxStyle]}
            >
              {(() => {
              const local = sceneryPlacements.filter(
                // Chacha-ji is NOT in this pass any more: the even-width
                // cards covered him in later rows ("chachaji gets covered by
                // some of the new stop cards"), so his stall renders again
                // after the stations, above the card plane (chat 11).
                (sp) => sp.y >= start && sp.y < end && sp.kind !== 'chaiStall',
              );
              if (local.length === 0) return null;
              return (
                <Svg
                  pointerEvents="none"
                  style={{ position: 'absolute', left: 0, top: layerTop }}
                  width={mapW}
                  height={end - start}
                  viewBox={`0 ${start} ${mapW} ${end - start}`}
                >
                  {local.map((sp) => (
                    <G key={sp.key}>
                      {/* Chacha-ji's plate. ONLY his: the rest of the scenery
                          is meant to sit back into the painting, and he is the
                          one piece a learner has to be able to find.
                          A BOX NOW, NOT ELLIPSES (chat 11): "Add a box behind
                          chachaji so we can see him. just like the words below
                          him has." Same fill, same rounding, same opacity as
                          his nameplate below, so the stall and its label read
                          as one signpost. Sized to the stall's own 36x49
                          footprint plus a margin. */}
                      {sp.kind === 'chaiStall' && (
                        <Rect
                          x={sp.x - 33}
                          y={sp.y - 54}
                          width={66}
                          height={62}
                          rx={6}
                          fill={MAP_GLYPH_PLATE_FILL}
                          opacity={sp.gray ? 0.55 : 0.85}
                        />
                      )}
                      {/* HIS NAMEPLATE, WHICH MOBILE HAS NEVER HAD. Web has
                          labelled the stall since it stopped being anonymous
                          scenery, and the phone left the one recurring
                          character on the map unnamed: a learner had no way to
                          know the stall between stops is the same stall, or
                          whose it is. Same plate-then-ink treatment web uses,
                          because the label hangs BELOW the glyph plate and
                          would otherwise sit on the painting with nothing
                          behind it. */}
                      {sp.kind === 'chaiStall' && (
                        <>
                          <Rect
                            x={sp.x - 30}
                            y={sp.y + 10}
                            width={60}
                            height={20}
                            rx={5}
                            fill={MAP_GLYPH_PLATE_FILL}
                            opacity={sp.gray ? 0.55 : 0.85}
                          />
                          <SvgText
                            testID={`${sp.testID}-label`}
                            x={sp.x}
                            y={sp.y + 17}
                            textAnchor="middle"
                            fontSize={7}
                            fontWeight="700"
                            fill={TICKET.ink}
                            opacity={sp.gray ? 0.5 : 1}
                          >
                            Chacha-ji&#8217;s
                          </SvgText>
                          <SvgText
                            x={sp.x}
                            y={sp.y + 25}
                            textAnchor="middle"
                            fontSize={6}
                            fontWeight="800"
                            letterSpacing={0.6}
                            fill={TICKET.inkMuted}
                            opacity={sp.gray ? 0.5 : 1}
                          >
                            CHAI HALT
                          </SvgText>
                        </>
                      )}
                      <SceneryElement
                        kind={sp.kind}
                        x={sp.x}
                        y={sp.y}
                        accent={line.accent}
                        gray={sp.gray}
                        testID={sp.testID}
                      />
                    </G>
                  ))}
                </Svg>
              );
              })()}
            </Animated.View>
            <Svg
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: layerTop }}
              width={mapW}
              height={end - start}
              viewBox={`0 ${start} ${mapW} ${end - start}`}
            >
              {segs.map((s, i) => {
                if (!(s.y1 > start && s.y0 < end)) return null;
                // The unlit run stays wood rather than going grey: the sheet
                // draws the two states as the same track with and without a
                // halo, and greying it would say "disabled" where the truth is
                // "not yet travelled".
                const dash = s.lit ? undefined : RAIL_STROKE.unlitDash;
                return (
                  <G key={i} opacity={s.lit ? 1 : RAIL_STROKE.unlitOpacity}>
                    {/* THE HALO, under everything and only on the run behind
                        the learner. Two passes rather than one gradient: a
                        wide soft pass and a tighter brighter one give a falloff
                        that react-native-svg can draw with plain strokes, and a
                        radial gradient along a bezier is not a thing. */}
                    {s.lit &&
                      RAIL_GLOW_PASSES.map((pass) => (
                        <Path
                          key={pass.width}
                          d={s.d}
                          stroke={RAIL.glow}
                          strokeWidth={pass.width}
                          opacity={pass.opacity}
                          fill="none"
                          strokeLinecap="round"
                        />
                      ))}
                    {/* Rail-bed underside (Task 985): the tie band duplicated
                        once, offset down in ink at low opacity, so every tie
                        shows a bottom edge and the track reads as a raised
                        bed. The rail geometry itself is untouched. */}
                    <Path
                      d={s.d}
                      transform={`translate(0 ${DEPTH_2_5D.railBedDy})`}
                      stroke={RAIL.tieInk}
                      strokeWidth={RAIL_STROKE.tie}
                      strokeDasharray={RAIL_STROKE.tieDash}
                      opacity={DEPTH_2_5D.railBedOpacity}
                      fill="none"
                    />
                    {/* The sleepers, full strength now. They were the line
                        accent at 0.3 when the rail was a coloured line; they
                        are painted planks now and read as wood. */}
                    <Path d={s.d} stroke={RAIL.tie} strokeWidth={RAIL_STROKE.tie} strokeDasharray={RAIL_STROKE.tieDash} fill="none" />
                    <Path d={s.d} stroke={RAIL.rail} strokeWidth={RAIL_STROKE.rail} fill="none" strokeDasharray={dash} />
                    <Path d={s.d} stroke={s.lit ? RAIL.between : RAIL.betweenUnlit} strokeWidth={RAIL_STROKE.between} fill="none" strokeDasharray={dash} />
                  </G>
                );
              })}
              {/* Comet sweep on the active run: above the rail strokes, in
                  whichever slice(s) the sampled dots fall. */}
              {pulseDots.some((d) => d.y >= start && d.y < end) && (
                <RailPulseDots
                  dots={pulseDots}
                  start={start}
                  end={end}
                  color={line.accent}
                />
              )}
              {/* Festival bunting over the terminus (last slice only) */}
              {zi === slices.length - 1 && (
                <Bunting x1={20} x2={mapW - 20} y={termY - 34} accent={line.accent} />
              )}
            </Svg>
            {rowPts.map((p, k2) => {
              if (p.station!.zoneIndex !== zi) return null;
            const s = p.station!;
            const zone = zones[s.zoneIndex]!;
            const zoneAccessible = zone.stations.some(
              (st) => isStatusAccessible(st.status) || st.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const zoneColor = grayed ? GRAY : line.accent;
            // The flank comes off the GRADED index, never the render index: a
            // tracing row in the middle of a zone would otherwise flip every
            // card below it onto the wrong side of the track.
            const side: 'left' | 'right' = (p.globalIdx ?? k2) % 2 === 0 ? 'right' : 'left';
            // Even cards (chat 11): fixed width per flank, not "whatever is
            // left". 30 hangs the tag's tip 4pt off the 52pt medallion's rim,
            // which is the strung-tag read the reference draws.
            const boxLeft = side === 'right' ? p.x + 30 : p.x - 30 - cardW;
            const boxWidth = cardW;
            const stopLabel = `Stop ${s.stopNumber} of ${s.stopCount}`;
            // Free-tier content policy: sentence stops gate by the server's
            // planLocked flag (all-premium groups), not by stage — Hindi
            // Fare Zone 1's sentence stops serve free. A planLocked sentence
            // stop keeps the first-class upsell sheet.
            const sentenceGated =
              s.stage === 'sentence' && s.planLocked === true;
            // A tracing stop is never PROGRESSION-locked: it teaches the
            // alphabet, which no phrase stop gates. It can still be
            // PLAN-locked, which is a different thing and is how the free
            // taste is bounded to zone 1.
            // A story stop is never PROGRESSION-locked either, for the same
            // reason: it teaches nothing the phrase stops gate. It can still be
            // PLAN-locked, which is how the taste is bounded to zone 1.
            const accessible =
              s.trace || s.story
                ? // isStatusAccessible ADDED 2026-08-25 for the zone gate.
                  // These rows read planLocked and ignored status entirely,
                  // which is why a gate-locked zone could still hand back an
                  // open tracing or story stop. traceStopStatus only ever
                  // returns unlocked, in_progress or completed and a story row
                  // is unlocked unless the gate says otherwise, so the only
                  // status this can exclude is the gate's own "locked".
                  s.planLocked !== true && isStatusAccessible(s.status)
                : isStatusAccessible(s.status) && !sentenceGated;
            // NEITHER non-phrase row can be the current stop. `currentId` is a
            // lesson group id and these have none, but leaving the guard off
            // would let an undefined id match an undefined id.
            const isCurrent = !s.trace && !s.story && s.id === currentId;
            // Gold-edged stock once the stop is behind the learner, exactly as
            // the sheet draws its finished tag.
            const stopDone = s.status === 'completed' || s.status === 'tested_out';
            // The drawn tag (chat 11): which end tapers to the eyelet, and
            // which of the reference's shapes this stop wears. side names the
            // CARD's flank, so the tip faces the other way, back at the rail.
            const tipSide: 'left' | 'right' = side === 'right' ? 'left' : 'right';
            const tagPointed = !s.trace && !s.story;
            // Kind outranks state for the SHAPE: a finished tracing stop
            // stays a square sheet rather than turning into a gold tag, so
            // the silhouette always says what the stop IS. Done still shows
            // on phrase stops as the gold-edged tag.
            const tagVariant = s.trace
              ? ('trace' as const)
              : s.story
                ? ('story' as const)
                : stopDone
                  ? ('done' as const)
                  : isCurrent
                    ? ('current' as const)
                    : accessible
                      ? ('plain' as const)
                      : ('ahead' as const);
            // A tracing stop carries its own line ("Trace 8 letters", "3 of 8
            // letters traced"). It must NOT fall through to the phrase-stop
            // copy: it has no phrases, and "Now boarding" would collide with
            // the learner's actual current stop.
            const statusCopy = s.trace
              ? (s.traceCopy ?? '')
              : s.story
                ? // Says what it IS and how long, because a stop nobody can
                  // guess the shape of does not get opened. It must NOT fall
                  // through to the phrase-stop copy below: a story stop has no
                  // phrases, and that fall-through is exactly what printed
                  // "Now boarding, undefined phrases" on the live site for
                  // tracing.
                  `A picture story: ${s.story.scenes.length} scenes`
                : s.status === 'completed'
                ? 'Completed'
                : s.status === 'tested_out'
                  ? 'Tested out'
                  : s.status === 'in_progress'
                    ? 'In progress'
                    : accessible
                      ? 'Now boarding'
                      : 'Locked';
            // Item 3: journey-map copy carries no em dashes; a colon reads the
            // same and announces cleanly in a screen reader.
            const aria = s.story
              ? `${stopLabel}: ${s.story.title}, ${statusCopy} (story stop)`
              : s.trace
              ? `${stopLabel}: ${s.trace.title}, ${statusCopy} (tracing stop)`
              : `${stopLabel}: ${statusCopy}${s.stage === 'sentence' ? ' (sentence stop)' : ''}`;
            const onPress = () => {
              hapticLight();
              if (s.story) {
                if (accessible) {
              // NO SPLASH ON SELECTION (chat 11). The film played twice on
              // the way to one lesson: once arriving on the map and again on
              // the way off it, "I want to get rid of the second splash
              // playing after you select a stop on journey. feels
              // unnecessary." The arrival film is the one that earns its
              // place; a second showing of the same six seconds between a tap
              // and the thing tapped is a toll.
                  router.push({
                    pathname: '/(app)/(tabs)/games/storybook',
                    params: {
                      journey: String(s.story.journey),
                      zone: String(s.story.zone),
                    },
                  });
                } else {
                  router.push('/paywall');
                }
                return;
              }
              if (s.trace) {
                if (accessible) {
              // NO SPLASH ON SELECTION (chat 11). The film played twice on
              // the way to one lesson: once arriving on the map and again on
              // the way off it, "I want to get rid of the second splash
              // playing after you select a stop on journey. feels
              // unnecessary." The arrival film is the one that earns its
              // place; a second showing of the same six seconds between a tap
              // and the thing tapped is a toll.

                  router.push({
                    pathname: '/(app)/(tabs)/games/script-trace',
                    params: {
                      journey: String(s.trace.journey),
                      zone: String(s.trace.zone),
                    },
                  });
                  return;
                }
                setLock({
                  kind: 'plan',
                  stopLabel: `${stopLabel} · ${zone.geoName}`,
                  zoneTitle: zone.title,
                  zoneId: zone.id,
                });
                return;
              }
              if (accessible) {
              // NO SPLASH ON SELECTION (chat 11). The film played twice on
              // the way to one lesson: once arriving on the map and again on
              // the way off it, "I want to get rid of the second splash
              // playing after you select a stop on journey. feels
              // unnecessary." The arrival film is the one that earns its
              // place; a second showing of the same six seconds between a tap
              // and the thing tapped is a toll.
                router.push({
                  pathname: '/(app)/practice/[id]',
                  params: { id: String(zone.id), group: String(s.id) },
                });
                return;
              }
              setLock({
                kind: showroom
                  ? 'language'
                  : sentenceGated
                    ? 'sentence'
                    : s.planLocked === true
                      ? 'plan'
                      : 'progression',
                stopLabel: `${stopLabel} · ${zone.geoName}`,
                zoneTitle: zone.title,
                zoneId: zone.id,
                groupId: s.id,
                chaiUnlockable: s.chaiUnlockable === true,
              });
            };
            return (
              <View key={`row-${k2}`}>
                {/* rail marker (drawn above the track, non-interactive) */}
                <View pointerEvents="none" style={[styles.markerWrap, { left: p.x - 32, top: p.y - 32 - blockTop }]}>
                  <StationMarker
                    station={s}
                    color={zoneColor}
                    isCurrent={isCurrent}
                    accessible={accessible}
                    background={colors.background}
                    border={colors.border}
                    goldPalette={goldPalette}
                  />
                </View>
                {/* stop card */}
                <SlidingCardSlot
                  // Content coordinates, not canvas ones: the block sits at
                  // blockTop in the scroll content, so the two cancel and what
                  // is left is the card's own y plus the content's top pad.
                  cardY={SCROLL_CONTENT_TOP + p.y - STATION_H / 2}
                  side={side}
                  windowH={windowH}
                  scrollY={scrollY}
                  reduceMotion={reduceMotion}
                  style={[
                    styles.cardSlot,
                    {
                      left: boxLeft,
                      width: boxWidth,
                      top: p.y - STATION_H / 2 - blockTop,
                      alignItems: side === 'left' ? 'flex-end' : 'flex-start',
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={aria}
                    onPress={onPress}
                    // No tilt: tried for the reference's hung-tag feel and
                    // vetoed on sight, "tags shouldn't be tilted" (chat 11).
                    style={styles.cardRow}
                  >
                    <View
                      // Every stop card answers to one testID so a test can
                      // sweep the whole line and prove none of them lost its
                      // stock, which is exactly how this bug shipped.
                      testID="stop-card"
                      style={[
                        styles.card,
                        // The stock, edge, rule, eyelet and per-kind dressing
                        // all moved into TagCardBack (chat 11): a View border
                        // cannot taper into a luggage-tag tip. The tip side
                        // gets the deeper padding so no copy sits on the
                        // taper.
                        { width: cardW },
                        tipSide === 'left'
                          ? { paddingLeft: tagPointed ? 24 : 14, paddingRight: 12 }
                          : { paddingLeft: 12, paddingRight: tagPointed ? 24 : 14 },
                      ]}
                    >
                      <TagCardBack
                        w={cardW}
                        h={72}
                        side={tipSide}
                        variant={tagVariant}
                        accent={zoneColor}
                      />
                      {/* Signboard dressing: the current stop gets a full-width
                          zone-color roof bar + pulsing glow; every other stop
                          hangs a small tick from its top edge (web parity). */}
                      {isCurrent ? (
                        <View
                          testID="signboard-bar"
                          style={[styles.signboardBar, { backgroundColor: zoneColor }]}
                        />
                      ) : (
                        <View
                          testID={`stop-tick-${s.id}`}
                          style={[
                            styles.stopTick,
                            { backgroundColor: accessible ? zoneColor : colors.border },
                          ]}
                        />
                      )}
                      {isCurrent && !reduceMotion && <StopGlowPulse color={zoneColor} />}
                      <View style={styles.cardTitleRow}>
                        {/* BOLO STANDS ON THE CARD NOW, not beside it.
                            Reported from the preview: "Move bolo onto the card
                            itself, he blends in." He was on the painting, which
                            is a busy bazaar at his own scale, so a small mascot
                            on it read as more bazaar. On cream stock he has a
                            ground to stand on. 28, not 44: he is inside a
                            two-line card now rather than in the margin. */}
                        {isCurrent && <Mascot pose="cheer" size={28} motion="none" />}
                        {isCurrent && <StationSignGlyph color={zoneColor} />}
                        <Text
                          style={[
                            styles.cardTitle,
                            // Ink from the ticket, not a theme token: the stock is
                          // cream in both themes and a cool slate reads cold on it.
                          { color: accessible ? TICKET.ink : TICKET.inkAhead },
                          ]}
                        >
                          {stopLabel}
                        </Text>
                        {/* Chips ride the far end of the tag (chat 11): with
                            even-width tags, everything hugging the title left
                            half the paper empty. */}
                        <View style={styles.cardTitleSpacer} />
                        {/* Entitlement chip only where the server actually serves
                            the stop plan-locked — on stops the caller can ride free
                            (Hindi Zone 1 carve-out) or already owns (Plus/Family),
                            the badge is noise. Mirrors the web condition. */}
                        {/* EVERY plan-locked stop wears the plate (chat 11):
                            "Zone 3 and onward every stop should have this
                            badge." It was sentence/trace/story only, which
                            left a zone of plain Locked word stops with no
                            hint of WHICH key opens them. Server truth still
                            gates it: no planLocked, no plate. Web twin needs
                            the same change. */}
                        {s.planLocked === true && (
                          <View style={[styles.allAccessChip, styles.rusticChip, { backgroundColor: BADGE.brassBg, borderColor: BADGE.brassEdge }]}>
                            <Feather name="star" size={9} color={colors.secondary} />
                            <Text style={[styles.allAccessChipText, { color: BADGE.ink }]}>
                              ALL-ACCESS
                            </Text>
                          </View>
                        )}
                        {s.status === 'tested_out' && (
                          <View style={[styles.expressStamp, { borderColor: zoneColor }]}>
                            <Text style={[styles.expressStampText, { color: zoneColor }]}>EXPRESS</Text>
                          </View>
                        )}
                        {s.teaserStation === true && (
                          <View style={[styles.teaserChip, styles.rusticChip, { backgroundColor: BADGE.brassBg, borderColor: BADGE.brassEdge }]}>
                            <Text style={styles.teaserChipText}>FREE TASTE</Text>
                          </View>
                        )}
                      </View>
                      {/* THE STATUS ROW (chat 11): the kind chip and the
                          lock moved down here from the title row. With the
                          ALL-ACCESS plate on every plan-locked stop, a trace
                          stop's title row carried title + two plates + a
                          lock and WRAPPED, which is what kept pushing the
                          stop-5 tags past their edges. One plate per row. */}
                      <View style={styles.cardStatusRow}>
                        {s.trace && (
                          <View style={[styles.traceChip, styles.rusticChip, { backgroundColor: BADGE.traceBg, borderColor: BADGE.traceEdge }]}>
                            <Feather name="edit-2" size={8} color="#ffffff" />
                            <Text style={styles.traceChipText}>TRACE</Text>
                          </View>
                        )}
                        {s.story && (
                          <View style={[styles.traceChip, styles.rusticChip, { backgroundColor: BADGE.storyBg, borderColor: BADGE.storyEdge }]}>
                            <Feather name="book-open" size={8} color="#ffffff" />
                            <Text style={styles.traceChipText}>STORY</Text>
                          </View>
                        )}
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.cardStatus,
                          { flexShrink: 1 },
                          isCurrent
                            ? { color: zoneColor, fontFamily: AppFonts.bold }
                            : // Ink from the ticket, not a theme token (chat
                              // 11 dark-mode sweep): dark theme's muted
                              // foreground went pale blue-grey on cream.
                              { color: accessible ? TICKET.inkMuted : TICKET.inkAhead },
                        ]}
                      >
                        {statusCopy}
                        {/* WEB'S RULE, WHICH MOBILE NEVER HAD. This appended
                            the count on every row, so a tracing stop printed
                            "Trace 8 letters · undefined phrases" and a story
                            stop "5 scenes · undefined phrases": neither has a
                            phraseCount, and undefined stringifies happily.
                            Reported from a device 2026-08-25. The web frame
                            has excluded trace, story and plan-locked rows
                            since it was written; the divergence was ours.
                            Plan-locked stops serve a plan-visible count of
                            zero, so "Locked · 0 phrases" was noise too. */}
                        {!s.trace &&
                        !s.story &&
                        !s.attemptedCount &&
                        s.planLocked !== true &&
                        s.phraseCount != null
                          ? ` · ${s.phraseCount} phrases`
                          : ''}
                        {/* Item 2: no "Bolo is waiting here" fragment. Bolo
                            already stands beside this card, and the words were
                            what pushed the current stop's status onto a second
                            line at narrow widths. */}
                      </Text>
                        <View style={styles.cardTitleSpacer} />
                        {!accessible && (
                          <Feather name="lock" size={12} color={TICKET.inkAhead} />
                        )}
                      </View>
                      {/* Started stops trade the text fraction for a real
                          progress track (web parity). */}
                      {/* A TRACING STOP HAS PROGRESS AND HAD NO BAR. Its copy
                          already counted the letters; only the track was
                          missing, because the track hung off attemptedCount and
                          a trace stop has no attempts. The STORY stop still has
                          none, and deliberately: nothing in the app records how
                          much of a book has been read, so a bar there would be
                          decoration rather than progress. */}
                      {s.trace && s.traceTotal ? (
                        <View style={styles.cardProgressRow}>
                          <View
                            style={[
                              styles.cardProgressTrack,
                              { backgroundColor: accessible ? `${zoneColor}26` : `${TICKET.inkAhead}33` },
                            ]}
                          >
                            <View
                              style={{
                                width: `${Math.round(((s.traceDone ?? 0) / s.traceTotal) * 100)}%`,
                                height: '100%',
                                borderRadius: 3,
                                backgroundColor: accessible ? zoneColor : TICKET.inkAhead,
                              }}
                              testID={`progress-trace-${s.stopNumber}`}
                            />
                          </View>
                          <Text
                            style={[
                              styles.cardProgressLabel,
                              { color: isCurrent ? zoneColor : TICKET.inkMuted },
                            ]}
                          >
                            {s.traceDone ?? 0}/{s.traceTotal}
                          </Text>
                        </View>
                      ) : null}
                      {s.attemptedCount ? (
                        <View style={styles.cardProgressRow}>
                          <View
                            style={[
                              styles.cardProgressTrack,
                              { backgroundColor: accessible ? `${zoneColor}26` : `${TICKET.inkAhead}33` },
                            ]}
                          >
                            <View
                              testID={`stop-progress-${s.id}`}
                              style={[
                                styles.cardProgressFill,
                                {
                                  // A percentage of the now-flexible track,
                                  // not CARD_PROGRESS_W points of it.
                                  width: `${Math.round(
                                    (Math.min(s.masteredCount ?? 0, s.phraseCount ?? 0) /
                                      Math.max(s.phraseCount ?? 0, 1)) *
                                      100,
                                  )}%`,
                                  backgroundColor: accessible
                                    ? zoneColor
                                    : TICKET.inkAhead,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.cardProgressLabel,
                              { color: isCurrent ? zoneColor : TICKET.inkMuted },
                            ]}
                          >
                            {s.masteredCount}/{s.phraseCount} mastered
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </SlidingCardSlot>
              </View>
            );
            })}
            {(() => {
              const stalls = sceneryPlacements.filter(
                (sp) => sp.y >= start && sp.y < end && sp.kind === 'chaiStall',
              );
              if (stalls.length === 0) return null;
              /* ONE SMALL Svg PER STALL, NOT ONE SPANNING THE ZONE. The
                 zone-wide overlay sat above the cards (that is its job) and
                 ATE EVERY TAP UNDER IT despite pointerEvents="none":
                 react-native-svg's root does not reliably pass touches
                 through on this architecture, found live in chat 11 ("i
                 cant click on the stop cards"). A box the size of the stall
                 can only ever cost taps on the stall itself. */
              return stalls.map((sp) => (
                <Svg
                  key={sp.key}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: sp.x - 45,
                    top: sp.y - 62 - blockTop,
                    zIndex: 5,
                  }}
                  width={90}
                  height={112}
                  viewBox={`${sp.x - 45} ${sp.y - 62} 90 112`}
                >
                  <G key={sp.key}>
                      <Rect
                        x={sp.x - 33}
                        y={sp.y - 54}
                        width={66}
                        height={62}
                        rx={6}
                        fill={MAP_GLYPH_PLATE_FILL}
                        opacity={sp.gray ? 0.55 : 0.85}
                      />
                      <Rect
                        x={sp.x - 30}
                        y={sp.y + 10}
                        width={60}
                        height={20}
                        rx={5}
                        fill={MAP_GLYPH_PLATE_FILL}
                        opacity={sp.gray ? 0.55 : 0.85}
                      />
                      <SvgText
                        testID={`${sp.testID}-label`}
                        x={sp.x}
                        y={sp.y + 17}
                        textAnchor="middle"
                        fontSize={7}
                        fontWeight="700"
                        fill={TICKET.ink}
                        opacity={sp.gray ? 0.5 : 1}
                      >
                        Chacha-ji&#8217;s
                      </SvgText>
                      <SvgText
                        x={sp.x}
                        y={sp.y + 25}
                        textAnchor="middle"
                        fontSize={6}
                        fontWeight="800"
                        letterSpacing={0.6}
                        fill={TICKET.inkMuted}
                        opacity={sp.gray ? 0.5 : 1}
                      >
                        CHAI HALT
                      </SvgText>
                      <SceneryElement
                        kind={sp.kind}
                        x={sp.x}
                        y={sp.y}
                        accent={line.accent}
                        gray={sp.gray}
                        testID={sp.testID}
                      />
                    </G>
                </Svg>
              ));
            })()}
            {zi === zones.length - 1 && (
              <>
          {/* terminus */}
          <View
            style={[
              styles.terminusOuter,
              {
                left: termX - 14,
                top: termY - 14 - blockTop,
                backgroundColor: allDone ? line.accent : GRAY,
              },
            ]}
          >
            <View
              style={[
                styles.terminusInner,
                { backgroundColor: allDone ? line.accent : GRAY },
              ]}
            />
          </View>
          {/* Item 3: the label used to flank the terminus dot on whichever
              side the serpentine ended, which put it under the festival
              bunting (strung at termY-34, flags hanging to termY+3) and
              right-aligned it half the time, so a wrapped second line drifted
              to the wrong edge. It now sits below the dot, across the full
              column, always centered: clear of the bunting above and of every
              scenery object, which is anchored to station rows further up. */}
          <View
            style={[
              styles.terminusLabelWrap,
              { left: 12, right: 12, top: termY + TERM_LABEL_DY - blockTop },
            ]}
          >
            <Text
              style={[
                styles.terminusLabel,
                { color: colors.mutedForeground, textAlign: 'center' },
              ]}
            >
              Terminus: {line.zones[5]},{' '}
              {allDone ? 'journey complete!' : 'the festival finale awaits'}
            </Text>
          </View>
              </>
            )}
          {/* Trackside signals.
              TRAP 2: deliberately NOT drawn inside the per-zone <Svg> slices.
              The map is sliced per zone for scroll performance, so a signal
              seated near a zone boundary would straddle two slices and be
              clipped by one of them. These are plain absolutely positioned
              Views layered over the ScrollView content.
              TRAP 3: they sit in the SAME non-parallax layer as the stations
              and the rail. The scenery layer carries a 0.03 parallax factor,
              which would drift a signal out of register with its own gap. */}
          {signals
            .filter((sig) => sig.zoneId === zone.id)
            .map((sig) => (
            <Pressable
              key={`signal-${sig.gap}`}
              testID={`signal-${sig.gap}`}
              accessibilityRole="button"
              accessibilityLabel={`Trackside signal after stop ${sig.gap}`}
              // An upcoming crossing is real scenery, not a dead button.
              disabled={sig.state === 'upcoming'}
              onPress={() => {
                hapticLight();
                // A manual open counts as seen, so the soft stop does not
                // reopen the same encounter later in the session.
                signalMemory.markStopSeen(sig.gap);
                setSignalDlg(sig);
              }}
              style={[styles.signalWrap, { left: sig.x - 28, top: sig.y - 33 - blockTop }]}
            >
              {/* His plate. See MAP_GLYPH_PLATE: a signal post is 20px of line
                  art on a painted bazaar at its own scale, so it read as more
                  bazaar. Nothing was wrong with the glyph; it had nothing
                  behind it. */}
              <View pointerEvents="none" style={styles.glyphPlate} />
              <SignalGlyph state={sig.state} />
            </Pressable>
          ))}
            </View>
          );
          return [boardChild, blockChild];
        })}

        <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>
          Tap any lit station to practice it. The {line.lineName} only stops at
          the next station once you finish the one before it.
        </Text>
      </Animated.ScrollView>

      {/* Lock dialogs: entitlement locks and progression locks read
          differently — a true mirror of the shipped web dialogs, including
          the progression dialog's Express test-out action. */}
      <Modal
        visible={lock !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLock(null)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setLock(null)}>
          <Pressable
            style={[styles.dialogCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {lock?.kind === 'progression' && (
              <>
                <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                  This stop is still locked
                </Text>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {lock.stopLabel}: finish the stop before this one to board here. The{' '}
                  {line.lineName} runs station by station.
                </Text>
                <Pressable
                  onPress={() => setLock(null)}
                  style={[styles.dialogCta, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.dialogCtaText, { color: colors.primaryForeground }]}>
                    Keep practicing
                  </Text>
                </Pressable>
                {/* Express test-out: five sampled phrases, one take each,
                    judged server-side (0.8 pass ratio). Quiet secondary action
                    so the default path stays "finish the stop before it". */}
                {lock.zoneId !== undefined && lock.groupId !== undefined && (
                  <Pressable
                    testID="link-test-out"
                    accessibilityRole="button"
                    onPress={() => {
                      const { zoneId, groupId } = lock;
                      setLock(null);
                      router.push({
                        pathname: '/(app)/practice/[id]',
                        params: { id: String(zoneId), group: String(groupId), mode: 'testout' },
                      });
                    }}
                    style={[styles.dialogSecondaryCta, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.dialogSecondaryCtaText, { color: colors.foreground }]}>
                      Test out of this stop
                    </Text>
                  </Pressable>
                )}
                {/* Zone-scope express (web parity: link-test-out-zone): one
                    phrase from each stop, judged in one shot. Same quiet
                    secondary treatment so the default path stays "finish the
                    stop before it". */}
                {lock.zoneId !== undefined && (
                  <Pressable
                    testID="link-test-out-zone"
                    accessibilityRole="button"
                    onPress={() => {
                      const { zoneId } = lock;
                      setLock(null);
                      router.push({
                        pathname: '/(app)/practice/[id]',
                        params: { id: String(zoneId), mode: 'testout', scope: 'zone' },
                      });
                    }}
                    style={[styles.dialogSecondaryCta, styles.dialogSecondaryCtaCol, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.dialogSecondaryCtaText, { color: colors.foreground }]}>
                      Test out of this whole zone
                    </Text>
                    <Text style={[styles.dialogSecondarySubText, { color: colors.mutedForeground }]}>
                      One phrase from each stop. Pass to unlock everything here.
                    </Text>
                  </Pressable>
                )}
              </>
            )}
            {lock?.kind === 'sentence' && (
              <>
                <View style={styles.dialogTitleRow}>
                  <View style={[styles.dialogDiamond, { backgroundColor: line.accent }]} />
                  <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                    First-class coach: full sentences
                  </Text>
                </View>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {lock.stopLabel} is a sentence stop: graduate from phrases to
                  real, natural sentences. First-class seats are an All-Access perk.
                </Text>
                <Pressable
                  onPress={() => {
                    setLock(null);
                    router.push('/(app)/paywall');
                  }}
                  style={[styles.dialogCta, { backgroundColor: colors.secondary }]}
                >
                  <Feather name="star" size={16} color="#ffffff" />
                  <Text style={[styles.dialogCtaText, { color: '#ffffff' }]}>
                    Unlock with All-Access
                  </Text>
                </Pressable>
              </>
            )}
            {lock?.kind === 'plan' && (
              <>
                <View style={styles.dialogTitleRow}>
                  <Feather name="lock" size={14} color={colors.foreground} />
                  <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                    This stop is All-Access territory
                  </Text>
                </View>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {lock.stopLabel}: every phrase at this stop is part of the
                  extended library. Unlock All-Access to keep riding the{' '}
                  {line.lineName}.
                </Text>
                <Pressable
                  onPress={() => {
                    setLock(null);
                    router.push('/(app)/paywall');
                  }}
                  testID="plan-lock-upgrade"
                  style={[styles.dialogCta, { backgroundColor: colors.secondary }]}
                >
                  <Feather name="star" size={16} color="#ffffff" />
                  <Text style={[styles.dialogCtaText, { color: '#ffffff' }]}>
                    Unlock with All-Access
                  </Text>
                </Pressable>
              </>
            )}
            {lock?.kind === 'language' && (
              <>
                <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                  {access === 'exhausted'
                    ? "You've tried this line!"
                    : 'This line needs a ticket'}
                </Text>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {access === 'exhausted'
                    ? `All ${teaserProgress?.limit ?? 3} free phrases on the ${line.lineName} are used. Unlock ${languageName} to keep riding.`
                    : `Your free taste covers the marked station (${teaserProgress?.consumed ?? 0}/${teaserProgress?.limit ?? 3} tried). Unlock ${languageName} to board every stop.`}
                </Text>
                {/* Chai stop unlock: offered ONLY where the server says so —
                    inside the first fare zone of a line the learner hasn't
                    bought. Once opened, the stop stays open for good (the
                    purchase is a ledger row, not device state). Everything
                    further down the line is All-Access territory, and the
                    ticket action below is untouched. */}
                {lock.chaiUnlockable === true &&
                  stopUnlockCost !== null &&
                  lock.groupId !== undefined && (
                    <>
                      <Pressable
                        testID="unlock-stop-chai"
                        disabled={unlockStop.isPending}
                        onPress={() => {
                          hapticLight();
                          setUnlockError(null);
                          unlockStop.mutate({
                            data: { lessonGroupId: lock.groupId! },
                          });
                        }}
                        style={[
                          styles.dialogSecondaryCta,
                          {
                            borderColor: colors.border,
                            opacity: unlockStop.isPending ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.dialogSecondaryCtaText, { color: colors.foreground }]}
                        >
                          {unlockStop.isPending
                            ? 'Opening the stop…'
                            : `Open this stop for ${stopUnlockCost} Chai`}
                        </Text>
                      </Pressable>
                      <Text
                        style={[styles.dialogFootnote, { color: colors.mutedForeground }]}
                      >
                        Yours for keeps. You have {tokensQuery.data?.balance ?? 0} Chai.
                        Stops further down the {line.lineName} need a ticket.
                      </Text>
                      {unlockError !== null && (
                        <Text
                          testID="unlock-stop-error"
                          style={[styles.dialogFootnote, { color: colors.destructive }]}
                        >
                          {unlockError}
                        </Text>
                      )}
                    </>
                  )}
                <Pressable
                  onPress={openPaywallForLanguage}
                  style={[styles.dialogCta, { backgroundColor: colors.primary }]}
                >
                  <Feather name="star" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.dialogCtaText, { color: colors.primaryForeground }]}>
                    Get your ticket
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable
              accessibilityLabel="Close"
              onPress={() => setLock(null)}
              style={[styles.dialogClose, { backgroundColor: colors.muted }]}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <SignalSoftStop
        sig={heldSignal}
        blocked={lock !== null || signalDlg !== null || closeoutPending}
        hydrated={signalMemory.hydrated}
        isStopSeen={signalMemory.isStopSeen}
        markStopSeen={signalMemory.markStopSeen}
        onOpen={setSignalDlg}
      />
      <SignalEncounterDialog
        encounter={signalDlg}
        colors={colors}
        onPlay={playSignalGame}
        onWave={waveSignal}
        onClose={() => setSignalDlg(null)}
        goldPalette={goldPalette}
      />
      {/* Chacha-ji's stall, under the same soft-stop discipline as the signal:
          it waits for a lock, a signal or an owed closeout to clear, and opens
          once per station. */}
      <EmergencySoftStop
        zone={emergencyZone}
        blocked={lock !== null || signalDlg !== null || chachaDlg !== null || closeoutPending}
        onFire={(z) =>
          router.push({
            pathname: '/games/emergency',
            params: { journey: String(EMERGENCY_JOURNEY), zone: String(z) },
          })
        }
      />
      <ChachaSoftStop
        station={chachaStationIdx}
        blocked={lock !== null || signalDlg !== null || chachaDlg !== null || closeoutPending}
        hydrated={chachaMemory.hydrated}
        isSeen={chachaMemory.isSeen}
        onOpen={openChachaEncounter}
      />
      <ChachaEncounterDialog
        encounter={chachaDlg}
        colors={colors}
        languageName={languageName}
        onDismiss={leaveChachaStall}
        onDecline={leaveChachaStall}
      />
      {/* Zone closeout: beat one the result, beat two the Chai payoff.
          Showroom callers have no live progress to close out. Direction two
          of the suppression (an addition over web): the celebration waits
          while a lock or signal dialog owns the screen. */}
      {!showroom && (
        <ZoneCloseoutOverlay
          lang={activeLang}
          lineName={line.lineName}
          accent={line.accent}
          colors={colors}
          memory={closeoutMemory}
          blocked={lock !== null || signalDlg !== null}
          onOpenWallet={() => setWalletOpen(true)}
          zones={zones.map((z, zi) => ({
            zoneIndex: zi,
            zoneId: z.id,
            geoName: z.geoName,
            title: z.title,
            allDone: z.zoneAllDone,
            scenarioId: scenarioIdByZone.get(zi),
            hasStamp: stampedZoneIndices.has(zi),
          }))}
        />
      )}
      {/* Mounted on demand: the sheet runs a tokens query, and the map has no
          business fetching a wallet balance nobody asked to see. */}
      {walletOpen && (
        <ChaiWalletSheet visible onClose={() => setWalletOpen(false)} />
      )}
      <MilestoneToast message={waveToast.message} toastKey={waveToast.key} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontFamily: AppFonts.bold, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    // paddingTop is applied inline: 10 plus the safe-area/web chrome inset.
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTicket: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    // Belt for the build-28 native regression (see TicketParts sizing
    // contract): header content tops out around ~95px even with tall
    // scripts + the teaser line. If any child measures itself unbounded
    // again, this cap stops the header from swallowing the map.
    maxHeight: 140,
  },
  headerTicketRow: { flexDirection: 'row', alignItems: 'stretch' },
  headerTicketBody: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 9 },
  ticketEyebrow: { fontFamily: AppFonts.bold, fontSize: 9, letterSpacing: 1.5 },
  // Nastaliq cascades above/below the baseline — keep the one-line brand
  // from clipping.
  ticketEyebrowTall: { lineHeight: 22 },
  ticketEyebrowNative: { fontSize: 10, letterSpacing: 0 },
  ticketLine: { fontFamily: AppFonts.extrabold, fontSize: 16, lineHeight: 20 },
  ticketRoute: { fontFamily: AppFonts.semibold, fontSize: 11 },
  ticketTeaser: { fontFamily: AppFonts.bold, fontSize: 10 },
  headerStub: {
    width: 76,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    position: 'relative',
  },
  // Centers the 44px stamp inside its full rotated visual extent (the -12
  // degree tilt makes the bounding box ~53px; 52 clipped the corners).
  stubStampSlot: {
    width: zoneStampExtent(44),
    height: zoneStampExtent(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // paddingTop carries what used to be the map View's marginTop (8) plus the
  // canvas TOP_PAD (10), now that the zone children sit directly in the
  // scroll content for stickyHeaderIndices (chat 11).
  scrollContent: { paddingTop: SCROLL_CONTENT_TOP, paddingBottom: 48 },
  exhaustedCard: {
    marginHorizontal: 12,
    marginTop: 16,
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
  },
  exhaustedTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  exhaustedBody: { fontFamily: AppFonts.semibold, fontSize: 12, marginTop: 4 },
  exhaustedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  exhaustedCtaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#ffffff' },
  map: {
    alignSelf: 'center',
    marginTop: 8,
    position: 'relative',
  },
  // 40x50 glyph inside a 56x66 slot: the hit target clears the 44px minimum
  // without the glyph itself growing.
  signalWrap: {
    position: 'absolute',
    width: 56,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 64, was 56: the medallion grew to 52 plus its plate rim (chat 11), and
  // the wrap centers on the rail point so the offset in the render is half.
  markerWrap: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  markerCurrentOuter: { borderRadius: 26, padding: 4 },
  markerCurrentRing: { borderRadius: 22, padding: 4 },
  markerCurrentPill: {
    width: 40,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  // THE MEDALLION, replacing the filled and hollow circles on 2026-08-26. Two
  // points wider than the old 20 so a painted emblem has room to read at all;
  // any smaller and the compass rose turns to mush on a 3x screen.
  //
  // BIGGER, BARE ART (chat 11). "Make ours larger and not transparent" grew
  // it from 34; a cream plate went behind it for one reload and came straight
  // back off: "the emblems at each stop shouldn't have a circle behind them".
  // The no-chrome verdict of 2026-08-26 stands; only the size changed.
  medallion: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionArt: { width: 50, height: 50 },
  // A sentence stop rotates its frame 45 degrees; the art inside rotates back
  // so the compass is not standing on its corner.
  medallionArtUpright: { transform: [{ rotate: '-45deg' }] },
  markerDoneRing: { borderRadius: 12, padding: 2 },
  markerDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
  },
  markerOpen: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
  diamond: { transform: [{ rotate: '45deg' }], borderRadius: 4 },
  diamondInner: { borderRadius: 3 },
  // The soft warm ground a small glyph needs on a painting. Web twin:
  // `.map-glyph-plate` in index.css. Flat rather than a gradient here: RN needs
  // a library for a radial and one plate does not justify it, so the radius and
  // the low alpha carry the falloff.
  glyphPlate: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: MAP_GLYPH_PLATE_FILL,
    // WAS 0.42, which on a device read as a white lozenge parked behind the
    // signal rather than as a ground under it. The glyph only needs enough
    // separation to be findable; the box was doing more than that.
    opacity: 0.26,
  },
  postcardWrap: { position: 'absolute', left: 16, right: 16 },
  // The carved board. Capped at PC_H so it can never push into the first
  // station row: the map reserves exactly that much for this row and the
  // serpentine constants are shared with the scenery placement tests.
  // EXACTLY PC_H, not "at most". A cap plus overflow hidden crops whatever
  // happens to be last, which is how the fact ended up with its final line
  // sliced off. As a column, the pediment and the foot take their aspect and
  // the panel absorbs precisely the remainder.
  board: { height: PC_H, flexDirection: 'column', overflow: 'hidden' },
  boardTop: { width: '100%', aspectRatio: ZONE_BOARD.artW / ZONE_BOARD.topH },
  boardPanel: { width: '100%', flex: 1, minHeight: 0, overflow: 'hidden' },
  boardPanelFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `${ZONE_BOARD.panelInsetLeft * 100}%`,
    right: `${ZONE_BOARD.panelInsetRight * 100}%`,
    backgroundColor: ZONE_BOARD.panel,
  },
  // A FLEX CHILD, NOT AN ABSOLUTE BOX, and that is the third and last attempt
  // at this. It was a percentage top/bottom pair, then points, and both derived
  // a height from position, which Yoga does not do the way CSS does: the box
  // collapsed and overflow hidden made an empty panel look exactly like a
  // missing one. Reported off three TestFlight builds running.
  //
  // flex:1 inside a parent that already has a height cannot collapse. The fill
  // and the art stay absolute BEHIND it; only the words use the flow.
  boardPanelBody: {
    flex: 1,
    paddingLeft: `${ZONE_BOARD.contentInset * 100}%`,
    paddingRight: `${ZONE_BOARD.contentInset * 100}%`,
    overflow: 'hidden',
  },
  // The daily-fact strip inside the panel. Web twin: LiveFactStrip's button in
  // journey.tsx (dashed accent border, 8px label, 9px two-line fact).
  boardFact: {
    marginTop: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boardFactLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  boardFactText: {
    fontFamily: AppFonts.semibold,
    fontSize: 9,
    lineHeight: 12,
  },
  boardNamePlate: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardNamePlateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: ZONE_BOARD.ink,
  },
  boardZonePlate: {
    position: 'absolute',
    left: '39.5%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardZonePlateText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1,
    color: ZONE_BOARD.inkMuted,
  },
  postcard: {
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  postcardInner: {
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  postcardAddress: { flexDirection: 'row', alignItems: 'stretch' },
  postcardLeft: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 6 },
  postcardZoneLabel: { fontFamily: AppFonts.bold, fontSize: 9, letterSpacing: 1.5 },
  postcardGeoName: { fontFamily: AppFonts.extrabold, fontSize: 14, lineHeight: 17, color: '#1f2937' },
  postcardStops: { fontFamily: AppFonts.semibold, fontSize: 10, color: '#6b7280' },
  // 34B: dormant whole-zone test-out affordance on a fully gate-locked zone.
  postcardTestOut: {
    marginHorizontal: 6,
    marginBottom: 6,
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  postcardTestOutText: { fontFamily: AppFonts.bold, fontSize: 12 },
  postcardRule: { width: 1, alignSelf: 'stretch', marginVertical: 6 },
  postcardRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  postmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postmarkInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postmarkDot: { width: 4, height: 4, borderRadius: 2 },
  postageStamp: {
    width: 36,
    height: 36,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postageStampLabel: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.5, lineHeight: 9 },
  postageStampNum: { fontFamily: AppFonts.extrabold, fontSize: 16, lineHeight: 18 },
  interchange: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  interchangeInner: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 3,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  cardSlot: {
    position: 'absolute',
    height: STATION_H,
    justifyContent: 'center',
    zIndex: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // The sheet's inner frame and the eyelet it hangs by. Web twin:
  // `.station-card::before` and `::after` in index.css.
  ticketRule: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    bottom: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  // The page turning back on itself on a tracing stop. RN cannot draw a
  // half-gradient corner, so the flap is a rotated square in the aged stock
  // with a crease along two of its edges. Web twin: `.ticket-fold`.
  // The page turning back on itself on a tracing stop. A BORDER TRIANGLE, not
  // a rotated square: a rotated square hangs its far half outside the card, and
  // the card cannot clip (its eyelet and its glow ring both sit outside the
  // bounds on purpose). This stays inside the corner by construction. Web twin:
  // `.ticket-fold`, which gets there with a half-stop gradient.
  ticketFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 15,
    borderTopColor: TICKET.stockAheadBottom,
    borderLeftWidth: 15,
    borderLeftColor: 'transparent',
    borderTopRightRadius: 8,
  },
  ticketFlourish: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 16,
    borderTopColor: BADGE.traceBg,
    borderLeftWidth: 16,
    borderLeftColor: 'transparent',
    borderTopRightRadius: 8,
    opacity: 0.75,
  },
  ticketEyelet: {
    position: 'absolute',
    // EXPLICIT, not top:'50%'. The card is a fixed 68 now (borders take 4),
    // and the percentage was resolving off-centre on device: "the black dots
    // on each card should be centered vertically" (chat 11).
    top: 26,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TICKET.eyeletHole,
    borderWidth: 3,
    borderColor: TICKET.eyelet,
  },
  /** Every badge is a small enamelled plate now, not a flat accent pill. */
  rusticChip: { borderWidth: 1 },
  card: {
    minWidth: 0,
    flexShrink: 1,
    // Edge, stock and rounding are TagCardBack's now (chat 11); horizontal
    // padding is set inline per taper side.
    // Item 2: same type scale, tighter box (web: py-2 -> py-1.5).
    paddingVertical: 6,
    // EVEN CARDS (chat 11): one fixed height for every stop card, content
    // centred. 72, was 68: the three-line trace card (title + status + bar)
    // measures 71, so at 68 the bar sat on the inner rule ("this progress bar
    // is too close to the bottom"). Two-line cards centre in the same box,
    // which is what makes the column read as a rank of identical tags.
    // The stop-5 overflow was never height: the trace title row wrapped
    // under three plates. With the kind chip on the status row, 72 seats
    // everything.
    height: 72,
    justifyContent: 'center',
    position: 'relative',
    // Item 1.1: the paper's lift off the painting. Mirrors the web
    // --depth-shadow (2px 3px 6px rgba(15,23,42,0.16)) so a stop card sits on
    // the backdrop the same way on both platforms. SHADOW ONLY, no border: the
    // map lays rows out on a fixed pitch while a card's height is variable
    // (this is what grew HALT_H from 74 to 96 on 2026-08-25), so the paper must
    // not add a single pixel to a card that can already overflow its row.
    // Deeper than web's --depth-shadow on purpose (chat 11, "this also
    // feels more 3d"): the reference hangs its tags well off the painting.
    shadowColor: '#0F172A',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 7,
    elevation: 3,
  },
  // Zone-color roof bar across the current stop's card (the
  // signboard's painted roof; web: h-1.5 rounded-t accent bar).
  // Inset inside the drawn tag edge (chat 11): the bar used to BE the card's
  // top edge; the tag silhouette owns the edge now.
  signboardBar: {
    position: 'absolute',
    top: 3,
    left: 16,
    right: 16,
    height: 5,
    borderRadius: 3,
  },
  // Short platform tick hanging from every other stop's top edge.
  stopTick: {
    position: 'absolute',
    top: 0,
    left: 12,
    width: 28,
    height: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    opacity: 0.55,
  },
  // Pulsing ring hugging the current card's border (opacity animated by
  // StopGlowPulse; ring + shadow are static).
  stopGlow: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: -4,
    bottom: -4,
    borderRadius: 14,
    borderWidth: 3,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  cardProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Item 2: web parity (mt-1 -> mt-0.5).
    marginTop: 2,
  },
  // FULL-WIDTH TRACK (chat 11): the fixed 80pt bar left the right half of an
  // even-width tag empty, "spread out the wording now on the tags so it
  // doesn't look clustered to one side". The count label rides the far end.
  cardProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  cardProgressFill: { height: 6, borderRadius: 3 },
  cardProgressLabel: { fontFamily: AppFonts.bold, fontSize: 10 },
  cardTitleSpacer: { flex: 1 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Item 2: lineHeight trims the line box, not the type scale; flexShrink 0
  // keeps "Stop 11 of 11" on one line down to 320px (chips wrap instead).
  cardTitle: { fontFamily: AppFonts.semibold, fontSize: 14, lineHeight: 18, flexShrink: 0 },
  allAccessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  allAccessChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8 },
  expressStamp: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    transform: [{ rotate: '-6deg' }],
  },
  expressStampText: { fontFamily: AppFonts.extrabold, fontSize: 7, letterSpacing: 1.5 },
  teaserChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  teaserChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: BADGE.ink },
  traceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  traceChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: BADGE.ink },
  cardStatus: { fontFamily: AppFonts.semibold, fontSize: 11, lineHeight: 14, marginTop: 1 },
  terminusOuter: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  terminusInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  terminusLabelWrap: { position: 'absolute', height: 40, justifyContent: 'center' },
  terminusLabel: { fontFamily: AppFonts.bold, fontSize: 12 },
  footerHint: {
    fontFamily: AppFonts.semibold,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    position: 'relative',
  },
  dialogTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 28 },
  dialogDiamond: {
    width: 12,
    height: 12,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  dialogTitle: { fontFamily: AppFonts.extrabold, fontSize: 18, paddingRight: 28 },
  dialogBody: { fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 19, marginTop: 8 },
  dialogCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  dialogCtaText: { fontFamily: AppFonts.extrabold, fontSize: 14 },
  dialogSecondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 12,
    marginTop: 10,
  },
  dialogSecondaryCtaText: { fontFamily: AppFonts.bold, fontSize: 14 },
  dialogSecondaryCtaCol: { flexDirection: 'column', gap: 2 },
  dialogSecondarySubText: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    textAlign: 'center',
  },
  dialogFootnote: {
    fontFamily: AppFonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  dialogClose: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
