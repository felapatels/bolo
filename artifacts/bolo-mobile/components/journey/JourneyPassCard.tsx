// Spec D1b-M: the home boarding-pass hero — a react-native port of the web
// home hero (gujarati-coach/src/pages/home.tsx, P1 v2 item 2: "the journey IS
// the home hero"). A full-width boarding pass in the line's accent, visually
// continuous with the journey screen's ticket-stub header. Carries live state
// (next stop, Stop N of M, progress at the stop) when the zone queries have
// it, and degrades to the generic line blurb when loading, locked, or
// errored. (The web pass also carries streak/goal chips; on mobile those
// already live in the stats banner directly below, so they are not
// duplicated here.)
//
// Build 31 "boarding pass energy" (web parity, same keyframe fractions and
// tuning constants as gujarati-coach/src/index.css):
// - idle breathe (scale 1→1.025, 3.2s), shimmer sweep across the face, and a
//   soft glow pulse lifting the pass off the page — all sharing one heartbeat;
// - drive-and-settle train with rolling wheels + steam (TrainEngine);
// - CTA arrow double-pump on its own 2.4s cycle;
// - progress-aware CTA copy (Start / Resume at Stop N · X to go / Continue);
// - stub tear-off on activation: the stub rips along a jagged edge and sails
//   off while the body recoils; navigation fires at 500ms and is NEVER
//   blocked (reduced motion activates instantly with zero theatrics).
// All idle keyframes start and end at identity, so the reduced-motion frame
// is a clean parked ticket.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { PressableScale } from '@/components/PressableScale';
import { getJourneyLine, getRailBrand } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  stampSizeForExtent,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import { playTearSfx } from '@/lib/tearAudio';
import { loadSoundPref } from '@/lib/soundPref';

// Web tuning constants (index.css :root block + PASS_PRESS_* in home.tsx).
const PASS_CYCLE_MS = 3200; // breathe + shimmer + glow share one heartbeat
const ARROW_CYCLE_MS = 2400; // CTA arrow double-pump
const PASS_BREATHE_SCALE = 1.025;
const PASS_GLOW_MIN = 0.4;
const PASS_GLOW_MAX = 0.95;
const ARROW_SLIDE = 7;
const PASS_PRESS_SCALE = 0.94;
const TEAR_DURATION_MS = 600;
const TEAR_NAV_DELAY_MS = 500; // activation → navigation; never blocked
// After navigation covers the screen, quietly restore the intact pass so the
// learner never returns to a torn/empty hero (mobile keeps home mounted
// under the stack — the web page unmounts instead).
const TEAR_RESET_MS = 1200;
// Stub tear travel (web --tear-* variables).
const TEAR_DISTANCE = 34;
const TEAR_DROP = 10;
const TEAR_ROTATE = 16;
const TEAR_BODY_DISTANCE = -18;
const TEAR_BODY_DROP = 2;
const TEAR_BODY_ROTATE = -3;

const TORN_EDGE_W = 6;

/** Jagged rip outline for a torn half — the RN analogue of the web's static
 *  clip-path polygons (RN has no clip-path; protruding teeth on each half
 *  read as the same imperfect rip once the halves separate). */
function tornEdgePath(w: number, h: number, side: 'left' | 'right'): string {
  const steps = Math.max(3, Math.round(h / 12));
  const seg = h / steps;
  // Hand-jittered tooth depths, mirroring the web clip-path's offsets.
  const jag = [0.8, 0.25, 0.95, 0.4, 0.7, 0.15];
  let d = side === 'right' ? 'M0 0' : `M${w} 0`;
  for (let i = 0; i < steps; i++) {
    const depth = jag[i % jag.length]!;
    const tipX = side === 'right' ? w * depth : w * (1 - depth);
    const baseX = side === 'right' ? 0 : w;
    d += ` L${tipX.toFixed(1)} ${(seg * (i + 0.5)).toFixed(1)} L${baseX} ${(seg * (i + 1)).toFixed(1)}`;
  }
  return `${d} Z`;
}

function TornEdge({ color, side }: { color: string; side: 'left' | 'right' }) {
  const [h, setH] = React.useState(0);
  return (
    <View
      pointerEvents="none"
      testID={`torn-edge-${side}`}
      style={[
        styles.tornEdge,
        side === 'right' ? { right: -(TORN_EDGE_W - 1) } : { left: -(TORN_EDGE_W - 1) },
      ]}
      onLayout={(e) => {
        const hh = Math.round(e.nativeEvent.layout.height);
        if (hh > 0 && hh !== h) setH(hh);
      }}
    >
      {h > 0 && (
        <Svg width={TORN_EDGE_W} height={h}>
          <Path d={tornEdgePath(TORN_EDGE_W, h, side)} fill={color} />
        </Svg>
      )}
    </View>
  );
}

