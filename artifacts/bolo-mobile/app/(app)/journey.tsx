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
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, G, Rect } from 'react-native-svg';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  useListCategories,
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { LessonError } from '@/components/LessonError';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { asUpgradeRequired } from '@/lib/entitlements';
import { JOURNEY_ZONES, getJourneyLine, getRailBrand } from '@/lib/journeyLines';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import {
  Bunting,
  SceneryElement,
  ZoneVista,
  SCENERY_GRAY,
  SCENERY_PLACEMENT,
  planZoneScenery,
} from '@/components/journey/Scenery';
import { useColors } from '@/hooks/useColors';
import { useThemePrefValue } from '@/contexts/ThemeContext';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

const GRAY = SCENERY_GRAY; // rail/marker color for locked showroom zones

// Serpentine layout rhythm — identical to the web map (which is itself
// mobile-width, max 390px).
const MAP_MAX_W = 390;
const STATION_H = 100; // vertical rhythm per station row
const CARD_PROGRESS_W = 80; // mastered-progress track width (web: w-20)
const PC_H = 152; // vertical rhythm per fare-zone postcard (incl. picture side)
const TERM_H = 92; // terminus row
const TOP_PAD = 10;
const LEFT_X = 92; // marker x for even-index stations

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
};

type LockInfo = {
  kind: 'progression' | 'sentence' | 'language' | 'plan';
  stopLabel: string;
  zoneTitle: string;
  /** Route pieces for the progression dialog's test-out action. */
  zoneId?: number;
  groupId?: number;
};

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
const RAIL_BED_INK = '#0f172a';

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

/** Marker sitting on the rail: circle for phrase stops, diamond for the
 *  first-class sentence stops, train for the current stop. */
function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
  background,
  border,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  background: string;
  border: string;
}) {
  if (isCurrent) {
    // White pill + accent ring + soft outer ring (web: box-shadow rings).
    return (
      <View style={[styles.markerCurrentOuter, { backgroundColor: `${color}33` }]}>
        <View style={[styles.markerCurrentRing, { backgroundColor: color }]}>
          <View style={styles.markerCurrentPill}>
            <TrainEngine tint={color} width={32} height={22} motion="bob" />
          </View>
        </View>
      </View>
    );
  }
  const done = station.status === 'completed' || station.status === 'tested_out';
  const diamond = station.stage === 'sentence';
  if (done) {
    // Filled marker: accent fill, white border, thin accent outer ring.
    return (
      <View
        style={[
          styles.markerDoneRing,
          { backgroundColor: color },
          diamond && styles.diamond,
        ]}
      >
        <View
          style={[
            styles.markerDone,
            { backgroundColor: color, borderColor: '#ffffff' },
            diamond && styles.diamondInner,
          ]}
        />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.markerOpen,
        {
          backgroundColor: background,
          borderColor: accessible ? color : border,
        },
        diamond && styles.diamond,
      ]}
    />
  );
}

