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
import { useIsWideScreen } from '@/lib/contentWidth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StopDots } from '@/components/journey/StopDots';
import { ZoneFilm } from '@/components/journey/ZoneFilm';
// Aliased: react-native-svg exports a LinearGradient too, and the tag
// backs use that one.
import { LinearGradient as FadeGradient } from 'expo-linear-gradient';
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
} from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  scrollTo as scrollToOnUi,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
  runOnJS,
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
import { Landmark } from '@/components/journey/Landmark';
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
  emergencyStopIndex,
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
import { planZoneRows } from '@/lib/journeyRows';
import { CarvedBoard } from '@/components/journey/CarvedBoard';
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
import { currentStopSplashZone, playStopSplash } from '@/lib/stopSplash';
import { RAIL, RAIL_GLOW_PASSES, RAIL_STROKE } from '@/lib/railPalette';
import { railPairPaths } from '@/lib/railOffset';
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
  wideBackdrop,
  WIDE_BACKDROP_ASPECT_H,
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
  SCENERY_HALF_W,
  SCENERY_MAX_H,
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
// ON AN IPAD THE MAP IS 560, AS ON WEB FROM 768px (MAP_MAX_W_LG). The owner
// chose it on 2026-08-30 (build 25) over keeping the phone's 390 on the wide
// bazaar, from side-by-side captures of both. Phones are never wide, so they
// keep MAP_MAX_W.
const MAP_MAX_W_WIDE = 560;
// Task 1082 item 2: web parity. The station card was slimmed (tighter padding
// and line spacing, and no "Bolo is waiting here" fragment, which used to wrap
// the current stop's status onto a second line), so the slot holding it comes
// down with it. Chacha-ji's stall now sits in the station's own row, to the
// LEFT of the marker, so a card growing a second line no longer reaches it.
// 176 FROM BUILD 17, WAS 88. Owner: "Cards are too tight, lets double each
// zones background so we can space everything out better", and "make the
// winding tracks less tight". One number does both: every row, halt and
// scenery position hangs off the pitch, so each zone's painted band doubles
// with it, and the serpentine keeps its x swing over twice the y, which
// halves the slope of every bend.
/** How tall the dissolve at each end of a zone band is. Deep enough to hide a
 *  cut between two different paintings, short enough that neither picture is
 *  meaningfully eaten by it. */
const ZONE_FADE_H = 72;
const STATION_H = 176; // vertical rhythm per station row
// THE OPENING SHOT'S PACE (build 17): one animated hop of about a row every
// beat, so the stops go by one at a time rather than in a blur. Capped so a
// far stop takes bigger hops on the same beat rather than more of them.
const INTRO_HOP_PX = STATION_H;
const INTRO_HOP_MS = 520;
const INTRO_HOPS_MAX = 10;
/** The trace card's height (build 22, the owner's crop): a wide ticket with
 *  a head row, the words beside a small chalkboard, a rule and a foot row.
 *  The row pitch is 176 and the tip box hangs under the card, so this plus
 *  the tip has to stay inside the slot. It replaced the build 17 slate, a
 *  150 by 150 chalkboard that was the whole card. */
const TRACE_CARD_H = 148; // 116 clipped the foot row on the simulator
// A CHALK FACE WITHOUT A BUNDLED FONT. iOS ships Chalkduster; Android has no
// chalk face, so it gets its casual hand ("casual" is a generic family every
// Android carries). Nothing new in the binary, nothing to license.
const CHALK_FONT = Platform.select({ ios: 'Chalkduster', default: 'casual' }) as string;
const CARD_PROGRESS_W = 80; // mastered-progress track width (web: w-20)
// 200 FROM BUILD 17, AND IT NO LONGER MATCHES WEB'S 184. It was 152 until the
// carved board shipped, which is why the panel rendered EMPTY through 511 and
// 512: the pediment takes width * 142/760 of the board, about 67pt at a 358pt
// column, and 152 left 85 for the panel. With overflow hidden, "not enough
// room" looks exactly like "nothing there".
//
// 184 WAS NEVER ENOUGH EITHER. Measured on device in build 17 with an onLayout
// on the panel: 117 of panel, 86 of body once the art's insets are taken, and
// 112 of content on a teaser board (line, city, stops, Free taste, and the
// 42pt DID YOU KNOW box). The fact's last line had sat under the frame since
// the box was added: "did you know section is falling off zone card". The
// board is exactly PC_H tall and clips, so the crop was silent, and two
// handoffs read it off screenshots as the panel overrunning its slot.
//
// The budget is asserted by ZONE_BOARD_MIN_PANEL_H in journey-board-budget
// .test.ts, which mirrors this number on purpose; move both together. Web's
// board has its own fonts and its own budget, and matching it by number was a
// convention that hid this for a week.
// 256 FROM THE ZONE-CARD RESTYLE (build 17, owner's mockup): the panel is a
// card now, with a line pill, a 22pt city, a rule and a boxed fact, and the
// budget was measured again with an onLayout before this number was set.
const PC_H = 256; // vertical rhythm per fare-zone postcard (pediment + card)

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

// Rail comet tuning, mirroring the web source of truth (RAIL_PULSE in
// lib/motion.tsx plus the --rail-pulse-* custom properties in index.css):
// 10 bezier samples per segment, r=4 dots, one 3.4s traversal of the run.
const RAIL_PULSE = {
  dotsPerSegment: 10,
  dotRadius: 4,
} as const;
const RAIL_PULSE_CYCLE_MS = 3400;

// Slack around a scenery object's own declared extents when it is given its
// own Svg canvas (build 26). Small on purpose: the canvas IS the cost on
// Android, so the padding only has to absorb a stroke's half width and the
// ground shadow, not guess at the art.
const SCENERY_SVG_PAD = 4;
/** Room under the ground line for the shadow the assets pool beneath them. */
const SCENERY_SVG_BELOW = 10;

// 2.5D depth pass tuning (web Task 985, DEPTH_2_5D in lib/motion.tsx): the
// scenery layer's scroll parallax factor and the rail-bed underlay offset.
const DEPTH_2_5D = {
  parallaxFactor: 0.03,
  railBedDy: 2.5,
  railBedOpacity: 0.18,
} as const;

const RAIL_PULSE_HALO_R = RAIL_PULSE.dotRadius + 3;

/** One comet dot: opacity follows the web keyframes (invisible at 0%, sharp
 *  attack to full strength at 4%, slow decay back to zero through 22%),
 *  phase-shifted by the dot's order along the run so one bright head with a
 *  fading tail travels from the current stop toward the next station. The
 *  larger soft circle underneath stands in for the web's currentColor
 *  drop-shadow glow (rn-svg has no CSS filters).
 *
 *  A PLAIN VIEW, NOT AN ANIMATED <G> INSIDE THE RAIL SVG, and that swap is
 *  the whole of build 26's Android fix. react-native-svg rasterises every
 *  <Svg> root into a full-size ARGB_8888 bitmap (SvgView.drawOutput), and a
 *  <G> at any opacity other than exactly 1 allocates ANOTHER bitmap the size
 *  of the PARENT CANVAS rather than of the group (GroupView.saveLayer). The
 *  rail Svg is zone-tall, 1072x6562px on a Galaxy A17, so each of these dots
 *  was recycling and reallocating 28MB every frame, the invisible ones
 *  included, because opacity 0 is not 1. Measured on the owner's A17: the
 *  journey held 1.65GB of GPU memory and Android's lmkd killed the app while
 *  it was the foreground process, twice, about forty seconds in. A View's
 *  opacity is a RenderNode alpha and allocates nothing, and a circle is a
 *  borderRadius. */
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
  // R2 (32.1): ONE animated node per dot. The halo keeps a static 0.35 and
  // rides the shared parent opacity rather than carrying a second worklet.
  const dotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      (progress.value - delayFrac + 1) % 1,
      [0, 0.04, 0.22, 1],
      [0, 1, 0, 0],
    ),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - RAIL_PULSE_HALO_R,
          top: y - RAIL_PULSE_HALO_R,
          width: RAIL_PULSE_HALO_R * 2,
          height: RAIL_PULSE_HALO_R * 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        dotStyle,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          width: RAIL_PULSE_HALO_R * 2,
          height: RAIL_PULSE_HALO_R * 2,
          borderRadius: RAIL_PULSE_HALO_R,
          backgroundColor: color,
          opacity: 0.35,
        }}
      />
      <View
        testID="rail-pulse-dot"
        style={{
          width: RAIL_PULSE.dotRadius * 2,
          height: RAIL_PULSE.dotRadius * 2,
          borderRadius: RAIL_PULSE.dotRadius,
          backgroundColor: color,
        }}
      />
    </Animated.View>
  );
}

/** Comet sweep on the active run (web tasks #917/#973 port): dots sampled on
 *  the same cubic beziers the rail draws, delay fraction growing with sample
 *  order from the current stop toward the next station. One shared clock per
 *  slice keeps that slice's dots in phase; slices start their clocks on
 *  the same mount pass, so the sweep stays continuous across postcard seams.
 *  Callers gate on reduced motion (the dot list is empty).
 *
 *  AN OVERLAY SIBLING OF THE RAIL SVG, not its child, since build 26. It is
 *  laid over the Svg at the same origin, so the dots still sit above the
 *  rail strokes and below the stop cards. `top` and `width` mirror the Svg's
 *  own absolute position, and `start` is that slice's viewBox origin, so a
 *  dot's map y becomes y - start inside this box. */