export function JourneyPassCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);
  const brand = getRailBrand(activeLang);
  const reduceMotion = useReducedMotion();
  // The rotated line name reserves real layout space: measure the slot the
  // column gives it and size the text to that extent (see stubLineSlot).
  const [nameExtent, setNameExtent] = React.useState(78);
  // R1 amendment: fitted wordmark - font sized to the measured run, and the
  // string deliberately shortened (whole trailing words) if even the floor
  // font cannot fit. Never an ellipsis, never a mid-word cut.
  const stubWordmark = fitStubWordmark(line.lineName, nameExtent);
  // Face width for the shimmer band's travel (band = 1/3 of the face).
  const [passW, setPassW] = React.useState(0);

  const [tearing, setTearing] = React.useState(false);
  const tearProgress = useSharedValue(0);
  // Synchronous re-press guard: React state commits too late to swallow a
  // rapid double-tap, so the guard is a ref flipped before any scheduling.
  const tearingRef = React.useRef(false);
  // Always navigate with the LATEST onPress — the render-time closure can go
  // stale during the 500ms tear delay if the parent rerenders.
  const onPressRef = React.useRef(onPress);
  onPressRef.current = onPress;
  const timersRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  React.useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    },
    [],
  );
  const schedule = (fn: () => void, ms: number) => {
    const handle: ReturnType<typeof setTimeout> = setTimeout(() => {
      timersRef.current.delete(handle);
      fn();
    }, ms);
    timersRef.current.add(handle);
  };

  const idleOn = !reduceMotion && !tearing;
  const heartbeat = useLoopProgress(PASS_CYCLE_MS, idleOn);
  const arrowLoop = useLoopProgress(ARROW_CYCLE_MS, idleOn);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: idleOn
          ? interpolate(heartbeat.value, [0, 0.5, 1], [1, PASS_BREATHE_SCALE, 1])
          : 1,
      },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      heartbeat.value,
      [0, 0.5, 1],
      [PASS_GLOW_MIN, PASS_GLOW_MAX, PASS_GLOW_MIN],
    ),
  }));
  // Web ticket-shimmer: translateX -150% → 450% (of the band) over the first
  // 45% of the heartbeat, then rests off-face until the next cycle.
  const shimmerStyle = useAnimatedStyle(() => {
    const w = passW / 3;
    return {
      transform: [
        {
          translateX: interpolate(
            heartbeat.value,
            [0, 0.45, 1],
            [-1.5 * w, 4.5 * w, 4.5 * w],
          ),
        },
        { skewX: '-14deg' },
      ],
    };
  });
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: idleOn
          ? interpolate(
              arrowLoop.value,
              [0, 0.55, 0.65, 0.75, 0.85, 1],
              [0, 0, ARROW_SLIDE, 2, ARROW_SLIDE, 0],
            )
          : 0,
      },
    ],
  }));
  // Both halves grip at the perforation (16%) before giving way — the web
  // stub-tear/body-tear keyframes on the shared tear progress.
  const stubTearStyle = useAnimatedStyle(() => {
    const t = tearProgress.value;
    return {
      opacity: interpolate(t, [0, 0.8, 1], [1, 1, 0]),
      transform: [
        {
          translateX: interpolate(
            t,
            [0, 0.16, 0.45, 1],
            [0, 1.5, TEAR_DISTANCE * 0.35, TEAR_DISTANCE],
          ),
        },
        {
          translateY: interpolate(t, [0, 0.16, 0.45, 1], [0, 0, TEAR_DROP * 0.25, TEAR_DROP]),
        },
        {
          rotate: `${interpolate(
            t,
            [0, 0.16, 0.45, 1],
            [0, -2.5, TEAR_ROTATE * 0.55, TEAR_ROTATE],
          )}deg`,
        },
      ],
    };
  });
  const bodyTearStyle = useAnimatedStyle(() => {
    const t = tearProgress.value;
    return {
      transform: [
        { translateX: interpolate(t, [0, 0.16, 1], [0, 1, TEAR_BODY_DISTANCE]) },
        { translateY: interpolate(t, [0, 0.16, 1], [0, 0, TEAR_BODY_DROP]) },
        { rotate: `${interpolate(t, [0, 0.16, 1], [0, 0.6, TEAR_BODY_ROTATE])}deg` },
      ],
    };
  });

  // Pass activation: navigation is NEVER blocked — reduced motion (or any
  // animation-path oddity) activates instantly; otherwise the tear plays and
  // navigation fires at the 500ms mark while the tail of the tear finishes
  // under the incoming screen.
  const handleActivate = () => {
    if (tearingRef.current) return;
    if (reduceMotion) {
      onPressRef.current();
      return;
    }
    // R4: the recorded paper-tear SFX fires at the exact tear start, in the
    // same beat as PressableScale's press haptic. Fire-and-forget: it never
    // delays the tear or the scheduled navigation, and it sits AFTER the
    // reduceMotion early-return, so reduced motion stays instant and silent.
    loadSoundPref().then(on => { if (on) playTearSfx(); });
    tearingRef.current = true;
    setTearing(true);
    tearProgress.value = 0;
    tearProgress.value = withTiming(1, {
      duration: TEAR_DURATION_MS,
      easing: Easing.bezier(0.3, 0.1, 0.6, 1),
    });
    schedule(() => onPressRef.current(), TEAR_NAV_DELAY_MS);
    schedule(() => {
      tearingRef.current = false;
      setTearing(false);
      tearProgress.value = 0;
    }, TEAR_RESET_MS);
  };

  // Progress-aware CTA (web home.tsx journeyCta): uses only the data the
  // pass already receives from useJourneyProgress; when the current stop is
  // unknown (loading, locked, errored) the copy falls back to generic verbs.
  const hasJourneyProgress = Boolean(journey.current?.started) || journey.doneCount > 0;
  const phrasesLeftAtStop = journey.current
    ? Math.max(journey.current.phraseCount - journey.current.masteredCount, 0)
    : 0;
  const journeyCta = !hasJourneyProgress
    ? 'Start your journey'
    : journey.current
      ? `Resume at Stop ${journey.current.stopNumber}${
          phrasesLeftAtStop > 0
            ? ` · ${phrasesLeftAtStop} ${phrasesLeftAtStop === 1 ? 'phrase' : 'phrases'} to go`
            : ''
        }`
      : journey.planBlocked
        ? 'Unlock your next stop with All-Access'
        : 'Continue your journey';

  return (
    <Animated.View style={[styles.wrap, breatheStyle]}>
      {/* Soft glow pulse lifting the pass off the page. Sits just inside the
          card footprint so the accent-colored layer stays fully covered by
          the pass face; only its shadow shows. (iOS shadow; opacity-only
          animation. Android has no transparent-view shadow — device
          checklist item.) */}
      {idleOn && (
        <Animated.View
          pointerEvents="none"
          testID="pass-glow"
          style={[
            styles.glow,
            { backgroundColor: line.accent, shadowColor: line.accent },
            glowStyle,
          ]}
        />
      )}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Ride the ${line.lineName}: open the journey map`}
        onPress={handleActivate}
        scaleTo={PASS_PRESS_SCALE}
        testID="journey-pass-card"
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== passW) setPassW(w);
        }}
        style={[styles.pass, tearing ? styles.passTearing : { backgroundColor: line.accent }]}
      >
        {/* full-ticket stock — hidden while tearing (halves carry their own) */}
        {!tearing && <TicketStripes ink="rgba(255,255,255,0.05)" />}
        {/* shimmer sweep across the ticket face, once per heartbeat
            (transform-only band; the pass's overflow hidden clips it) */}
        {idleOn && passW > 0 && (
          <Animated.View
            pointerEvents="none"
            testID="pass-shimmer"
            style={[styles.shimmer, { width: passW / 3 }, shimmerStyle]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmerFill}
            />
          </Animated.View>
        )}
        <View style={styles.row}>
          {/* main body (recoils away leftward while the stub tears off; while
              tearing it carries its own ticket stock + rounded left corners
              so it reads as a torn half of the pass) */}
          <Animated.View
            style={[
              styles.body,
              bodyTearStyle,
              tearing && [styles.tearHalf, styles.bodyTearing, { backgroundColor: line.accent }],
            ]}
          >
            <View style={styles.top}>
              <View style={styles.topText}>
                {/* The brand is native-script ("Bolo Rail" in the learner's own
                    script) — it MUST render with the language font or the Latin
                    UI font shows tofu. Same per-script handling as the picker. */}
                <Text
                  style={[
                    styles.eyebrow,
                    brand.native && isTallCascadingScript(activeLanguage)
                      ? styles.eyebrowTall
                      : null,
                  ]}
                >
                  BOARDING PASS ·{' '}
                  <Text
                    style={
                      brand.native
                        ? [styles.eyebrowNative, nativeTextStyle(activeLanguage, { bold: true })]
                        : null
                    }
                  >
                    {brand.text}
                  </Text>
                </Text>
                <Text style={styles.title}>Ride the {line.lineName}</Text>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {journey.current
                    ? `Next stop: ${journey.current.geoName} · Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                    : `${line.zones[0]} to ${line.zones[5]}, station by station`}
                </Text>
              </View>
              <TrainEngine tint="#ffffff" width={56} height={37} motion="drive" />
            </View>
            {journey.current && journey.current.phraseCount > 0 && (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(
                          (journey.current.masteredCount / journey.current.phraseCount) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {journey.current.masteredCount}/{journey.current.phraseCount} at this stop
                </Text>
              </View>
            )}
            {/* ticket perforation (dashed line + edge notch) */}
            <View style={styles.perfRow}>
              <View style={[styles.perfNotch, { backgroundColor: colors.background }]} />
              <View style={styles.perfLine} />
            </View>
            <View style={styles.ctaRow}>
              <Text style={styles.ctaText}>{journeyCta}</Text>
              <Animated.View style={arrowStyle}>
                <Feather name="arrow-right" size={16} color="#ffffff" />
              </Animated.View>
            </View>
            {tearing && <TornEdge color={line.accent} side="right" />}
          </Animated.View>
          {/* tear-off stub: perforation with notches (edge bites), fare-zone
              stamp, vertical line name. No floating punch dot — cutout circles
              only ever straddle card edges (approved ruling; the web punch hole
              was dropped from the port for the same reason). The perforation
              hides while tearing: the dashed line is replaced by the two
              jagged torn edges. */}
          {!tearing && (
            <TicketPerforationV
              dashColor="rgba(255,255,255,0.4)"
              holeColor={colors.background}
            />
          )}
          <Animated.View
            style={[
              styles.stub,
              stubTearStyle,
              tearing && [styles.tearHalf, styles.stubTearing, { backgroundColor: line.accent }],
            ]}
          >
            {/* Fixed slot so the rotated stamp's visual extent is part of the
                layout — it can't drift over the perforation or the line name.
                R1: the stamp size derives from the stub width (label + circle
                scale as a unit), instead of a hardcoded 48 that ignored the
                column it lives in. */}
            <View testID="home-stamp-slot" style={styles.stampSlot}>
              {journey.current && (
                <ZoneStamp
                  ink="rgba(255,255,255,0.8)"
                  zone={journey.current.zoneIndex + 1}
                  name={journey.current.geoName}
                  size={STAMP_SIZE}
                />
              )}
            </View>
            {/* Vertical line name, web's writing-mode:vertical-rl composition:
                the slot reserves the rotated text's true vertical extent (a bare
                rotated Text only reserves its unrotated ~10px box, which is what
                let it collide with the stamp). The text is ABSOLUTE inside the
                slot: as a flex child react-native-web clamps its width to the
                14px slot (measured empirically), truncating the name to one
                glyph. Sized `nameExtent` wide × 14 tall and offset so its center
                matches the slot's, the 90° rotation makes it fill the slot's
                vertical strip exactly — on native and web alike. */}
            <View
              testID="stub-line-slot"
              style={styles.stubLineSlot}
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 20 && h !== nameExtent) setNameExtent(h);
              }}
            >
              <Text
                testID="stub-line-name"
                allowFontScaling={false}
                style={[
                  styles.stubLine,
                  {
                    // R1: the wordmark is sized to the measured run so it can
                    // NEVER ellipsize — font fits the extent by construction
                    // (numberOfLines + fixed 8px used to truncate "GUJARAT
                    // EXPRESS" on short cards). Decorative fitting: pinned
                    // against OS font scaling like the stamp.
                    fontSize: stubWordmark.fontSize,
                    letterSpacing: stubWordmark.fontSize >= 7 ? 1.2 : 0.6,
                    // maxWidth too: react-native-web clamps text to the parent's
                    // width (measured: width:60 computed as 14px without it).
                    width: nameExtent,
                    maxWidth: nameExtent,
                    left: (STUB_LINE_SLOT_W - nameExtent) / 2,
                    top: (nameExtent - STUB_LINE_SLOT_W) / 2,
                  },
                ]}
              >
                {stubWordmark.text}
              </Text>
            </View>
            {tearing && <TornEdge color={line.accent} side="left" />}
          </Animated.View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