export default function JourneyScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  // The main render opts out of Screen's top padding (padTop={false}) so the
  // header hugs the top edge, which shoved it under the status bar/notch on
  // native. Pad the header itself with the same inset Screen would apply
  // (web preview uses Screen's fixed 67px chrome offset). The loading/error
  // branches below use a plain <Screen> and keep its default padding, so
  // only this header needs the explicit inset.
  const insets = useSafeAreaInsets();
  const headerTopInset = Platform.OS === 'web' ? 67 : insets.top;
  const { activeLang, activeLanguage } = useLanguage();
  const railBrand = getRailBrand(activeLang);
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const reduceMotion = useReducedMotion();
  // Task 985 port: light scroll parallax on the scenery layer. ONE
  // scroll-linked transform on the scenery wrapper, so it drifts slightly
  // slower than the rail and reads as sitting behind it. Entirely absent
  // under reduced motion (transform pinned to 0).
  const scrollY = useSharedValue(0);
  const onMapScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const sceneryParallaxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : scrollY.value * DEPTH_2_5D.parallaxFactor },
    ],
  }));
  // Web --station-surface (index.css): warm off-white in light mode, deep
  // navy in dark — the current stop's signboard card stock. Resolved the
  // same way useColors picks its palette.
  const systemScheme = useColorScheme();
  const themePref = useThemePrefValue();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';
  const stationSurface = isDark ? '#1B2232' : '#FCFAF5';
  // Web measures the map column with a ResizeObserver; on native the window
  // width is authoritative (map column = screen width capped at 390, with the
  // same 0 side padding the web column has inside its centering wrapper).
  const mapW = Math.min(MAP_MAX_W, windowW);

  // One language's map never fetches another language's data: exactly six
  // fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  const languageName = activeLanguage?.name ?? 'this language';

  // Plain-locked language (no teaser set): the API keeps its pre-M1 402 and
  // the map defers to the standard upgrade screen.
  const upgrade = zoneQueries
    .map((q) => asUpgradeRequired(q.error))
    .find((u) => u !== null);
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
    return {
      ...z,
      title: categories?.find((c) => c.id === z.id)?.title ?? z.title,
      geoName: line.zones[i]!,
      stations,
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
  const currentZone = currentStation ? zones[currentStation.zoneIndex]! : null;

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
    kind: 'station' | 'postcard' | 'terminus';
    lit: boolean;
    station?: Station;
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
      lit: !showroom || zoneLit,
      zoneIndex: zi,
    });
    layoutY += PC_H;
    for (const s of zone.stations) {
      // Free-tier content policy: a plan-gated sentence stop arrives
      // status "locked" (planLocked) from the server, so unlocked means lit.
      const lit =
        s.status === 'completed' ||
        s.status === 'tested_out' ||
        s.status === 'in_progress' ||
        s.status === 'unlocked';
      pts.push({ x: stationX(k), y: layoutY + STATION_H / 2, kind: 'station', lit, station: s });
      layoutY += STATION_H;
      k++;
    }
  }
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

  const stationPts = pts.filter((p) => p.kind === 'station');

  // Trackside scenery plan (Task 985 port): deterministic per-zone placement
  // in the free strip beside a station row, same side as the marker
  // (opposite its card), on the same edge inset and ground line the web map
  // uses. Locked showroom zones gray out with their postcards.
  const sceneryPlacements = zones.flatMap((zone, zi) => {
    const zonePts = stationPts.filter((p) => p.station!.zoneIndex === zi);
    const zoneAccessible = zone.stations.some(
      (st) => isStatusAccessible(st.status) || st.teaserStation,
    );
    return planZoneScenery(zi, zonePts.length).map(({ kind, row }, i) => {
      const p = zonePts[row]!;
      return {
        key: `${zi}-${i}`,
        kind,
        x: p.x < mapW / 2 ? SCENERY_PLACEMENT.edgeX : mapW - SCENERY_PLACEMENT.edgeX,
        y: p.y + SCENERY_PLACEMENT.groundDy,
        gray: showroom && !zoneAccessible,
      };
    });
  });

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
          style={[styles.headerTicket, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <TicketStripes ink={`${line.accent}08`} />
          <View style={styles.headerTicketRow}>
            <View style={styles.headerTicketBody}>
              {/* Native-script brand must use the language font (Latin UI
                  font = tofu); same per-script handling as the picker. */}
              <Text
                style={[
                  styles.ticketEyebrow,
                  { color: colors.mutedForeground },
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
              <Text numberOfLines={1} style={[styles.ticketLine, { color: colors.foreground }]}>
                {line.lineName}
              </Text>
              <Text numberOfLines={1} style={[styles.ticketRoute, { color: colors.mutedForeground }]}>
                {line.zones[0]} → {line.zones[5]} · {doneCount}/{totalCount} stations
              </Text>
              {access === 'teaser' && teaserProgress && (
                <Text style={[styles.ticketTeaser, { color: line.accent }]}>
                  Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                </Text>
              )}
            </View>
            {/* tear-off stub: perforation-end notches (edge bites) come from
                TicketPerforationV. Web's floating notch dot and 🎫 emoji were
                dropped from the port: cutout circles only ever straddle card
                edges (approved ruling), and the emoji renders as tofu without
                an emoji font. */}
            <TicketPerforationV dashColor={colors.border} holeColor={colors.background} />
            <View style={styles.headerStub}>
              {/* Fixed slot keeps the rotated stamp's visual extent inside
                  the stub (clear of the perforation). */}
              {currentZone && currentStation && (
                <View testID="header-stamp-slot" style={styles.stubStampSlot}>
                  <ZoneStamp
                    ink={line.accent}
                    zone={currentStation.zoneIndex + 1}
                    name={currentZone.geoName}
                    size={44}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onMapScroll}
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
        <View style={[styles.map, { width: mapW, height: totalH }]}>
          {/* India-flavored trackside scenery (Task 985 port): zone-themed
              dimensional flat scenes in the free strip beside station rows,
              anchored to the same serpentine geometry the stations use.
              Rendered FIRST so the whole layer sits below the rail (depth
              order: scenery < rail < stations). The wrapper carries the
              single scroll-linked parallax transform; the Svg blocks inside
              reuse the per-zone slice geometry for scroll perf. */}
          <Animated.View
            testID="journey-scenery-layer"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, sceneryParallaxStyle]}
          >
            {slices.map(({ start, end }, si) => {
              const local = sceneryPlacements.filter(
                (sp) => sp.y >= start && sp.y < end,
              );
              if (local.length === 0) return null;
              return (
                <Svg
                  key={si}
                  pointerEvents="none"
                  style={{ position: 'absolute', left: 0, top: start }}
                  width={mapW}
                  height={end - start}
                  viewBox={`0 ${start} ${mapW} ${end - start}`}
                >
                  {local.map((sp) => (
                    <SceneryElement
                      key={sp.key}
                      kind={sp.kind}
                      x={sp.x}
                      y={sp.y}
                      accent={line.accent}
                      gray={sp.gray}
                    />
                  ))}
                </Svg>
              );
            })}
          </Animated.View>

          {/* Track, one Svg block per fare zone */}
          {slices.map(({ start, end }, si) => (
            <Svg
              key={si}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: start }}
              width={mapW}
              height={end - start}
              viewBox={`0 ${start} ${mapW} ${end - start}`}
            >
              {segs.map((s, i) => {
                if (!(s.y1 > start && s.y0 < end)) return null;
                const railColor = s.lit ? line.accent : GRAY;
                return (
                  <G key={i} opacity={s.lit ? 1 : 0.5}>
                    {/* Rail-bed underside (Task 985): the tie band duplicated
                        once, offset down in ink at low opacity, so every tie
                        shows a bottom edge and the track reads as a raised
                        bed. The rail geometry itself is untouched. */}
                    <Path
                      d={s.d}
                      transform={`translate(0 ${DEPTH_2_5D.railBedDy})`}
                      stroke={RAIL_BED_INK}
                      strokeWidth={15}
                      strokeDasharray="3 11"
                      opacity={DEPTH_2_5D.railBedOpacity}
                      fill="none"
                    />
                    <Path d={s.d} stroke={railColor} strokeWidth={15} strokeDasharray="3 11" opacity={0.3} fill="none" />
                    <Path d={s.d} stroke={railColor} strokeWidth={8.5} fill="none" strokeDasharray={s.lit ? undefined : '9 7'} />
                    <Path d={s.d} stroke={colors.background} strokeWidth={4} fill="none" strokeDasharray={s.lit ? undefined : '9 7'} />
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
              {si === slices.length - 1 && (
                <Bunting x1={20} x2={mapW - 20} y={termY - 34} accent={line.accent} />
              )}
            </Svg>
          ))}

          {/* Zone postcards (full width; interchange diamond rides the track) */}
          {postcardYs.map(({ y: py, zoneIndex }) => {
            const zone = zones[zoneIndex]!;
            const pt = pts.find((p) => p.kind === 'postcard' && p.zoneIndex === zoneIndex)!;
            const zoneAccessible = zone.stations.some(
              (s) => isStatusAccessible(s.status) || s.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const cardColor = grayed ? GRAY : line.accent;
            return (
              <View key={zone.id}>
                <View style={[styles.postcardWrap, { top: py + 10 }]}>
                  <View style={[styles.postcard, { borderColor: cardColor, opacity: grayed ? 0.8 : 1 }]}>
                    <View style={[styles.postcardInner, { borderColor: `${cardColor}66` }]}>
                      {/* picture side: the zone's landmark vista */}
                      <ZoneVista zoneIndex={zoneIndex} accent={line.accent} grayed={grayed} />
                      {/* address side */}
                      <View style={styles.postcardAddress}>
                        <View style={styles.postcardLeft}>
                          <Text style={[styles.postcardZoneLabel, { color: cardColor }]}>
                            FARE ZONE {zoneIndex + 1} · {zone.title.toUpperCase()}
                          </Text>
                          <Text numberOfLines={1} style={styles.postcardGeoName}>
                            {zone.geoName}
                          </Text>
                          <Text style={styles.postcardStops}>
                            {zone.stations.length} {zone.stations.length === 1 ? 'stop' : 'stops'} in this zone
                          </Text>
                        </View>
                        {/* divided-back vertical rule */}
                        <View style={[styles.postcardRule, { backgroundColor: `${cardColor}44` }]} />
                        {/* stamp + postmark, side by side */}
                        <View style={styles.postcardRight}>
                          <View style={[styles.postmark, { borderColor: `${cardColor}88` }]}>
                            <View style={[styles.postmarkInner, { borderColor: cardColor }]}>
                              <View style={[styles.postmarkDot, { backgroundColor: cardColor }]} />
                            </View>
                          </View>
                          <View style={[styles.postageStamp, { borderColor: cardColor, backgroundColor: `${cardColor}14` }]}>
                            <Text style={[styles.postageStampLabel, { color: cardColor }]}>ZONE</Text>
                            <Text style={[styles.postageStampNum, { color: cardColor }]}>{zoneIndex + 1}</Text>
                          </View>
                        </View>
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
                      top: py + 10 - 8,
                      backgroundColor: cardColor,
                    },
                  ]}
                >
                  <View style={styles.interchangeInner} />
                </View>
              </View>
            );
          })}

          {/* Stations */}
          {stationPts.map((p, k2) => {
            const s = p.station!;
            const zone = zones[s.zoneIndex]!;
            const zoneAccessible = zone.stations.some(
              (st) => isStatusAccessible(st.status) || st.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const zoneColor = grayed ? GRAY : line.accent;
            const side: 'left' | 'right' = k2 % 2 === 0 ? 'right' : 'left';
            const boxLeft = side === 'right' ? p.x + 28 : 16;
            const boxWidth =
              side === 'right' ? mapW - 16 - (p.x + 28) : p.x - 28 - 16;
            const stopLabel = `Stop ${s.stopNumber} of ${s.stopCount}`;
            // Free-tier content policy: sentence stops gate by the server's
            // planLocked flag (all-premium groups), not by stage — Hindi
            // Fare Zone 1's sentence stops serve free. A planLocked sentence
            // stop keeps the first-class upsell sheet.
            const sentenceGated =
              s.stage === 'sentence' && s.planLocked === true;
            const accessible = isStatusAccessible(s.status) && !sentenceGated;
            const isCurrent = s.id === currentId;
            const statusCopy =
              s.status === 'completed'
                ? 'Completed'
                : s.status === 'tested_out'
                  ? 'Tested out'
                  : s.status === 'in_progress'
                    ? 'In progress'
                    : accessible
                      ? 'Now boarding'
                      : 'Locked';
            const aria = `${stopLabel} — ${statusCopy}${s.stage === 'sentence' ? ' (sentence stop)' : ''}`;
            const onPress = () => {
              hapticLight();
              if (accessible) {
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
              });
            };
            return (
              <View key={s.id}>
                {/* rail marker (drawn above the track, non-interactive) */}
                <View pointerEvents="none" style={[styles.markerWrap, { left: p.x - 28, top: p.y - 28 }]}>
                  <StationMarker
                    station={s}
                    color={zoneColor}
                    isCurrent={isCurrent}
                    accessible={accessible}
                    background={colors.background}
                    border={colors.border}
                  />
                </View>
                {/* stop card */}
                <View
                  style={[
                    styles.cardSlot,
                    {
                      left: boxLeft,
                      width: boxWidth,
                      top: p.y - STATION_H / 2,
                      alignItems: side === 'left' ? 'flex-end' : 'flex-start',
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={aria}
                    onPress={onPress}
                    style={styles.cardRow}
                  >
                    {side === 'left' && isCurrent && <Mascot pose="cheer" size={44} motion="none" />}
                    <View
                      style={[
                        styles.card,
                        isCurrent && {
                          backgroundColor: stationSurface,
                          borderWidth: 1,
                          borderColor: zoneColor,
                          paddingTop: 14,
                        },
                      ]}
                    >
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
                        {isCurrent && <StationSignGlyph color={zoneColor} />}
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: accessible ? colors.foreground : colors.mutedForeground },
                          ]}
                        >
                          {stopLabel}
                        </Text>
                        {s.stage === 'sentence' && (
                          <View style={[styles.allAccessChip, { backgroundColor: `${colors.secondary}1a` }]}>
                            <Feather name="star" size={9} color={colors.secondary} />
                            <Text style={[styles.allAccessChipText, { color: colors.secondary }]}>
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
                          <View style={[styles.teaserChip, { backgroundColor: zoneColor }]}>
                            <Text style={styles.teaserChipText}>FREE TASTE</Text>
                          </View>
                        )}
                        {!accessible && (
                          <Feather name="lock" size={12} color={colors.mutedForeground} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.cardStatus,
                          isCurrent
                            ? { color: zoneColor, fontFamily: AppFonts.bold }
                            : { color: colors.mutedForeground },
                        ]}
                      >
                        {statusCopy}
                        {!s.attemptedCount ? ` · ${s.phraseCount} phrases` : ''}
                        {isCurrent && ' · Bolo is waiting here'}
                      </Text>
                      {/* Started stops trade the text fraction for a real
                          progress track (web parity). */}
                      {s.attemptedCount ? (
                        <View style={styles.cardProgressRow}>
                          <View
                            style={[
                              styles.cardProgressTrack,
                              { backgroundColor: accessible ? `${zoneColor}26` : colors.muted },
                            ]}
                          >
                            <View
                              testID={`stop-progress-${s.id}`}
                              style={[
                                styles.cardProgressFill,
                                {
                                  width: Math.round(
                                    (Math.min(s.masteredCount ?? 0, s.phraseCount ?? 0) /
                                      Math.max(s.phraseCount ?? 0, 1)) *
                                      CARD_PROGRESS_W,
                                  ),
                                  backgroundColor: accessible
                                    ? zoneColor
                                    : colors.mutedForeground,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.cardProgressLabel,
                              { color: isCurrent ? zoneColor : colors.mutedForeground },
                            ]}
                          >
                            {s.masteredCount}/{s.phraseCount} mastered
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {side === 'right' && isCurrent && <Mascot pose="cheer" size={44} motion="none" />}
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* terminus */}
          <View
            style={[
              styles.terminusOuter,
              {
                left: termX - 14,
                top: termY - 14,
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
          <View
            style={[
              styles.terminusLabelWrap,
              termX > mapW / 2
                ? { left: 12, width: termX - 36, top: termY - 20, alignItems: 'flex-end' }
                : { left: termX + 24, right: 12, top: termY - 20 },
            ]}
          >
            <Text
              style={[
                styles.terminusLabel,
                { color: colors.mutedForeground, textAlign: termX > mapW / 2 ? 'right' : 'left' },
              ]}
            >
              Terminus: {line.zones[5]} —{' '}
              {allDone ? 'journey complete!' : 'the festival finale awaits'}
            </Text>
          </View>
        </View>

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
                  {lock.stopLabel} is a sentence stop — graduate from phrases to
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
  scrollContent: { paddingBottom: 48 },
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
  markerWrap: {
    position: 'absolute',
    width: 56,
    height: 56,
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
  postcardWrap: { position: 'absolute', left: 16, right: 16 },
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
  card: {
    minWidth: 0,
    flexShrink: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
  },
  // Full-width zone-color roof bar across the current stop's card (the
  // signboard's painted roof; web: h-1.5 rounded-t accent bar).
  signboardBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
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
    marginTop: 4,
  },
  cardProgressTrack: {
    width: CARD_PROGRESS_W,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  cardProgressFill: { height: 6, borderRadius: 3 },
  cardProgressLabel: { fontFamily: AppFonts.bold, fontSize: 10 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardTitle: { fontFamily: AppFonts.semibold, fontSize: 14 },
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
  teaserChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: '#ffffff' },
  cardStatus: { fontFamily: AppFonts.semibold, fontSize: 11, marginTop: 2 },
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