function RailPulseDots({
  dots,
  start,
  end,
  color,
  top,
  width,
}: {
  dots: { x: number; y: number }[];
  start: number;
  end: number;
  color: string;
  top: number;
  width: number;
}) {
  const progress = useLoopProgress(RAIL_PULSE_CYCLE_MS, true);
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top, width, height: end - start }}
    >
      {dots.map((d, i) =>
        d.y >= start && d.y < end ? (
          <RailPulseDot
            key={i}
            x={d.x}
            y={d.y - start}
            delayFrac={i / dots.length}
            color={color}
            progress={progress}
          />
        ) : null,
      )}
    </View>
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
  filmTile,
  start,
  end,
  layerTop,
  windowW,
  windowH,
  mapW,
  scrollY,
  contentTop,
  extraTop,
  mode = 'block',
  wide = false,
}: {
  zi: number;
  /** Which tile of THIS band should be alive, or null for none. */
  filmTile: number | null;
  /** An iPad: one wide bazaar for every zone instead of the six paintings. */
  wide?: boolean;
  start: number;
  end: number;
  layerTop: number;
  windowW: number;
  windowH: number;
  mapW: number;
  scrollY: SharedValue<number>;
  contentTop: number;
  /** How much further up the band must reach to sit behind the floating
   *  header. Without it the header would have a gap of page colour behind
   *  it instead of painting. */
  extraTop: number;
  /** 'block': the zone block's wall, the box counter-scrolls. 'cap': the same
   *  wall's top rows INSIDE the sticky board child, so scrolling cards pass
   *  BEHIND the board instead of gliding visibly through its transparent
   *  margins; here the box is fixed and the tiles counter-scroll within. */
  mode?: 'block' | 'cap';
}) {
  // THE WHOLE ZONE, STILL (build 17). The band was one viewport tall and
  // counter-scrolled to stay under the viewport while the zone's cards went
  // by; with the pitch doubled a zone is 2200 against a 1200 band, so that
  // counter-scroll ran for most of the zone and read as the painting sliding
  // against the cards: "it feels like the background is moving when it
  // shouldn't." The band covers the zone now and never moves; the tiles were
  // cut to repeat, and they do.
  const bandH = end - start + extraTop + 2;
  // THE BAND MAY NOT REACH UP INTO THE ZONE ABOVE IT. `extraTop` exists so the
  // FIRST zone's art runs behind the floating header and the scroll content's
  // own paddingTop instead of leaving page colour there. For every LATER zone
  // that space is not empty: it holds the previous zone's LAST STOP ROW, and
  // this band is opaque (a foot-tone fill under opaque tiles) and its block is
  // a later sibling at the same zIndex, so it painted straight over that stop.
  //
  // Reported at the end of chat 11 as two things and it was one: "I can't see
  // stop 11", and "zone 2's card has a full background box around it, its not
  // floating itself". The box was this band's top edge, 62pt above the board.
  // The canvas geometry was never wrong: a device probe measured 18pt of
  // clearance between zone 0's last card and zone 1's board, and a spacer
  // onLayout probe in chat 12 put the canvas-to-content mapping at delta 0 on
  // all six zones. It was never a layout overlap. It was a paint layer.
  const reachUp = zi === 0 ? extraTop : 0;
  // No pin any more: nothing here reads scrollY. The props stay so the
  // callers and the cap-mode signature are untouched.
  void scrollY;
  void contentTop;
  void windowH;
  const art = wide ? wideBackdrop(zi) : zoneBackdrop(zi);
  const tileH = wide ? Math.round(windowW * WIDE_BACKDROP_ASPECT_H) : windowW / ZONE_TILE_ASPECT;
  if (!art) return null;
  const tiles = (
    <>
      {Array.from({ length: Math.max(1, Math.ceil(bandH / tileH)) }).map(
        (_, ti) => (
          filmTile === ti && !wide ? (
            // THE LIVING TILE. Only ever one, only while the map is still, and
            // only on a phone: the films are 9:16 and the iPad's paintings are
            // 16:9. The still underneath is this film's own first frame, so the
            // cross-fade starts from an identical picture.
            <View
              key={ti}
              style={{ position: 'absolute', top: ti * tileH, width: windowW, height: tileH }}
            >
              <ZoneFilm zoneIndex={zi} width={windowW} height={tileH} active />
            </View>
          ) : (
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
          )
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
      {/* THE CROSS-FADE BETWEEN ZONES (build 29, the owner: "make sure to cross
          fade between zones").
          Every zone now has its OWN painting, so where one band ends and the
          next begins there is a cut between two different pictures. Inside a
          band the repeat is already invisible, because each image is
          wrap-blended so its top is a haze of its own bottom. Between bands
          nothing was doing that job.
          Each band therefore opens and closes on its own ground tone: a short
          gradient at the top fading OUT of that colour, and one at the foot
          fading INTO it. Two neighbours meeting both land on their ground
          tones, which come from the same palette, so the join dissolves
          instead of cutting. Drawn ABOVE the scrim so the scrim cannot lift the
          fade's far end back to full strength.
          A gradient rather than a real alpha mask on purpose: masking an Image
          needs @react-native-masked-view, and a whole native dependency for a
          64pt band is a bad trade in an app that has been bitten by native
          additions before. */}
      {/* THE TOP FADE USES THE ZONE ABOVE'S TONE, not this zone's. Fading a
          band out of its OWN colour leaves a step at the join: zone 5 ends on a
          pale dusk tone and zone 6 begins on a night one, so the two fades meet
          as two different colours and the cut survives. Opening on the PREVIOUS
          zone's tone means the band literally emerges from its neighbour. It
          matters most at 5 into 6, the only dusk-to-night jump in the set. */}
      <FadeGradient
        pointerEvents="none"
        colors={[zoneFootTone(Math.max(0, zi - 1)), 'transparent']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: ZONE_FADE_H }}
      />
      <FadeGradient
        pointerEvents="none"
        colors={['transparent', zoneFootTone(zi)]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: ZONE_FADE_H }}
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
          // +extraTop, because the board child grew by the safe-area inset
          // when it took over the top of the screen. Without it the cap was
          // shorter than its own box and the uncovered strip let a stop card
          // from further down the block show through above the pediment.
          height: PC_H + ZONE_BOARD_GAP + extraTop + 2,
          backgroundColor: zoneFootTone(zi),
          overflow: 'hidden',
        }}
      >
        <View style={{ position: 'absolute', left: 0, top: 0, width: windowW, height: bandH }}>
          {tiles}
        </View>
      </View>
    );
  }
  return (
    <View
      testID={`journey-backdrop-${zi}`}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -(windowW - mapW) / 2,
        top: layerTop - reachUp,
        width: windowW,
        height: bandH,
        backgroundColor: zoneFootTone(zi),
        overflow: 'hidden',
      }}
    >
      {tiles}
    </View>
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
/**
 * THE STOP CARDS WEAR THE ZONE CARD'S COLOURS (build 22, owner, on seeing
 * the modern zone card: "i need the stop cards to match the same color of
 * the new zone cards"). Ivory stock, a lavender edge and rule, the zone's
 * violet on the current stop's edge and a soft green on a finished one, in
 * place of the home ticket's cream-and-brown TICKET stock. The ink stays
 * TICKET's, which is the same brown the zone card writes its city in.
 */