// Width of the vertical line-name slot; also the rotated text's line height,
// so the offset math in the render centers it exactly.
const STUB_LINE_SLOT_W = 14;

// R1: the stub column's fixed width, and the stamp that fits it. The stamp's
// ROTATED extent (not its nominal square) must clear the column with a 4px
// margin per side, so label + circle scale as one unit to the stub.
const STUB_W = 64;
const STAMP_SIZE = stampSizeForExtent(STUB_W - 8);

// R1: fit the vertical wordmark's font to the measured vertical run.
// 0.75em per uppercase extrabold glyph (tracking included in the margin);
// clamped to 5..8 so degenerate measurements stay legible, never ellipsized.
export function stubLineFontSize(lineName: string, extent: number): number {
  const glyphs = Math.max(1, lineName.trim().length);
  return Math.max(5, Math.min(8, (extent - 8) / (glyphs * 0.75)));
}

// R1 amendment (rule 3, shared with web): when even the floor font overflows
// the measured run (24-28 glyph line names like "Darjeeling Himalayan
// Railway" on short cards), shorten the string DELIBERATELY by dropping
// trailing words - never an ellipsis, never a mid-word cut. extent <= 0
// keeps the full name (unmeasured render).
export function fitStubWordmark(
  lineName: string,
  extent: number,
): { text: string; fontSize: number } {
  const full = lineName.trim().toUpperCase();
  let words = full.split(/\s+/);
  let fontSize = stubLineFontSize(full, extent);
  if (extent <= 0) return { text: full, fontSize };
  const run = (text: string, px: number) => text.length * px * 0.75 + 8;
  while (words.length > 1 && run(words.join(' '), fontSize) > extent) {
    words = words.slice(0, -1);
    fontSize = stubLineFontSize(words.join(' '), extent);
  }
  return { text: words.join(' '), fontSize };
}