const STOP_CARD = {
  stockTop: '#FFFDF9',
  stockBottom: '#F7F3EC',
  stockAheadTop: '#F1EEE9',
  stockAheadBottom: '#E8E4DE',
  edge: '#CFC8F0',
  edgeAhead: '#DAD6E4',
  edgeDone: '#8FCBA4',
  rule: '#E6E1F6',
  ruleAhead: '#E3DFDA',
  ruleDone: '#C4E6CF',
  eyelet: '#4B3F8F',
  eyeletHole: '#A79ED6',
} as const;

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
      ? [STOP_CARD.stockAheadTop, STOP_CARD.stockAheadBottom]
      : [STOP_CARD.stockTop, STOP_CARD.stockBottom];
  const edge =
    variant === 'done'
      ? STOP_CARD.edgeDone
      : variant === 'current'
        ? accent
        : variant === 'ahead'
          ? STOP_CARD.edgeAhead
          : STOP_CARD.edge;
  const rule =
    variant === 'done' ? STOP_CARD.ruleDone : variant === 'ahead' ? STOP_CARD.ruleAhead : STOP_CARD.rule;
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
  // The corner ornament lives on the far top corner. (The trace sheet's
  // dog-ear went with the notched ticket, build 22.)
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
      ) : variant === 'trace' ? (
        /* A TICKET, NOTCHED (build 22, the owner's trace card crop): a
           semicircle bitten out of each side at mid-height, the way a
           tear-off ticket is die-cut. The arcs sweep INTO the card. */
        <Path
          d={`M ${L + r} ${Tp} L ${R - r} ${Tp} Q ${R} ${Tp} ${R} ${Tp + r} L ${R} ${mid - 7} A 7 7 0 0 0 ${R} ${mid + 7} L ${R} ${B - r} Q ${R} ${B} ${R - r} ${B} L ${L + r} ${B} Q ${L} ${B} ${L} ${B - r} L ${L} ${mid + 7} A 7 7 0 0 1 ${L} ${mid - 7} L ${L} ${Tp + r} Q ${L} ${Tp} ${L + r} ${Tp} Z`}
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
      {variant === 'trace' ? null : pointed ? (
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
      {variant === 'done' && <Path d={ornD} fill={accent} opacity={0.75} />}
      {/* The eyelet at the tip, ring and hole, exactly the old View pair. */}
      <Circle cx={eyeX} cy={mid} r={6} fill={STOP_CARD.eyelet} />
      <Circle cx={eyeX} cy={mid} r={2.6} fill={STOP_CARD.eyeletHole} />
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
/** How much scrolling it takes a card to settle, in points. 160, was 240:
 *  the row pitch doubled in build 17 and a card spent twice as long half
 *  faded in the lower third of the screen. */
const SLIDE_TRAVEL = 160;
/** How far up the viewport a card is fully home. 1.0 means the slide runs
 *  while the card is still below the bottom edge and it is home as it
 *  clears it; 0.82 left cards visibly unsettled on the first screen. */
const SLIDE_LEAD = 1.0;
/** THE FLOOR IS NOT A FADE-FROM-NOTHING. At 0.4 a chalkboard slate read as
 *  glass with the painting through it (build 17). A card is always at least
 *  three-quarters there; the slide is the entrance, the alpha only softens it. */
const SLIDE_MIN_OPACITY = 0.75;

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
      opacity: SLIDE_MIN_OPACITY + (1 - SLIDE_MIN_OPACITY) * p,
      transform: [{ translateX: (1 - p) * SLIDE_DX * (side === 'right' ? 1 : -1) }],
    };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * ONE ZONE BOARD, PINNED BY HAND.
 *
 * React Native's own stickyHeaderIndices could not be used: it wraps a sticky
 * child in its own container, and THAT container is the sibling z-order
 * applies to, so stop cards scrolled straight over the board and neither
 * zIndex nor elevation on the board could stop it. Both were tried on a
 * device.
 *
 * Drawing the board in an overlay above the ScrollView fixed the z-order and
 * broke something else: an overlay that only ever shows the CURRENT zone means
 * the board never appears IN the journey, so scrolling into a new zone left a
 * blank gap where the card should have arrived. "The zone card is missing from
 * the actual journey and only mounted on top."
 *
 * So the pinning is done here instead, which is the honest version of sticky:
 *  - while the board's own place is below the pin line, it TRACKS it, so it
 *    scrolls up the page like any other card and the learner watches it arrive
 *  - once it reaches the pin line it STOPS there
 *  - and when the next zone's board comes up behind it, that one PUSHES it off
 *    rather than crossfading, which is what makes the boundary read as travel
 *
 * All of it is one transform off the shared scroll value, on the UI thread.
 */
function PinnedZoneBoard({
  naturalY,
  nextNaturalY,
  pinTop,
  boardH,
  scrollY,
  children,
}: {
  /** The board's own top in SCROLL CONTENT coordinates. */
  naturalY: number;
  /** The next zone's board top, or null for the last zone. */
  nextNaturalY: number | null;
  /** Where a pinned board rests: below the status bar. */
  pinTop: number;
  boardH: number;
  scrollY: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const natural = naturalY - scrollY.value;
    const pinned = Math.max(natural, pinTop);
    if (nextNaturalY == null) return { transform: [{ translateY: pinned }] };
    // The push. Never lets this board overlap the one coming up behind it.
    const pushed = nextNaturalY - scrollY.value - boardH;
    return { transform: [{ translateY: Math.min(pinned, pushed) }] };
  });
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 0, right: 0 }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** The throb's cycle. Slow enough to read as breathing, not blinking. */
const GLOW_CYCLE_MS = 2400;

/**
 * THE CURRENT STOP'S GLOW (build 22, owner: "current stop should have a
 * blue/purple glow under it throbbing to indicate current stop"). One soft
 * indigo disc or slab under the node and under the card, breathing between
 * a quarter and a half of its strength on the map's own idle loop, opacity
 * and scale only (never a layout prop). Under Reduce Motion the loop rests
 * at its first frame, so the glow is still there, just still.
 *
 * iOS draws the halo from the shadow on the same view; Android has no soft
 * shadow without a background, so there the glow is the tinted slab alone.
 */
function CurrentStopGlow({
  color,
  radius,
  inset,
  enabled,
  testID,
}: {
  color: string;
  radius: number;
  /** How far past its parent's box the glow reaches, in points. */
  inset: number;
  enabled: boolean;
  testID?: string;
}) {
  const progress = useLoopProgress(GLOW_CYCLE_MS, enabled);
  const throb = useAnimatedStyle(() => {
    const wave = 0.5 - 0.5 * Math.cos(progress.value * 2 * Math.PI);
    return {
      opacity: 0.24 + 0.3 * wave,
      transform: [{ scale: 0.96 + 0.07 * wave }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        {
          position: 'absolute',
          left: -inset,
          right: -inset,
          top: -inset,
          bottom: -inset,
          borderRadius: radius,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
        },
        throb,
      ]}
    />
  );
}

function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
  background,
  border,
  goldPalette,
  glow,
  reduceMotion = false,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  background: string;
  border: string;
  goldPalette?: { chassis: string; body: string; trim: string; steam: string };
  /** The glow's colour under the current node (the app's indigo). */
  glow?: string;
  reduceMotion?: boolean;
}) {
  if (isCurrent) {
    // THE TRAIN ON THE TRACK (build 22, owner's journey notes: "the new
    // train should be on the track"). A round white node the width of the
    // marker box, the accent ring round it and a soft outer ring beyond, the
    // painted engine filling it: it was a 40 by 28 pill with a 32pt engine,
    // which the wider rail now runs straight through. Web: box-shadow rings.
    return (
      <View style={[styles.markerCurrentOuter, { backgroundColor: `${color}33` }]}>
        {glow ? (
          <CurrentStopGlow color={glow} radius={48} inset={16} enabled={!reduceMotion} testID="current-stop-glow-node" />
        ) : null}
        <View style={[styles.markerCurrentRing, { backgroundColor: color }]}>
          <View style={styles.markerCurrentPill}>
            <TrainEngine tint={color} width={40} height={28} motion="bob" palette={goldPalette} />
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
  // A NUMBERED BADGE, FROM BUILD 17 (owner's hybrid journey mockup): a
  // parchment disc with a gold ring and the stop's number, a green check on
  // a finished stop. It replaces the cut-art medallions, whose chrome had
  // been stripped three times over ("medallions shouldn't be opaque"); this
  // is not chrome around art, it is the marker itself, and the mockup draws
  // every stop this way. The number is what the card beside it counts in.
  // A stop ahead is said in INK, never in alpha: the test below still holds
  // that the marker carries no opacity of its own.
  return (
    <View
      testID={`station-medallion-${kind}`}
      style={[
        styles.stopBadge,
        { borderColor: BADGE.brassEdge, backgroundColor: TICKET.stockTop },
      ]}
    >
      <Text style={[styles.stopBadgeNumber, { color: accessible ? ZONE_BOARD.ink : TICKET.inkAhead }]}>
        {station.stopNumber}
      </Text>
      {done && (
        <View testID="stop-badge-done" style={styles.stopBadgeCheck}>
          <Feather name="check" size={9} color="#ffffff" />
        </View>
      )}
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
  // THE WINDOW, NOT THE COLUMN (build 25): this screen opts out of Screen's
  // column and paints edge to edge, as web does from 768px. The map column
  // centres itself (the zone blocks are mapW wide, alignSelf center) and the
  // backdrop tiles span the whole window behind it.
  const { width: windowW, height: windowH } = useWindowDimensions();
  const wide = useIsWideScreen();
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
  // ONE SHARED VALUE OUT OF THE SCROLL, AND NOTHING ELSE. Every scroll-linked
  // thing on this screen (the scenery parallax, the sliding cards, the pinned
  // zone boards) reads `scrollY` in its own worklet. There used to be a
  // `runOnJS` hop here as well, per frame, feeding an activeZone state with no
  // readers; see where the zoneTops memo used to live.
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
  const mapW = Math.min(wide ? MAP_MAX_W_WIDE : MAP_MAX_W, windowW);
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
  // CAPPED ON A TABLET (build 29). `mapW - 140` is the widest that fits both
  // flanks inside the map margins, and on a phone that is 250, which is right.
  // On an iPad the map grows to 560 and the same rule gives 420: a 420pt band
  // holding "Stop 6 of 11" over "Locked . 10 phrases", which reads as a poster
  // rather than a card. 320 keeps roughly the phone's card-to-map proportion
  // (250 of 390 is 0.64; 320 of 560 is 0.57) and leaves the two short lines
  // looking like a label again. Phones are untouched: 390 - 140 is already
  // below the cap.
  const cardW = Math.min(mapW - 140, 320);

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
    // THE ROW PLAN, SHARED WITH THE HOME HERO. planZoneRows replays both
    // splices in order and is the only thing that decides where the tracing and
    // story rows land, so the map and the boarding pass cannot disagree about
    // which stop a learner is on. They did: home said "Stop 3 of 9" for a stop
    // this map called "Stop 5 of 11" (owner, 2026-08-27).
    const rowPlan = planZoneRows({
      lang: activeLang,
      zoneIndex: i,
      gradedCount: stations.length,
    });
    const trace = rowPlan.trace;
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
    //
    // NEVER IN THE SHOWROOM (build 17). A locked language's listing carries the
    // access envelope and NO planLocked on its stations (the server forces them
    // locked with the field unset), so "every stop is plan-visible" read TRUE
    // for exactly the learner the taste exists for, and the tracing and story
    // rows drew as owned rather than as tastes. Owner: "free taste badges
    // should be on stops 2 and 3 zone 1 of all languages except Hindi for Free
    // learners." Hindi is not a showroom, so it keeps its no-chip reading.
    const zoneIncluded =
      !showroom &&
      stations.length > 0 &&
      stations.every((st) => st.planLocked !== true);
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
    // IN EVERY ZONE OF THE SHOWROOM SINCE 2026-08-30 (build 23; zone 1 only
    // from 2026-08-28, nothing before that), and planZoneRows carries the
    // ruling. The `planLocked` and `teaserStation` pair below marks journey 1
    // zone 1 as a taste rather than a lock and every later zone's rows as
    // All-Access, which is what a locked language's preview now shows.
    //
    // ADDED, NEVER SUBSTITUTED, and you can only add to something: a zone with
    // no phrase stops at all gets no tracing stop either, or an unloaded zone
    // draws a lone tracing row under an empty postcard.
    // WHERE THE TRACING ROW LANDED, kept so the story stop can sit directly
    // after it. null when this zone has no tracing stop, which storyStopIndexIn
    // handles by taking the mid-zone break the tracing stop would have had.
    const traceIdx: number | null = rowPlan.traceIndex;
    if (trace && traceIdx !== null) {
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
    // learner is on. Added, never substituted, and in every zone, showroom
    // included: see planZoneRows.
    const storyBook = rowPlan.storyBook;
    if (storyBook && rowPlan.storyIndex !== null) {
      withTrace.splice(rowPlan.storyIndex, 0, {
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

  /**
   * THE ZONE BOARD, DRAWN ONCE, ABOVE EVERYTHING.
   *
   * It used to be a sticky header inside the ScrollView, and that could not be
   * made to work: React Native wraps a sticky child in its own
   * ScrollViewStickyHeader, and THAT wrapper is the sibling the z-order
   * applies to, so no amount of zIndex or elevation on the board itself stopped
   * a stop card scrolling up through it. Both were tried on a device.
   *
   * As an overlay outside the scroll view the question does not arise: it is a
   * later sibling than the ScrollView, so it is simply on top. The in-flow
   * children are spacers holding the same reserved height, so every derived y
   * (stops, scenery, signals, the intro shot, the slide-in) is untouched.
   *
   * "Can't you just make the zone card and back button float independently?"
   * Yes, and that is the shape that actually works.
   */
  const renderZoneBoard = (zi: number) => {
    const zone = zones[zi];
    const slice = slices[zi];
    if (!zone || !slice) return null;
    const { start, end } = slice;
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
    return (
          <View
            key={`zone-board-${zone.id}`}
            testID={`zone-board-overlay-${zi}`}
            style={{
              width: mapW,
              alignSelf: 'center',
              // Its own safe-area pad, because a sticky header pins to the
              // SCROLL VIEW's top edge, which is under the status bar. The
              // painted cap behind it is extended by the same amount, so
              // the art still runs to the top of the screen.
              height: PC_H + ZONE_BOARD_GAP,
              // BOTH SIBLINGS ORDERED EXPLICITLY, and elevation with it. A
              // sticky header is transformed by the ScrollView to hold its
              // place, and on iOS that was enough to let the LATER block
              // sibling paint over it: a stop card from further down the
              // zone showed above the pediment. Ordering only the board was
              // not enough; the block is pinned to 0 as well.
              zIndex: 30,
              elevation: 30,
            }}
          >
            {/* NO PAINTED BACKING. It had a full-width opaque cap so the map
                could not show through its transparent margins while pinned,
                and that is exactly what made it read as a header: "the whole
                top is a box instead of a floating zone card and button." The
                carved board is a card lying on the map now, and the live map
                shows around it. */}
              <View style={[styles.postcardWrap, { top: 10 }]}>
                {/* THE CARVED STATION BOARD, cut into three so only the
                    panel stretches. See ZONE_BOARD in lib/zoneBackdrops.ts
                    for why it is three files and why it is capped. Web twin:
                    ZonePostcard in gujarati-coach/src/pages/journey.tsx. */}
                <CarvedBoard
                  testID={`zone-board-overlay-inner-${zi}`}
                  pedimentTestID={`zone-board-top-${zi}`}
                  width={boardW}
                  height={PC_H}
                  nameplate={zone.title.toUpperCase()}
                  plate={`ZONE ${zi + 1}`}
                  opacity={grayed ? 0.8 : 1}
                  // The card below REPLACES the parchment panel (owner, build
                  // 17: "no i don't want to keep that old box underneath").
                  bare
                  // THE MODERN CAP (build 22, the owner's zone card crop):
                  // the carved wood pediment gives way to an ivory cap with a
                  // violet plate; the geometry is untouched.
                  variant="modern"
                >
                    {/* address side */}
                    <View style={styles.postcardAddress}>
                      {/* THE MODERN PANEL ON THE CARVED BOARD (build 17, owner:
                          "this is how i want the zone cards to look"). The
                          pediment stays carved; under it the panel is a cream
                          card with the app's violet on its top edge, the line
                          as a violet pill, the city big, a gold dashed rule
                          with a diamond, and the fact in its own box with a
                          gold spark. The hybrid, on the board itself. */}
                      <View
                        style={styles.boardCard}
                      >
                        {/* THE CITY'S LANDMARK BEHIND THE WORDS, at a whisper
                            (build 22, the owner's zone card crop), the same
                            silhouette the home pass seeps through its paper. */}
                        <View pointerEvents="none" style={styles.boardLandmark}>
                          <Landmark city={zone.geoName} width={180} height={108} ink="#3B2A1E" paper="#FFF8EE" opacity={0.1} />
                        </View>
                        {/* BOLO ON THE CARD (build 22, owner: "i like this new
                            zone card style and bolo being on it"): the bird
                            stands on the card's right, her feet on the fact
                            box, the words keeping clear of her. The pose is
                            the wave, the one nothing crosses. */}
                        {/* WHOLLY INSIDE THE CARD (owner, on the first cut:
                            "bolo needs more space on the zone card, he's
                            getting cut off"): the card clips, so the bird
                            starts at its top edge rather than above it, and
                            her feet rest on the fact box. */}
                        {!grayed ? (
                          <View pointerEvents="none" style={styles.boardBolo}>
                            <Mascot pose="wave" size={92} motion="none" entering={false} />
                          </View>
                        ) : null}
                        <View style={styles.boardCardBody}>
                          <View style={styles.boardLineRow}>
                            <View style={[styles.boardLinePill, { backgroundColor: grayed ? GRAY : colors.primary }]}>
                              <MaterialCommunityIcons name="train" size={12} color="#ffffff" />
                              <Text numberOfLines={1} style={styles.boardLinePillText}>
                                {line.lineName.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.boardCity, styles.boardClearOfBolo]}>
                            {zone.geoName}
                          </Text>
                          <Text style={[styles.boardStops, styles.boardClearOfBolo]}>
                            {zone.rowStations.length} {zone.rowStations.length === 1 ? 'stop' : 'stops'} in this zone
                            {access === 'teaser' && teaserProgress && (
                              <>
                                <Text>{' · '}</Text>
                                <Text style={{ color: colors.primary, fontFamily: AppFonts.bold }}>
                                  Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                                </Text>
                              </>
                            )}
                          </Text>
                          {/* The gold dashed rule went with the crop (build
                              22): the landmark and the bird carry the
                              rustic note now, and the fact box sits closer. */}
                          <View style={styles.boardGap} />
                          {/* THE DAILY FACT, web parity (chat 11), same factForZone
                              arithmetic so both platforms show the same fact for
                              the same zone on the same day. Static rather than
                              rotating: per-frame motion is not trusted on this
                              app's release builds. */}
                          {!zoneGateLocked && (
                            <View
                              testID={`board-fact-${zi}`}
                              style={[styles.boardFact, { borderColor: `${grayed ? GRAY : colors.primary}33` }]}
                            >
                              {/* A bulb in a lavender disc, white box (build 22,
                                  the crop), where a gold spark on cream stood. */}
                              <View style={[styles.boardFactSpark, { backgroundColor: `${grayed ? GRAY : colors.primary}14`, borderColor: `${grayed ? GRAY : colors.primary}33` }]}>
                                <MaterialCommunityIcons name="lightbulb-outline" size={20} color={grayed ? GRAY : colors.primary} />
                              </View>
                              <View style={styles.boardFactCopy}>
                                <Text style={[styles.boardFactLabel, { color: grayed ? GRAY : colors.primary }]}>
                                  DID YOU KNOW?
                                </Text>
                                <Text numberOfLines={3} style={styles.boardFactText}>
                                  {factForZone({
                                    zoneIndex: zi,
                                    geoName: zone.geoName,
                                    lineName: line.lineName,
                                  })}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Zone test-out affordance (web parity:
                              link-zone-test-out-{i}), present only when the
                              zone is gate-locked, in the fact's place. IT
                              LIVES INSIDE THE CARD from build 17: it was a
                              sibling after the panel, and once the card
                              replaced the parchment it landed on the painting
                              ("this fell off the zone card"). A violet button
                              now, the card's one action. */}
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
                              style={[styles.boardTestOut, { backgroundColor: grayed ? GRAY : colors.primary }]}
                            >
                              <Text style={styles.boardTestOutText}>Test out of this zone</Text>
                              <Feather name="arrow-right" size={14} color="#ffffff" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                </CarvedBoard>
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
  };

  // Which zone's painting backs the header. The learner's current zone, so the
  // header matches whatever the map opens on; zone 1 before there is one.
  /**
   * WHERE THE FIRST BOARD RESTS, and the fix for a defect the owner hit on
   * 2026-08-28: "i can scroll up and down but i can't see the top of card 1
   * zone 1", then "stop card 1 is stuck under the zone card. zone card isn't
   * at the top where it should be."
   *
   * A zone board is drawn as an overlay that PINS at headerTopInset, so at
   * scroll 0 it sits there whatever the flow says. The flow used to put its
   * slot at SCROLL_CONTENT_TOP, 41 points higher, and the canvas laid the
   * first card out from that slot. The board therefore rested 41 lower than
   * its own slot and its foot covered the first card's top. The header was
   * never the problem; 5391875e read it as the header and reserved the whole
   * header's height (104), which pushed the board 73 BELOW its pin at rest
   * and, because only the canvas was moved and not the flow, onto the card.
   *
   * IT IS SPENT IN THREE PLACES THAT MUST AGREE. (1) The CANVAS: layoutY
   * starts at TOP_PAD plus this, so every row moves down by it. (2) The FLOW:
   * a journey-header-clearance spacer of this height sits ahead of the first
   * board child, so the block children (which draw canvas relative to their
   * own slice) and the pinned boards (which convert canvas to content with
   * SCROLL_CONTENT_TOP - TOP_PAD) agree on where the board is. (3) The ART:
   * zone 0's band reaches up by this much more, or the spacer leaves a strip
   * of Screen colour behind the status bar: "that shouldn't be there."
   *
   * The intro shot has its own half of this: see onMapLayout, where the lead
   * is floored so no current card is ever framed under the pinned board.
   */
  const pinClearance = Math.max(0, headerTopInset - SCROLL_CONTENT_TOP);


  // WHICH ZONE'S CROSSING THE LEARNER IS STANDING ON, or null. Zone-relative,
  // not journey-wide: each of the six zones has its own film, and a
  // journey-wide index would put the only Emergency inside zone 1 and leave the
  // other five unreachable.
  //
  // AGAINST THE ZONE'S OWN LENGTH (build 23). This compared the graded index
  // to EMERGENCY_AFTER_STOP directly, which in a nine-stop zone is the last
  // stop and in a seven-stop zone is nowhere: zone 3 of every language, and
  // every zone of the five languages whose zones run five stops, never fired.
  // emergencyStopIndex carries the rule now, shared with web.
  const emergencyZone = (() => {
    if (currentId == null) return null;
    for (let zi = 0; zi < zones.length; zi++) {
      const graded = zones[zi]!.stations;
      const idx = graded.findIndex((st) => st.id === currentId);
      if (idx >= 0 && idx === emergencyStopIndex(graded.length)) return zi + 1;
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
  //
  // AND NOT AT ALL WHEN THE PASS ALREADY STARTED IT (build 21): the home pass
  // plays this zone's film at the tear so home dissolves straight into the
  // scene, and this screen mounts under that film. Restarting it here would
  // remount the player mid-hold. Any other door in (a tab, a deep link) finds
  // no film up and plays its own as before.
  const arrivalPlayed = useRef(false);
  useEffect(() => {
    if (arrivalPlayed.current || !currentZone) return;
    arrivalPlayed.current = true;
    if (currentStopSplashZone() === currentZone.id) return;
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
  let layoutY = TOP_PAD + pinClearance;
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
    // The run ahead's two rails are TRUE offsets of the curve (build 22, see
    // railPairPaths), computed here once per segment rather than per frame.
    const pair = railPairPaths(a.x, a.y, p.x, p.y, RAIL_STROKE.gauge);
    return {
      d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${p.x} ${p.y - dy}, ${p.x} ${p.y}`,
      left: pair.left,
      right: pair.right,
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

  /**
   * WHICH ZONE, AND WHICH TILE OF IT, IS BEING LOOKED AT WHILE THE MAP IS STILL.
   *
   * The owner, build 29: "film starts playing if a learner lands on a zone...
   * once they stop scrolling, that video will play". So this is an IDLE signal,
   * not a scroll signal.
   *
   * THAT DISTINCTION IS THE WHOLE REASON THIS IS SAFE. A zone-owns-the-top
   * chain lived here before and was deleted in build 26 because it did a
   * runOnJS hop PER FRAME to feed a state nobody read. This fires twice per
   * gesture: null when a drag begins, and one answer when the map comes to
   * rest. Nothing runs while the finger is moving.
   *
   * The tile is computed as well as the zone, so the film can be parked where
   * the learner actually stopped rather than always at the top of the band. On
   * a phone only about 1.2 tiles fit on screen, so the one under the viewport
   * centre is the one being looked at.
   */
  const [activeFilm, setActiveFilm] = useState<{ zone: number; tile: number } | null>(null);
  const settleFilm = useCallback(
    (offsetY: number) => {
      const eye = offsetY + windowH / 2 - SCROLL_CONTENT_TOP;
      const zi = slices.findIndex((sl) => eye >= sl.start && eye < sl.end);
      if (zi < 0) {
        setActiveFilm(null);
        return;
      }
      const tileH = windowW / ZONE_TILE_ASPECT;
      const tile = Math.max(0, Math.floor((eye - slices[zi]!.start) / tileH));
      setActiveFilm((prev) =>
        prev && prev.zone === zi && prev.tile === tile ? prev : { zone: zi, tile },
      );
    },
    [slices, windowH, windowW],
  );

  // THE ZONE-OWNS-THE-TOP CHAIN LIVED HERE AND IS GONE (build 26). A
  // `zoneTops` memo fed an `onMapScrollJs` callback that compared the scroll
  // offset against the slice boundaries and pushed the answer into an
  // `activeZone` state. Nothing ever read that state: each PinnedZoneBoard
  // derives its own position from `scrollY` in its own worklet, which is what
  // replaced it. What survived was a `runOnJS` hop out of the scroll worklet
  // ON EVERY FRAME, plus a full re-render of this component at every zone
  // crossing, both to set a value with no readers.

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
  /**
   * THE TRAVEL RUNS ON THE UI THREAD (build 21). Owner, off the simulator:
   * "the autoscroll that plays on journey page load is choppy, not a smooth
   * crawl", and of web, where it is one continuous tween, "its smooth".
   *
   * Build 17's chain of platform `scrollTo({ animated: true })` hops fired
   * from a timer every INTRO_HOP_MS: iOS animates a hop over about a quarter
   * second, so each one lurched a row, settled, and sat dead for the rest of
   * its beat. Measured on the simulator at 60fps: a 150ms stop between hops.
   * That chain had itself replaced a JS requestAnimationFrame tween which
   * passed every test and did not move the map on a device ("the AutoZone
   * didn't work", twice off TestFlight), and that tween's start sentinel was
   * correct, so the verdict stands: no JS-thread frame loop.
   *
   * This is reanimated's own scrollTo, driven per frame on the UI thread by
   * withTiming: the same worklet machinery that breathes the pass on home in
   * the shipped 1.0.5 build. One continuous crawl from the top to the stop,
   * the web twin's cubic in-out (Easing.inOut(Easing.cubic) IS
   * introScrollEase), and the chain's own pace kept to the millisecond: a row
   * per INTRO_HOP_MS, capped at INTRO_HOPS_MAX rows' worth so further still
   * means faster.
   *
   * MEASURED AGAINST THREE OTHERS on the simulator the same evening, all with
   * the same 60fps recording: this one is continuous with no dead stop but
   * lands its offset coarsely there (about 12 updates a second on a dev
   * bundle); native steps every 140ms or 50ms throb at the step rate; an
   * animated contentOffset prop does not move the map at all. The recorder
   * cannot grade a native fling either, so fine cadence is a TestFlight
   * question. What is not in question: the dead stops are gone.
   *
   * THE LANDING IS A PLAIN JS scrollTo, the same call a touch uses to land
   * the shot in the shipped app, so whatever the UI-thread crawl does on a
   * given device the learner ends on their stop, never stranded at the top.
   */
  const introProgress = useSharedValue(0);
  const introTo = useSharedValue(0);
  const introLive = useSharedValue(false);
  useAnimatedReaction(
    () => introProgress.value,
    (p) => {
      if (!introLive.value) return;
      scrollToOnUi(scrollRef, 0, introTo.value * p, false);
    },
  );

  /** Stop the shot wherever it is and put the learner on their card. */
  const landIntro = useCallback(() => {
    if (introHold.current != null) {
      clearTimeout(introHold.current);
      introHold.current = null;
    }
    introLive.value = false;
    cancelAnimation(introProgress);
    const y = introTarget.current;
    if (y == null) return;
    introTarget.current = null;
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [scrollRef, introLive, introProgress]);

  // Leaving the screen mid-shot must not leave a timer or a UI-thread tween
  // behind pointing at an unmounted scroll view.
  useEffect(
    () => () => {
      if (introHold.current != null) clearTimeout(introHold.current);
      introLive.value = false;
      cancelAnimation(introProgress);
    },
    [introLive, introProgress],
  );

  const onMapLayout = (e: LayoutChangeEvent) => {
    if (autoScrolledRef.current || userScrolledRef.current) return;
    if (currentStopY == null) return;
    autoScrolledRef.current = true;
    // Comfortable framing: the stop lands about a third of the way down the
    // viewport, and NEVER UNDER THE PINNED BOARD (build 17). The board pins at
    // headerTopInset and stands TOP_PAD + PC_H tall there, so a lead shorter
    // than that plus the card's reach above its marker frames the current
    // card under the board. That was "i can't see the top of card 1 zone 1":
    // a 260 lead against a board whose foot is at 253, read as the header's
    // doing and "fixed" there twice.
    const boardFloor =
      headerTopInset + TOP_PAD + PC_H + ZONE_BOARD_GAP + STATION_H / 2;
    // layout.y is the FIRST BOARD child's CONTENT y and currentStopY is
    // CANVAS. That child sits at canvas slices[0].start, so that is what
    // converts one into the other. It used to subtract a bare TOP_PAD, which
    // was only right while nothing else was reserved ahead of the first board.
    const to = Math.max(
      0,
      e.nativeEvent.layout.y -
        (slices[0]?.start ?? TOP_PAD) +
        currentStopY -
        introScrollLead(windowH, boardFloor),
    );
    introTarget.current = to;
    // Reduced motion gets no hold and no travel, only the destination.
    if (reduceMotion || to <= 0) return void landIntro();

    introHold.current = setTimeout(() => {
      introHold.current = null;
      // introTarget stays set until the travel lands, so a touch mid-crawl
      // still lands the whole shot rather than stopping it halfway.
      //
      // A ROW PER BEAT, NOT A FIXED CAP (build 17). Owner: "autoscroll
      // happens too quickly when you join this page. slow it down so you can
      // see the stops you passed." The travel takes INTRO_HOP_MS per row of
      // map, capped at INTRO_HOPS_MAX rows' worth so a learner six zones down
      // is not kept waiting: past the cap, further means faster on the same
      // beat. Build 17 spent that time as a chain of hops; build 21 spends
      // exactly the same time as one continuous crawl (see introProgress).
      const rows = Math.min(INTRO_HOPS_MAX, Math.max(1, Math.round(to / INTRO_HOP_PX)));
      const dur = rows * INTRO_HOP_MS;
      // The same time build 17 spent as hops, spent as one crawl. See
      // introProgress above for the mechanism and what it was measured
      // against.
      introTo.value = to;
      introProgress.value = 0;
      introLive.value = true;
      introProgress.value = withTiming(
        1,
        { duration: dur, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          'worklet';
          introLive.value = false;
          // The landing, from the JS side, whether the crawl ran or not.
          if (finished) runOnJS(landIntro)();
        },
      );
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
    /**
     * HIS PHONE RINGS AT ONE STOP PER ZONE, and this is where it happens.
     *
     * The server decides, not the client: `callsNow` comes back on the
     * encounter, true at one encounter station per zone (zone 1 fixed at
     * station 3, "after stop 2 so there is enough content"), chosen by a hash
     * of the learner, the language and the zone so a revisit meets it at the
     * same stop rather than rerolling.
     *
     * IT REPLACES THE WALK INTO PRACTICE, it does not delay it. A call is an
     * INTERRUPTION by ruling: he rings, the learner takes it or ignores it, and
     * either way they come back to the map and carry on. Chaining practice on
     * behind the call would make it a gate on the lesson, which is the one
     * thing it must not be.
     *
     * The chai is already poured by this point and nothing here can take it
     * back, so a learner who lets it ring out has lost nothing.
     *
     * `callsNow` is on the generated type since build 20 put it in
     * openapi.yaml; it was read through a cast while the spec owed it.
     */
    const ringsNow = chachaDlg?.callsNow === true;
    setChachaDlg(null);
    if (ringsNow) {
      router.push('/(app)/call');
      return;
    }
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
    <Screen padTop={false} column={false}>
      {/* Boarding-pass header — full-ticket treatment */}
      <View
        testID="journey-header"
        style={[
          styles.header,
          { paddingTop: 10 + headerTopInset },
        ]}
      >
        {/* NO ART OF ITS OWN, AND THAT WAS THE SECOND WRONG ANSWER. First
            this was a white card with a border, which read as a UI bar on top
            of a painting. Then it carried a CROPPED COPY of the zone art,
            which met the map at a seam because a copy can never track the
            real thing: "still looks odd, can't we get the actual page context
            to scroll on it? so its seamless?"
            It is transparent now and the MAP ITSELF passes underneath. The
            scroll content is padded by this header's measured height so
            nothing starts hidden, and each zone's painted band is extended
            upward by the same amount so there is real art behind the header
            rather than a gap. One painting, scrolling, with the ticket lying
            on it. */}
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
        {/* THE BOARDING PASS CAME OFF THIS PAGE (2026-08-27), and the reason
            is a collision rather than a taste call. The zone board is STICKY:
            it owns the top of the viewport permanently, so anything else
            pinned there fights it, and a restyled ticket sat straight on top
            of the board's own nameplate. Two objects cannot have that space.
            The board already names the topic and the zone and now names the
            LINE as well, so the ticket was saying nothing the map was not.
            "If we add the Line name to each zone header, we don't need the
            boarding pass to show on top. just a back arrow that floats." */}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          // Clears the floating header. Measured, so a notch, a Dynamic
          // Island and web chrome all get the right number.
          { paddingTop: SCROLL_CONTENT_TOP },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onMapScroll}
        // A film plays only while the map is at rest. Both handlers are needed:
        // a flick ends in momentum, a slow drag ends without any.
        onScrollEndDrag={(e) => settleFilm(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => settleFilm(e.nativeEvent.contentOffset.y)}
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
          // A film never plays while the map is moving.
          setActiveFilm(null);
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
        {/* THE FLOW RESERVES WHAT THE CANVAS RESERVES (build 17). 5391875e
            pushed the canvas down and left the scroll content where it was.
            The block children draw canvas y relative to their own slice, so
            the cards stayed put; the pinned boards convert canvas to content
            with a constant, so every board moved down by the reservation and
            landed on its zone's first card. Owner: "stop card 1 is stuck
            under the zone card." This spacer is the flow's half: the first
            board child sits exactly pinClearance lower in the content, which
            is where naturalY already expected it, and where the board pins. */}
        <View
          testID="journey-header-clearance"
          style={{ height: pinClearance }}
        />
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
            // A SPACER, NOT THE BOARD. The board is drawn once, as an
            // overlay above the ScrollView, so it can never be painted over
            // by a stop card scrolling up through it. This holds the space
            // the canvas already reserves for it (PC_H plus the gap) so every
            // derived y stays exactly where it was.
            const boardChild = (
              <View
                key={`zone-board-${zone.id}`}
                testID={`zone-board-child-${zi}`}
                // EXACTLY THE RESERVED HEIGHT, no safe-area padding. It kept
                // the inset from when the board lived in here, so every
                // spacer was 62pt taller than the space the canvas reserves
                // and each zone drifted further down than its own geometry
                // said: the pinned board landed on the previous zone's last
                // stop. "Pin is off." The pin owns the safe area now.
                style={{
                  width: mapW,
                  alignSelf: 'center',
                  height: PC_H + ZONE_BOARD_GAP,
                }}
                onLayout={zi === 0 ? onMapLayout : undefined}
              />
            );
          const blockChild = (
            <View
              key={`zone-block-${zone.id}`}
              testID={`zone-block-child-${zi}`}
              style={{
                width: mapW,
                alignSelf: 'center',
                height: blockH,
                zIndex: 0,
                elevation: 0,
              }}
            >
            <ZoneBandFixed
              zi={zi}
              filmTile={activeFilm && activeFilm.zone === zi ? activeFilm.tile : null}
              start={start}
              end={end}
              layerTop={layerTop}
              windowW={windowW}
              wide={wide}
              windowH={windowH}
              mapW={mapW}
              scrollY={scrollY}
              contentTop={SCROLL_CONTENT_TOP}
              // THE FIRST TILE STARTS AT THE TOP OF THE SCREEN (owner, build
              // 17: "first image should start at the top"). The band's top
              // is the spacer's top less this reach; the spacer sits at
              // SCROLL_CONTENT_TOP plus the pin clearance, which is exactly
              // the inset, so the inset is the whole reach. It carried the
              // clearance on top of that for a while and the tile's first 44
              // rows sat above the screen.
              extraTop={headerTopInset}
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
              // ONE SMALL SVG PER OBJECT, NOT ONE SPANNING THE ZONE (build 26).
              //
              // This was a single <Svg> the height of the whole zone carrying
              // one to three little drawings of about thirty nodes each. On
              // Android react-native-svg rasterises every <Svg> root into a
              // full-size ARGB_8888 bitmap (SvgView.drawOutput), so that was
              // 1072x6562px, about 28MB, per zone, held for the life of the
              // screen: roughly 170MB of mostly transparent pixels across six
              // zones. Each object now gets a canvas the size of its own art,
              // about 50x54, which is four orders of magnitude less.
              //
              // IT ALSO MAKES THE GREY FADE FREE. SceneryElement wraps itself
              // in <G opacity>, and a group at any opacity other than exactly 1
              // allocates ANOTHER bitmap the size of the PARENT CANVAS rather
              // than of the group (GroupView.saveLayer). That was 28MB per
              // greyed item; against these canvases it is nothing, which is why
              // the 0.45 an unreached zone needs could stay.
              //
              // THE PATTERN IS THE STALL'S, a few hundred lines down, which has
              // drawn itself into its own 92x178 box since build 22. That was
              // done for a TOUCH reason and the same insight was never applied
              // to paint. Sizes come from the art's own declared extents so a
              // redrawn asset cannot outgrow its box quietly.
              const above = SCENERY_MAX_H + SCENERY_SVG_PAD;
              const boxH = above + SCENERY_SVG_BELOW;
              return local.map((sp) => {
                const halfW = SCENERY_HALF_W[sp.kind] + SCENERY_SVG_PAD;
                return (
                  <Svg
                    key={sp.key}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: sp.x - halfW,
                      top: layerTop + (sp.y - start) - above,
                    }}
                    width={halfW * 2}
                    height={boxH}
                    viewBox={`${sp.x - halfW} ${sp.y - above} ${halfW * 2} ${boxH}`}
                  >
                    <SceneryElement
                      kind={sp.kind}
                      x={sp.x}
                      y={sp.y}
                      accent={line.accent}
                      gray={sp.gray}
                      testID={sp.testID}
                    />
                  </Svg>
                );
              });
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
                    {/* THE RUN AHEAD IS TWO LINES, NOT A BAND (owner: "future
                        track should be only 2 purple lines, not filled"). A
                        transparent centre stroke hides nothing under it, so
                        the centre is CUT OUT of the rail stroke with a mask:
                        white where the rails are, black down the middle. The
                        travelled run needs none of this; its green centre
                        covers the middle. */}
                    {/* TWO THIN STROKES, NOT A MASK (build 17). The hollow
                        run was a masked stroke for an hour and the mask
                        rasterised per segment inside a scrolling view:
                        "scrolling is extremely choppy." Two strokes give the
                        two lines for the price of two strokes.
                        TRUE OFFSETS FROM BUILD 22: they were two copies of
                        the path shifted half a gauge apart, which pinched on
                        every diagonal once the gauge widened ("tracks are not
                        staying equidistant apart"). railPairPaths pushes each
                        sample out along the curve's normal instead, so the
                        pair is a gauge apart everywhere. */}
                    {s.lit ? (
                      <>
                        <Path d={s.d} stroke={RAIL.rail} strokeWidth={RAIL_STROKE.rail} fill="none" />
                        <Path d={s.d} stroke={RAIL.between} strokeWidth={RAIL_STROKE.between} fill="none" />
                      </>
                    ) : (
                      <>
                        <Path d={s.left} stroke={RAIL.rail} strokeWidth={RAIL_STROKE.line} fill="none" strokeLinejoin="round" />
                        <Path d={s.right} stroke={RAIL.rail} strokeWidth={RAIL_STROKE.line} fill="none" strokeLinejoin="round" />
                      </>
                    )}
                  </G>
                );
              })}
              {/* Festival bunting over the terminus (last slice only) */}
              {zi === slices.length - 1 && (
                <Bunting x1={20} x2={mapW - 20} y={termY - 34} accent={line.accent} />
              )}
            </Svg>
            {/* Comet sweep on the active run: above the rail strokes, in
                whichever slice(s) the sampled dots fall. An overlay sibling
                of the Svg rather than a child of it since build 26, so the
                per-frame opacity never touches the zone-tall Svg bitmap.
                See RailPulseDot for what that cost on a Galaxy A17. */}
            {pulseDots.some((d) => d.y >= start && d.y < end) && (
              <RailPulseDots
                dots={pulseDots}
                start={start}
                end={end}
                color={line.accent}
                top={layerTop}
                width={mapW}
              />
            )}
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
            // THE CHIPS, ONCE (build 17). The tracing and story stops draw
            // their own bodies now (a chalkboard and a plaque, off the
            // owner's mockup), and all three bodies wear the same plates:
            // ALL-ACCESS where the server serves the stop plan-locked, EXPRESS
            // on a tested-out stop, FREE TASTE on a taste. One definition.
            const cardChips = (
              <>
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
              </>
            );
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
                    glow={colors.primary}
                    reduceMotion={reduceMotion}
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
                    style={[styles.cardRow, s.trace ? styles.traceStack : null]}
                  >
                    {/* The current stop's card breathes on the same indigo
                        glow as its node (build 22). */}
                    {isCurrent ? (
                      <CurrentStopGlow color={colors.primary} radius={20} inset={6} enabled={!reduceMotion} testID="current-stop-glow-card" />
                    ) : null}
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
                        // THE CHALKBOARD STANDS TALL (build 17, owner: "a
                        // vertical rectangle with chalk font"): a slate on an
                        // easel is taller than it is wide, and the doubled
                        // row pitch leaves the room for it.
                        // THE TRACE CARD IS A WIDE TICKET NOW (build 22,
                        // the owner's crop), the same width as the phrase
                        // cards and taller; the tall slate went.
                        // flexShrink 0: the base style lets a card shrink,
                        // and inside the 176pt slot the trace stack (card
                        // plus tip) is taller than the slot, so the card
                        // shrank to 122 and its drawn ticket ran on under
                        // the tip (seen on the simulator). The stack may
                        // overhang the slot instead; the row has the room.
                        s.trace ? { width: cardW, height: TRACE_CARD_H, flexShrink: 0 } : { width: cardW },
                        tipSide === 'left'
                          ? { paddingLeft: tagPointed ? 24 : 14, paddingRight: 12 }
                          : { paddingLeft: 12, paddingRight: tagPointed ? 24 : 14 },
                      ]}
                    >
                      {/* A CHALKBOARD FOR THE TRACING STOP (build 17, owner's
                          mockup: "the trace one should have a completely
                          different looking card like my example"). A slate in
                          a wood frame in place of the paper tag; the letters
                          are chalk. Everything else keeps its tag. */}
                      <TagCardBack
                        w={cardW}
                        h={s.trace ? TRACE_CARD_H : 72}
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
                      {/* THE GLOW RING CAME OFF in build 17 (owner chose B: "drop
                          the outer glow ring, keep the edge and the roof bar").
                          It was a 3pt accent ring 4pt outside the card, meant
                          to pulse (web: station-stop-glow) and unable to on
                          this app's release builds, where nothing driven
                          per-frame from native ticks. Static, it was a second
                          outline on a card that already has the accent edge,
                          the roof bar and the mascot: "card 1 is disorganized." */}
                      {s.trace ? (
                        <View style={styles.traceBody}>
                          {/* THE TRACE CARD (build 22, the owner's crop): a
                              TRACE pill with a pencil, "Trace N letters",
                              the practice line, a small framed chalkboard
                              showing the next letter as dashed chalk (the
                              guide path when the script has one, the letter
                              itself when not), a rule, the dot row with its
                              count, and a round Start. The chalk slate that
                              was the whole card since build 17 is gone; the
                              board is a picture on the ticket now. */}
                          <View style={styles.traceHead}>
                            <View style={styles.tracePill}>
                              <View style={[styles.tracePillDisc, { backgroundColor: accessible ? colors.primary : TICKET.inkAhead }]}>
                                <Feather name="edit-2" size={11} color="#ffffff" />
                              </View>
                              <Text style={[styles.tracePillText, { color: accessible ? colors.primary : TICKET.inkAhead }]}>TRACE</Text>
                            </View>
                            <View style={styles.cardTitleSpacer} />
                            {cardChips}
                            {!accessible && <Feather name="lock" size={12} color={colors.primary} />}
                          </View>
                          <View style={styles.traceMain}>
                            <View style={styles.traceWords}>
                              <Text numberOfLines={1} style={[styles.traceTitle, { color: accessible ? TICKET.ink : TICKET.inkAhead }]}>
                                {s.traceTotal ? `Trace ${s.traceTotal} letters` : s.trace.title}
                              </Text>
                              <Text numberOfLines={2} style={[styles.traceSub, { color: accessible ? TICKET.inkMuted : TICKET.inkAhead }]}>
                                {`Practice writing ${languageName} characters.`}
                              </Text>
                            </View>
                            <View style={styles.traceBoard}>
                              {(() => {
                                const chars = s.trace.characters;
                                const next = chars[Math.min(s.traceDone ?? 0, chars.length - 1)];
                                if (!next) return null;
                                return next.guide ? (
                                  <Svg width={40} height={40} viewBox="0 0 100 100">
                                    <Path
                                      d={next.guide}
                                      fill="none"
                                      stroke="#ffffff"
                                      strokeWidth={7}
                                      strokeDasharray="9 7"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      opacity={0.92}
                                    />
                                  </Svg>
                                ) : (
                                  <Text style={styles.traceBoardGlyph}>{next.char}</Text>
                                );
                              })()}
                              <View style={styles.traceBoardLedge}>
                                <View style={styles.traceChalk} />
                                <View style={[styles.traceEraser, { backgroundColor: colors.primary }]} />
                              </View>
                            </View>
                          </View>
                          <View style={[styles.traceRule, { backgroundColor: STOP_CARD.edge }]} />
                          <View style={styles.traceFoot}>
                            {s.traceTotal ? (
                              <>
                                <View testID={`progress-trace-${s.stopNumber}`} style={styles.traceDots}>
                                  <StopDots
                                    total={s.traceTotal}
                                    done={s.traceDone ?? 0}
                                    accent={accessible ? colors.primary : TICKET.inkAhead}
                                    muted={STOP_CARD.eyeletHole}
                                    ringFill={STOP_CARD.stockTop}
                                  />
                                </View>
                                <Text style={[styles.traceCount, { color: accessible ? TICKET.ink : TICKET.inkAhead }]}>
                                  {`${s.traceDone ?? 0}/${s.traceTotal}`}
                                </Text>
                              </>
                            ) : (
                              <View style={{ flex: 1 }} />
                            )}
                            <View style={styles.traceStart}>
                              <View style={[styles.traceStartDisc, { backgroundColor: accessible ? colors.primary : TICKET.inkAhead }]}>
                                <Feather name="edit-2" size={15} color="#ffffff" />
                              </View>
                              <Text style={[styles.traceStartText, { color: accessible ? colors.primary : TICKET.inkAhead }]}>
                                {(s.traceDone ?? 0) > 0 ? 'Continue' : 'Start'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : s.story ? (
                        <View style={styles.kindRow}>
                          {/* THE BOOK, BIG AND IN THREE DIMENSIONS (build 17,
                              owner: "storybook with a big book icon on it",
                              then "a 3-d looking book like my example"). The
                              open-book emblem the medallions used to carry;
                              it was already drawn, so it is reused rather
                              than a flat glyph. */}
                          <Image
                            source={stopEmblem('story')}
                            resizeMode="contain"
                            style={[styles.storyBook, !accessible && styles.storyBookAhead]}
                          />
                          <View style={styles.kindCopy}>
                            <View style={styles.cardTitleRow}>
                              <Text style={[styles.storyKicker, { color: accessible ? colors.primary : TICKET.inkAhead }]}>
                                STORY
                              </Text>
                              <View style={styles.cardTitleSpacer} />
                              {cardChips}
                              {!accessible && <Feather name="lock" size={12} color={colors.primary} />}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[styles.cardTitle, { color: accessible ? TICKET.ink : TICKET.inkAhead }]}
                            >
                              {s.story.title}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[styles.cardStatus, { color: accessible ? TICKET.inkMuted : TICKET.inkAhead }]}
                            >
                              {statusCopy}
                            </Text>
                          </View>
                        </View>
                      ) : (
                      <>
                      <View style={styles.cardTitleRow}>
                        {/* BOLO STANDS ON THE CARD NOW, not beside it.
                            Reported from the preview: "Move bolo onto the card
                            itself, he blends in." He was on the painting, which
                            is a busy bazaar at his own scale, so a small mascot
                            on it read as more bazaar. On cream stock he has a
                            ground to stand on. 28, not 44: he is inside a
                            two-line card now rather than in the margin. */}
                        {isCurrent && <Mascot pose="cheer" size={28} motion="none" />}
                        {/* THE SIGN GLYPH CAME OFF THE CURRENT CARD in build 17.
                            Owner: "card 1 is disorganized. chip for free taste
                            should be in upper right like 2 and 3." The row
                            wraps, and on the current card the mascot and the
                            glyph together pushed mascot + title + chip to 216
                            against 214 of content at cardW 250, so the chip
                            dropped a line. The glyph was the fourth mark of
                            "you are here" on one card (accent edge, glow,
                            mascot, glyph); the mascot stays and the row is
                            196 wide now. Web keeps its glyph: its card is not
                            width-bound the same way. */}
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
                        {cardChips}
                      </View>
                      {/* THE STATUS ROW (chat 11): the kind chip and the
                          lock moved down here from the title row. With the
                          ALL-ACCESS plate on every plan-locked stop, a trace
                          stop's title row carried title + two plates + a
                          lock and WRAPPED, which is what kept pushing the
                          stop-5 tags past their edges. One plate per row. */}
                      <View style={styles.cardStatusRow}>
                        {/* The app's violet on both kind chips from build 17
                            (owner's hybrid mockup): the one modern accent on
                            a parchment card, beside the numbered badge. */}
                        {s.trace && (
                          <View style={[styles.traceChip, styles.rusticChip, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                            <Feather name="edit-2" size={8} color="#ffffff" />
                            <Text style={styles.traceChipText}>TRACE</Text>
                          </View>
                        )}
                        {s.story && (
                          <View style={[styles.traceChip, styles.rusticChip, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
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
                          <Feather name="lock" size={12} color={colors.primary} />
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
                          {/* THE DOTS, NOT A BAR (owner, build 17: "for each
                              cards progress bar, i like the dotted bar you
                              did with purple on the boarding pass"). One dot
                              per phrase, mastered ones filled in the app's
                              violet. Same StopDots the pass draws. */}
                          <View testID={`stop-progress-${s.id}`} style={styles.cardDots}>
                            <StopDots
                              total={s.phraseCount ?? 0}
                              done={Math.min(s.masteredCount ?? 0, s.phraseCount ?? 0)}
                              accent={accessible ? colors.primary : TICKET.inkAhead}
                              muted={accessible ? ZONE_BOARD.inkMuted : TICKET.inkAhead}
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
                      </>
                      )}
                    </View>
                    {/* THE TIP UNDER THE TRACE CARD (build 22, the crop): a
                        lavender slip with a dashed edge and a bulb, the one
                        instruction tracing needs. */}
                    {s.trace ? (
                      <View style={[styles.traceTip, { width: cardW }]} testID={`trace-tip-${s.stopNumber}`}>
                        <View style={styles.traceTipBulb}>
                          <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.primary} />
                        </View>
                        <Text style={[styles.traceTipText, { color: TICKET.ink }]}>
                          Trace each letter with your finger. Go slow and stay on the lines!
                        </Text>
                      </View>
                    ) : null}
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
                <React.Fragment key={sp.key}>
                {/* THE INVITATION UNDER THE STALL (build 17, owner's mockup:
                    "Take a break and earn 24 Chai"). A violet chip in the
                    app's own voice beside the painted stall, the number in
                    gold. THE NUMBER IS WHAT HE POURS AT THE STALL, not the
                    signal games' reward: the first cut read rewardChai and
                    said 1, and the owner caught it ("I thought chachaji's
                    stop awarded 3 chai?"). The server serves encounterChai on
                    the zone's signals payload from build 17; 3 is the fallback
                    for a server that predates the field, and it is
                    TOKEN_EARN_CHACHA_ENCOUNTER today. Not in the showroom:
                    a greyed stall pours nothing. */}
                {/* ON THE CARD, NOT UNDER THE NODE (build 22, owner: "chacha
                    has been separated from the take a break text"): the
                    stall card reserves its bottom strip for this pill, which
                    is drawn here because the number is the zone's own
                    encounterChai and the card is scenery that knows no zone. */}
                {!sp.gray && (
                  <View
                    pointerEvents="none"
                    testID={`${sp.testID}-invite`}
                    style={{
                      position: 'absolute',
                      left: sp.x - 36,
                      top: sp.y - 82 - blockTop,
                      zIndex: 6,
                    }}
                  >
                    <View style={[styles.stallInvite, { backgroundColor: colors.primary }]}>
                      {/* Two Texts, not one wrapping Text: a nested run with
                          its own face made the wrap ellipsise at one line on
                          the simulator, twice. */}
                      <Text style={styles.stallInviteText} numberOfLines={1}>
                        Take a break,
                      </Text>
                      <Text style={styles.stallInviteText} numberOfLines={1}>
                        {'earn '}
                        <Text style={styles.stallInviteGold}>
                          {zoneQueries[zi]?.data?.signals?.encounterChai ?? 3} Chai
                        </Text>
                      </Text>
                    </View>
                  </View>
                )}
                {/* THE STALL IS A PAINTED CARD NOW (build 22, owner:
                    "Chachaji's stall should be more detailed like this"),
                    drawn by ChaiStallTrackside with its own nameplate, and
                    seated ABOVE the marker where the row's left flank is
                    free (the previous stop's card ends 136 above the marker,
                    the marker's box starts 32 above). The box grew to hold
                    it; the plates that used to sit here went with the glyph. */}
                <Svg
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: sp.x - 46,
                    top: sp.y - 168 - blockTop,
                    zIndex: 5,
                  }}
                  width={92}
                  height={178}
                  viewBox={`${sp.x - 46} ${sp.y - 168} 92 178`}
                >
                  <G key={sp.key}>
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
                </React.Fragment>
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

      {/* THE ZONE RAIL, iPad only (build 25). Web's desktop rail (build 24)
          brought over: the whole line at once, one ivory card per zone with
          its state said three ways (word, glyph, edge colour), joined by
          short track segments, closed by the gold Journey 2 card. It hangs
          off the map column's left edge and stays put while the map scrolls;
          a tap lands the map on that zone's board and nothing more. The
          phone never has the margin for it, so `wide` gates it entirely, and
          so does the margin itself: beside a 560 map the 11-inch leaves 137
          and the mini 92, under the 168 the rail needs, so only the 13-inch
          shows it today (web draws the line at 1280px for the same reason). */}
      {wide && (windowW - mapW) / 2 >= ZONE_RAIL_W + ZONE_RAIL_GAP * 2 && (
        <ZoneRail
          zones={zones.map((z, zi) => ({
            zoneIndex: zi,
            geoName: z.geoName,
            y: postcardYs.find((p) => p.zoneIndex === zi)?.y ?? 0,
            done: z.stations.filter(
              (st) => st.status === 'completed' || st.status === 'tested_out',
            ).length,
            total: z.stations.length,
            hasCurrent: z.stations.some((st) => st.id === currentId),
          }))}
          onward={line.zones2}
          accent={line.accent}
          left={(windowW - mapW) / 2 - ZONE_RAIL_GAP - ZONE_RAIL_W}
          onJump={(y) => {
            userScrolledRef.current = true;
            landIntro();
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
          }}
        />
      )}

      {/* THE PINNED ZONE BOARD, above the scroll view rather than inside it.
          See renderZoneBoard for why this is not a sticky header. It shows
          whichever zone owns the top of the viewport, and the back arrow
          floats over it from the header above. */}
      <View
        testID="journey-board-overlay"
        pointerEvents="box-none"
        // Anchored at the very top so its painted cap covers the status-bar
        // strip too. The BOARD inside is pushed down by the safe-area inset
        // instead, because its contents are absolutely positioned and an
        // absolute child does not take a parent's paddingTop.
        style={[styles.boardOverlay, { top: 0 }]}
      >
        {/* A SHORT FADE UNDER THE STATUS BAR, and deliberately not a bar.
            With the board floating, the live map runs right up behind the
            clock, and a stop card sliding through there collides with it.
            This is the smallest thing that fixes that: the zone's own foot
            tone at the very top, gone within the safe area, so the status bar
            stays readable and nothing reads as a header. */}
        {/* NO CAP. THE BOARD FLOATS (owner, build 17: "the zone card should
            float, no box behind it"). A still crop of the zone's art was
            painted here for an hour so cards would vanish behind the pinned
            board; it read as a box the board sat on. The fade under the
            clock stays, because it is a gradient and not a box, and a card
            passing under the board shows at its edges, which is the pin. */}
        {/* NO FADE EITHER (owner: "i don't want a blended cross fade at the
            top of the page. I want zone 1's background to start at the
            absolute top"). The first tile's top row is the top edge of the
            screen, and nothing is painted over it. */}
        {zones.map((_, zi) => (
          <PinnedZoneBoard
            key={`pinned-board-${zi}`}
            // -TOP_PAD: the canvas reserves TOP_PAD plus the pin clearance
            // before the first board, and the scroll content reserves only
            // the clearance (journey-header-clearance), so canvas y and
            // content y differ by exactly TOP_PAD for every zone. Build 17:
            // the flow half of that was missing and every board sat 104 low.
            naturalY={SCROLL_CONTENT_TOP + (slices[zi]?.start ?? 0) - TOP_PAD}
            nextNaturalY={
              zi + 1 < zones.length
                ? SCROLL_CONTENT_TOP + (slices[zi + 1]?.start ?? 0) - TOP_PAD
                : null
            }
            pinTop={headerTopInset}
            boardH={PC_H + ZONE_BOARD_GAP}
            scrollY={scrollY}
          >
            {renderZoneBoard(zi)}
          </PinnedZoneBoard>
        ))}
      </View>

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
                  <Feather name="lock" size={14} color={colors.primary} />
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

/** Web's w-36 card and mr-3 gap, in points. */
const ZONE_RAIL_W = 144;
const ZONE_RAIL_GAP = 12;

type ZoneRailEntry = {
  zoneIndex: number;
  geoName: string;
  y: number;
  done: number;
  total: number;
  hasCurrent: boolean;
};

/**
 * The line, zone by zone, beside the map on a wide screen. Twin of the web
 * rail in gujarati-coach/src/pages/journey.tsx (data-testid
 * journey-zone-rail): same three states, same words, same colours. Cards,
 * not counts (owner, build 24: "show nice cards for each zone title, not stop
 * progress"). Hidden from assistive tech as a duplicate: every zone it lists
 * is already reachable by scrolling the map.
 */
function ZoneRail({
  zones,
  onward,
  accent,
  left,
  onJump,
}: {
  zones: ZoneRailEntry[];
  onward: readonly string[];
  accent: string;
  left: number;
  onJump: (y: number) => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="journey-zone-rail"
      style={[railStyles.wrap, { left }]}
    >
      <View pointerEvents="box-none" style={railStyles.stack}>
        {zones.map((z) => {
          const state: 'done' | 'here' | 'ahead' =
            z.total > 0 && z.done === z.total ? 'done' : z.hasCurrent ? 'here' : 'ahead';
          const word = state === 'done' ? 'Done' : state === 'here' ? 'You are here' : 'Ahead';
          const edge = state === 'here' ? '#4F46E5' : state === 'done' ? accent : 'rgba(43,26,18,0.22)';
          const wordColor = state === 'here' ? '#4F46E5' : state === 'done' ? accent : '#6B6680';
          return (
            <View key={z.zoneIndex}>
              <Pressable
                testID={`zone-rail-${z.zoneIndex}`}
                onPress={() => {
                  hapticLight();
                  onJump(z.y);
                }}
                style={[
                  railStyles.card,
                  {
                    borderColor: edge,
                    backgroundColor: state === 'ahead' ? 'rgba(255,251,240,0.8)' : '#FFFBF0',
                    shadowOpacity: state === 'here' ? 0.3 : 0.25,
                  },
                  state === 'here' && railStyles.cardHere,
                ]}
              >
                <View
                  style={[
                    railStyles.disc,
                    { backgroundColor: state === 'ahead' ? 'rgba(43,26,18,0.08)' : edge },
                  ]}
                >
                  {state === 'done' ? (
                    <Feather name="check" size={11} color="#ffffff" />
                  ) : state === 'here' ? (
                    <MaterialCommunityIcons name="train" size={12} color="#ffffff" />
                  ) : (
                    <Feather name="lock" size={11} color="rgba(43,26,18,0.55)" />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={2}
                    style={[railStyles.name, { color: state === 'ahead' ? '#6B6680' : '#1E1B2E' }]}
                  >
                    {z.geoName}
                  </Text>
                  <Text style={[railStyles.word, { color: wordColor }]}>
                    ZONE {z.zoneIndex + 1} · {word.toUpperCase()}
                  </Text>
                </View>
              </Pressable>
              <View
                style={[
                  railStyles.link,
                  { backgroundColor: state === 'done' ? accent : 'rgba(255,251,240,0.6)' },
                ]}
              />
            </View>
          );
        })}
        {/* THE ONWARD CARD: gold edge and parchment because it is a PLACE, not
            a control (gold = world). Nothing here is tappable; journey 2 is
            not drawn on this map. */}
        <View testID="zone-rail-onward" style={railStyles.onward}>
          <Text style={railStyles.onwardEyebrow}>THE LINE GOES ON</Text>
          <View style={railStyles.onwardRow}>
            <View style={railStyles.onwardDisc}>
              <MaterialCommunityIcons name="train" size={16} color="#ffffff" />
            </View>
            <Text style={railStyles.onwardTitle}>Journey 2</Text>
          </View>
          <Text style={railStyles.onwardSpan}>
            {onward[0]} to {onward[5]}
          </Text>
          <Text style={railStyles.onwardEyebrow}>6 MORE ZONES</Text>
        </View>
      </View>
    </View>
  );
}

const railStyles = StyleSheet.create({
  // Vertically centred in the window, like web's sticky top-1/2.
  wrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: ZONE_RAIL_W,
    justifyContent: 'center',
  },
  stack: { width: ZONE_RAIL_W },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#2B1A12',
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // Web's 3px violet halo round the current zone.
  cardHere: { shadowRadius: 8, shadowOpacity: 0.3 },
  disc: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  name: { fontFamily: AppFonts.extrabold, fontSize: 11, lineHeight: 13 },
  word: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  link: { alignSelf: 'center', width: 3, height: 12, borderRadius: 2 },
  onward: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#b7791f',
    backgroundColor: '#F8EBC4',
    paddingHorizontal: 10,
    paddingVertical: 12,
    shadowColor: '#2B1A12',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  onwardEyebrow: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 1, color: '#8a5a12' },
  onwardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  onwardDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#b7791f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onwardTitle: { fontFamily: AppFonts.extrabold, fontSize: 15, color: '#1E1B2E', flex: 1 },
  onwardSpan: { fontFamily: AppFonts.extrabold, fontSize: 11, lineHeight: 13, color: '#1E1B2E', marginTop: 8, marginBottom: 2 },
});

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontFamily: AppFonts.bold, fontSize: 14 },
  // FLOATS OVER THE MAP, it is not a row above it. In flow it pushed the
  // ScrollView down and the painting could only ever start below it, which is
  // the seam the copied-art attempt was trying to hide. Absolute and on top,
  // with the scroll content padded by its measured height, means the real
  // painting passes underneath and the ticket lies on it.
  //
  // NO BACKGROUND AND NO BOTTOM BORDER: both were what made it read as a bar.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // ABOVE the board overlay (40). The board is a full-width card pinned to
    // the same corner the back arrow lives in, and at 20 it buried it.
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    // paddingTop is applied inline: 10 plus the safe-area/web chrome inset.
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // DRESSED LIKE THE REST OF THE MAP. It was a dashed box in brand green,
  // then a dashed box in parchment, and dashed-and-flat was still the odd one
  // out beside carved wood and ruled paper tags. It now carries exactly what
  // a stop tag carries: a solid brown edge, a hairline rule set in from it,
  // and the same stock. The dashes moved to the torn right edge, which is the
  // one place a ticket should look perforated.
  headerTicket: {
    flex: 1,
    borderWidth: 2,
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
  // The sheet's inner frame, the same one every stop tag draws. Absolutely
  // positioned so it costs no layout and cannot change the header's height.
  headerTicketRule: {
    position: 'absolute',
    left: 4,
    top: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderRadius: 7,
  },
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
  scrollContent: { paddingBottom: 48 },
  // box-none so the board's own buttons still take taps while the map
  // scrolls normally either side of it.
  boardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 40,
  },
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
  // A ROUND NODE SINCE BUILD 22: 64 outer, 56 ring, 48 node, filling the
  // marker box so the engine sits on the rail rather than beside it.
  markerCurrentOuter: { borderRadius: 32, padding: 4 },
  markerCurrentRing: { borderRadius: 28, padding: 4 },
  markerCurrentPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#2B1A12',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
  // The numbered stop badge (build 17). 30 across so it sits on the rail
  // the way the 28pt medallion did; the check overlaps its top-right corner.
  stopBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2B1A12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stopBadgeNumber: { fontFamily: AppFonts.extrabold, fontSize: 13, lineHeight: 16 },
  stallInvite: {
    // The card's bottom strip since build 22: 72 wide, two short lines.
    width: 72,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  // Two lines in a 22pt strip on the stall card (build 22); was 10 over 13.
  stallInviteText: { fontFamily: AppFonts.semibold, fontSize: 7.5, lineHeight: 9.5, color: '#ffffff', textAlign: 'center' },
  stallInviteGold: { fontFamily: AppFonts.extrabold, color: '#FBBF24' },
  stopBadgeCheck: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    // TWICE CORRECTED, and this value is the middle of the two complaints.
    // 0.42 read as a white lozenge parked behind the signal rather than as a
    // ground under it, so it went to 0.26 — and at 0.26 the plate stopped
    // doing its job on the painted bazaar: "the signal signs lost their tan
    // backing to make them appear and not blend in" (owner, chat 12). The
    // plate exists to make a 20pt piece of line art findable on a painting;
    // too faint and there is no reason for it to be there at all.
    opacity: 0.38,
  },
  // Lifted off the painting (build 22, "more depth"): the card inside clips,
  // so the shadow lives on this wrapper, cast by the card's own pixels.
  postcardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    shadowColor: '#2B1A12',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  // The daily-fact strip inside the panel. Web twin: LiveFactStrip's button in
  // journey.tsx (dashed accent border, 8px label, 9px two-line fact).
  boardLineName: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 1,
  },
  // THE MODERN PANEL (build 17): a cream card on the carved board.
  // Wood on three sides, the violet edge on the fourth: it hangs from the
  // pediment the way the parchment did, without the parchment.
  // ONE IVORY SURFACE WITH THE CAP (build 22): the brown 3pt frame and the
  // violet-to-pink edge went with the carved pediment. The lavender edge
  // continues the cap's, and the shadow that lifts the card off the painting
  // sits on postcardWrap, since this box clips.
  boardCard: {
    flex: 1,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#CFC8F0',
    backgroundColor: '#FFFDF9',
    overflow: 'hidden',
  },
  boardCardBody: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 9 },
  boardLandmark: { position: 'absolute', left: 120, top: 2 },
  // top 16, NOT 0, AND THE FIRST FIX HERE ONLY COVERED THE BIRD. The owner
  // reported this twice: "bolo needs more space on the zone card, he's getting
  // cut off", then on 2026-09-02 "ipad sim still shows bolo hat being cut off
  // on zone card". She was never the thing being cut. Mascot draws the sprite
  // with marginTop: -sky, so the 176px of headroom build 26 added hangs ABOVE
  // her box, and this card clips. A bare bird looks perfect while every hat in
  // the game is beheaded. 16 is that sky at size 92 (92 * 176/1024 = 15.8), so
  // it drops exactly enough to bring the hat inside and no further. The web
  // twin is pages/journey.tsx's `top-4`, fixed a day earlier; this file was
  // missed, which is what a hand-maintained twin costs.
  boardBolo: { position: 'absolute', right: 6, top: 16, zIndex: 2 },
  // The city and the stops line stop short of the bird.
  boardClearOfBolo: { paddingRight: 100 },
  boardGap: { height: 8 },
  boardLineRow: { flexDirection: 'row' },
  boardLinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boardLinePillText: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 1, color: '#ffffff' },
  boardCity: { fontFamily: AppFonts.extrabold, fontSize: 22, lineHeight: 26, color: '#2B1A0E', marginTop: 5 },
  boardStops: { fontFamily: AppFonts.semibold, fontSize: 11, lineHeight: 14, color: '#6B5B4E', marginTop: 1 },
  boardFact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#2B1A12',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  boardFactSpark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardFactCopy: { flex: 1, minWidth: 0 },
  boardTestOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
  },
  boardTestOutText: { fontFamily: AppFonts.bold, fontSize: 13, color: '#ffffff' },
  boardFactLabel: { fontFamily: AppFonts.extrabold, fontSize: 10, letterSpacing: 1.2 },
  boardFactText: { fontFamily: AppFonts.semibold, fontSize: 11, lineHeight: 14, color: '#3A2A1E', marginTop: 1 },
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
  // paddingVertical 6 until build 17: the panel body has its own insets from
  // the art, so this doubled up on them and cost 6 of a body that was short.
  postcardLeft: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 3 },
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
    // DEEPER AGAIN (build 22, owner: "give the stop boxes and all aspects a
    // little more depth, make them more 3d"): the lift grew from 0.24 at 7
    // to 0.34 at 10, dropped straight down.
    shadowColor: '#2B1A12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 10,
    elevation: 5,
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
  cardDots: { flex: 1, minWidth: 0, paddingRight: 2 },
  // The dots stop short of the pencil on the corner (owner: "chalkboard icon
  // is blocking the dot progress bar").
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
  traceChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: '#ffffff' },
  cardStatus: { fontFamily: AppFonts.semibold, fontSize: 11, lineHeight: 14, marginTop: 1 },
  // The tracing stop's chalkboard and the story stop's plaque (build 17).
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindCopy: { flex: 1, minWidth: 0 },
  // THE TRACE CARD (build 22, the owner's crop).
  traceStack: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  traceBody: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  traceHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tracePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tracePillDisc: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tracePillText: { fontFamily: AppFonts.extrabold, fontSize: 11, letterSpacing: 1.6 },
  traceMain: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  traceWords: { flex: 1, minWidth: 0 },
  traceTitle: { fontFamily: AppFonts.extrabold, fontSize: 16, lineHeight: 20 },
  traceSub: { fontFamily: AppFonts.regular, fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  traceBoard: {
    width: 64,
    height: 50,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#8A5D4A',
    backgroundColor: '#1F3D2B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  traceBoardGlyph: { fontFamily: CHALK_FONT, fontSize: 24, lineHeight: 30, color: 'rgba(255,255,255,0.92)' },
  traceBoardLedge: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: -3,
    height: 5,
    borderRadius: 2,
    backgroundColor: '#A8734F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  traceChalk: { width: 10, height: 3, borderRadius: 1.5, backgroundColor: '#ffffff' },
  traceEraser: { width: 12, height: 4, borderRadius: 1.5 },
  traceRule: { height: 1, marginTop: 6, marginBottom: 4, opacity: 0.9 },
  traceFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  traceDots: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  traceCount: { fontFamily: AppFonts.extrabold, fontSize: 13 },
  traceStart: { alignItems: 'center', gap: 1, marginLeft: 4 },
  traceStartDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2B1A12',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  traceStartText: { fontFamily: AppFonts.bold, fontSize: 10 },
  traceTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C2F2',
    backgroundColor: '#F1EEFA',
  },
  traceTipBulb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  traceTipText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 11.5, lineHeight: 15 },
  storyBook: { width: 52, height: 52, marginLeft: -4 },
  // Ahead, the book is knocked back the way the paper is: greyer, not faded.
  storyBookAhead: { tintColor: TICKET.inkAhead },
  storyKicker: { fontFamily: AppFonts.extrabold, fontSize: 10, letterSpacing: 1.6 },
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