const styles = StyleSheet.create({
  // Breathe wrapper carries the outer spacing so the glow overlay's inset
  // coordinates match the pass face exactly.
  wrap: { position: 'relative', marginBottom: 12 },
  glow: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    bottom: 1,
    borderRadius: 23,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  pass: {
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    // Belt for the build-28 native regression (see TicketParts sizing
    // contract): the card's height must stay content-driven (~165-190px).
    // If any future child measures itself unbounded again, this cap stops a
    // full-screen ticket from ever shipping. Never remove it; raise it only
    // for real content growth.
    maxHeight: 240,
  },
  // While tearing, the container itself disappears (transparent, no
  // clipping): the widening gap between the two departing halves shows the
  // actual page behind the pass, so it reads as a ticket floating over the
  // page.
  passTearing: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  shimmerFill: { flex: 1 },
  // A torn-off half carries its own card stock, rounded outer corners, and a
  // free-floating drop shadow (web: filter: drop-shadow on the halves).
  tearHalf: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bodyTearing: {
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  stubTearing: {
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
  },
  tornEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TORN_EDGE_W,
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  body: { flex: 1, minWidth: 0 },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  topText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.8)',
  },
  // Nastaliq glyphs cascade above/below the baseline; give the one-line
  // eyebrow enough line height that the brand isn't clipped.
  eyebrowTall: { lineHeight: 24 },
  eyebrowNative: { fontSize: 11, letterSpacing: 0 },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 22,
    color: '#ffffff',
    marginTop: 2,
  },
  subtitle: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  progressText: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    flexShrink: 0,
  },
  perfRow: {
    position: 'relative',
    marginTop: 12,
    justifyContent: 'center',
  },
  perfNotch: {
    position: 'absolute',
    left: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -9,
  },
  perfLine: {
    marginHorizontal: 18,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
  },
  ctaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#ffffff', flexShrink: 1 },
  // R1: top-anchored column (space-between let the circle drift low when the
  // body side grew taller); the stamp docks under the top padding and the
  // wordmark slot soaks up the remaining run.
  stub: {
    width: STUB_W,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    gap: 6,
  },
  // Centers the stamp inside its full rotated visual extent (the -12 degree
  // tilt makes the bounding box ~1.19x; an exact-size slot clips the
  // corners). Derived from STAMP_SIZE so it always clears the perforation.
  stampSlot: {
    width: zoneStampExtent(STAMP_SIZE),
    height: zoneStampExtent(STAMP_SIZE),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Reserves the vertical strip the rotated name occupies; grows to soak up
  // whatever height the body gives the stub so long names get maximum run.
  stubLineSlot: {
    flexGrow: 1,
    minHeight: 60,
    width: STUB_LINE_SLOT_W,
    position: 'relative',
  },
  // Font size + tracking computed per measured extent in the render (R1).
  stubLine: {
    position: 'absolute',
    fontFamily: AppFonts.extrabold,
    lineHeight: STUB_LINE_SLOT_W,
    color: 'rgba(255,255,255,0.7)',
    transform: [{ rotate: '90deg' }],
    textAlign: 'center',
  },
});
