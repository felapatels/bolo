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
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
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
import { CarvedBoard } from '@/components/journey/CarvedBoard';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  stampSizeForExtent,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import { TICKET, TICKET_SHAPE } from '@/lib/ticketStock';
import { ZONE_BOARD, zoneBoardPedimentH } from '@/lib/zoneBackdrops';
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
// THE BODY-TEAR KEYFRAMES ARE GONE, not merely unused. They recoiled the
// pass's left half as the stub came away, which was correct while the card was
// one ticket ripped in two. The card is a carved station board now and a board
// does not flinch: the ticket alone travels. Restoring them means restoring a
// two-paper-halves card, which is a different design, not a tuning value.

const TORN_EDGE_W = 6;

// THE HOME BOARD'S PANEL, IN POINTS, and it is a budget rather than a taste.
// ZONE_BOARD's content insets take about 27% of the panel before a word is
// drawn, and inside what is left the panel has to hold the eyebrow, the
// station name, the stop line, the progress row and the CTA plate, beside a
// ticket that is itself the stamp plus a vertical wordmark. Written out here
// for the same reason journey-board-budget.test.ts writes PC_H out: a board
// that does not fit its content does not look wrong, it looks BLANK, because
// the panel clips. Raise it for real content growth, never lower it to taste.
export const HOME_PANEL_H = 200;
// Home's own column: the tab screen pads its scroll content by 20 a side.
const HOME_CONTENT_PAD = 20;
// THE HERO BLEEDS PAST THAT COLUMN, and the reason is the art rather than a
// preference for a big card. The board's slices carry TRANSPARENT MARGINS on
// both sides, so a board boxed at the column width draws visibly narrower than
// the stats banner above it and the stall card below it, which have none. Asked
// for on sight, then settled a beat later: "can we make the boarding home card
// slightly wider... so it fills the screen" (owner, chat 12). So the bleed is
// the WHOLE column padding: the board's box is the full window width, and the
// art's own transparent margins are what keep a few points of air at each screen
// edge. The bleed is on this wrapper and not on home's padding, because every
// other card on that page is correctly at the column width; only this one is a
// painting with air round its edges.
const HOME_BOARD_BLEED = HOME_CONTENT_PAD;

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

/** Four colour roles for a gold engine. Defined once (ChaiWallet) and passed
 *  through from parents that already hold the tokens query. */
export type TrainGoldPalette = {
  chassis: string;
  body: string;
  trim: string;
  steam: string;
};

export function JourneyPassCard({
  onPress,
  goldPalette,
}: {
  onPress: () => void;
  /** If non-null, the boarding-pass engine renders in First Class gold. */
  goldPalette?: TrainGoldPalette;
}) {
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
  // Face width for the shimmer band's travel (band = 1/3 of the face) and for
  // the board's own geometry. The window minus home's padding is the answer on
  // the first frame; onLayout confirms it and is authoritative after that, so
  // the board never has to render at a guessed width for more than one pass.
  const { width: windowW } = useWindowDimensions();
  const [passW, setPassW] = React.useState(0);
  const boardW =
    passW > 0 ? passW : Math.max(1, windowW - HOME_CONTENT_PAD * 2 + HOME_BOARD_BLEED * 2);
  const pedimentH = zoneBoardPedimentH(boardW);
  const boardH = pedimentH + HOME_PANEL_H;

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
  // Never completed a stop. Derived, not stored: it clears itself the moment the
  // first stop lands, with no flag to go stale and nothing to reset on
  // reinstall. The card reads "Resume", which is wrong for someone who has never
  // begun, and this is the fix for that.
  const firstRun = !journey.isLoading && journey.doneCount === 0;
  const cueBob = useSharedValue(0);
  React.useEffect(() => {
    if (!firstRun || reduceMotion) { cueBob.value = 0; return; }
    cueBob.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [firstRun, reduceMotion, cueBob]);
  const cueStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cueBob.value * 5 }],
  }));
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
    <>
      {/* OUTSIDE the board wrapper on purpose: styles.glow is absolutely
          positioned to fill styles.wrap, so anything added inside stretches
          the accent halo up behind the cue. */}
      {firstRun ? (
        <Animated.View style={[styles.startCue, cueStyle]} pointerEvents="none">
          <Text style={styles.startCueText}>START HERE</Text>
          <Feather name="chevron-down" size={16} color="#FFFFFF" />
        </Animated.View>
      ) : null}
    <Animated.View style={[styles.wrap, breatheStyle]}>
      {/* The glow pulse that lifts the board off the page. Inset just inside
          the board's footprint so the accent layer stays covered and only its
          shadow shows. (iOS shadow; opacity-only animation. Android has no
          transparent-view shadow, which is a device checklist item.) */}
      {idleOn && (
        <Animated.View
          pointerEvents="none"
          testID="pass-glow"
          style={[
            styles.glow,
            {
              // INSET TO THE BOARD'S OPAQUE MIDDLE, and this is the whole
              // reason the numbers are here rather than in the stylesheet.
              // The old pass had a full-bleed accent face, so a glow inset by
              // 1pt was completely covered and only its shadow showed. The
              // carved board's art has TRANSPARENT MARGINS on every side, so
              // the same layer read as a green border painted round the board.
              // Sat under the opaque cream panel instead, only the shadow
              // escapes, which is what the pulse was ever meant to be.
              left: boardW * 0.09,
              right: boardW * 0.09,
              top: pedimentH * 0.62,
              bottom: 10,
              backgroundColor: line.accent,
              shadowColor: line.accent,
            },
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
        style={tearing ? [styles.press, styles.pressTearing] : styles.press}
      >
        <CarvedBoard
          testID="home-carved-board"
          pedimentTestID="home-board-top"
          width={boardW}
          height={boardH}
          nameplate={line.lineName.toUpperCase()}
          plate={
            journey.current ? `ZONE ${journey.current.zoneIndex + 1}` : 'DEPARTURES'
          }
        >
          <View style={styles.row}>
            {/* THE BOARD DOES NOT MOVE. It used to recoil leftward as the
                stub tore away, which was right when the whole card was one
                ticket in two halves: both halves were paper and both had to
                go. A carved station board is bolted to a wall. "The words
                shouldn't drop off the board when the ticket tears, left side
                stays put" (owner, chat 12). Only the ticket travels now, and
                the board is what it is torn FROM. */}
            <View style={styles.body}>
              {/* The brand is native-script ("Bolo Rail" in the learner's own
                  script) and MUST render with the language font or the Latin
                  UI font shows tofu. Same per-script handling as the picker.
                  It is the ACCENT here rather than white-on-green: on cream
                  paper the accent is what an eyebrow is on the zone card. */}
              <Text
                numberOfLines={1}
                style={[
                  styles.eyebrow,
                  { color: line.accent },
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
              {/* THE STATION, exactly as the zone card names one: the city in
                  the board's own ink, not a theme token. The panel is cream in
                  both themes and a cool slate reads cold on it. */}
              <Text numberOfLines={1} style={styles.title}>
                {journey.current ? journey.current.geoName : `Ride the ${line.lineName}`}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {journey.current
                  ? `Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                  : `${line.zones[0]} to ${line.zones[5]}, station by station`}
              </Text>
              {journey.current && journey.current.phraseCount > 0 && (
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: line.accent,
                          width: `${Math.round(
                            (journey.current.masteredCount / journey.current.phraseCount) * 100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {journey.current.masteredCount}/{journey.current.phraseCount}
                  </Text>
                </View>
              )}
              {/* THE DOOR. Same bordered plate the zone card uses for its
                  test-out link, so the two screens offer an action the same
                  way. The engine stands in it rather than up beside the
                  title: it is the train at the platform, and pressing boards
                  it. */}
              <View style={[styles.ctaBtn, { borderColor: line.accent }]}>
                <TrainEngine
                  tint={line.accent}
                  width={34}
                  height={22}
                  motion="drive"
                  palette={goldPalette}
                />
                <Text numberOfLines={2} style={[styles.ctaText, { color: line.accent }]}>
                  {journeyCta}
                </Text>
                <Animated.View style={arrowStyle}>
                  <Feather name="arrow-right" size={15} color={line.accent} />
                </Animated.View>
              </View>
            </View>
            {/* The perforation the ticket is torn along. It hides while
                tearing: the dashed line is replaced by the two jagged edges.
                The bites are the PANEL'S cream, not the page colour, because
                the ticket is lying on the board rather than on the page. */}
            {!tearing && (
              <TicketPerforationV
                dashColor={TICKET.rule}
                // NO EDGE BITES HERE. The notches are drawn to straddle the
                // TOP AND BOTTOM EDGES of a full-height ticket, which is what
                // the old pass was. The ticket is a small object lying on a
                // panel now, so its perforation runs between two points inside
                // the board and the bites landed as two loose dots mid-panel.
                // Transparent keeps the dashed line and drops them.
                holeColor="transparent"
              />
            )}
            {/* YOUR TICKET, CLIPPED TO THE BOARD. The card is a station board
                now (owner, chat 12: "maybe we make it look like the styling of
                the zone cards"), and a board has no stub of its own, so the
                boarding pass survives as a real object lying on it: the line's
                accent against the cream, which is also the one flash of colour
                left on the card. It still tears off, with the same rip, the
                same recorded SFX and the same 500ms navigation. */}
            <Animated.View
              style={[styles.stub, stubTearStyle, tearing && styles.tearHalf]}
            >
              {/* THE TICKET'S OWN PAPER, and it is the app's paper rather than
                  a colour picked to contrast. TICKET was sampled off the
                  owner's element sheet, so the stub is cut from the same stock
                  as every stop card on the map. Cream on cream is what a real
                  ticket lying on a cream board looks like: what separates them
                  is the brown edge, the hairline rule inside it and the small
                  shadow, not a different colour. */}
              <LinearGradient
                pointerEvents="none"
                colors={[TICKET.stockTop, TICKET.stockBottom]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.stubStock}
              />
              {/* The sheet's inner frame, set in from the border. */}
              <View pointerEvents="none" style={styles.stubRule} />
              {/* Fixed slot so the rotated stamp's visual extent is part of
                  the layout: it cannot drift over the perforation or the line
                  name. The stamp size derives from the stub width so label and
                  circle scale as one unit. */}
              <View testID="home-stamp-slot" style={styles.stampSlot}>
                {journey.current && (
                  <ZoneStamp
                    ink={TICKET.ink}
                    zone={journey.current.zoneIndex + 1}
                    name={journey.current.geoName}
                    size={STAMP_SIZE}
                  />
                )}
              </View>
              {/* Vertical line name, web's writing-mode:vertical-rl. The slot
                  reserves the rotated text's true vertical extent; a bare
                  rotated Text only reserves its unrotated ~10px box, which is
                  what let it collide with the stamp. The text is ABSOLUTE
                  inside the slot, because as a flex child react-native-web
                  clamps its width to the 14px slot and truncates the name to
                  one glyph. */}
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
                      // The wordmark is sized to the measured run so it can
                      // NEVER ellipsize: the font fits the extent by
                      // construction. Decorative fitting, so it is pinned
                      // against OS font scaling like the stamp.
                      fontSize: stubWordmark.fontSize,
                      letterSpacing: stubWordmark.fontSize >= 7 ? 1.2 : 0.6,
                      // maxWidth too: react-native-web clamps text to the
                      // parent's width (measured: width:60 computed as 14px).
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
              {tearing && <TornEdge color={TICKET.stockBottom} side="left" />}
            </Animated.View>
          </View>
        </CarvedBoard>
        {/* The shimmer sweep, once per heartbeat. Warm rather than white: a
            white streak on green read as a highlight, and the same streak on
            cream paper and varnished wood reads as light crossing the board.
            Transform-only band, clipped by the press wrapper. */}
        {idleOn && passW > 0 && (
          <Animated.View
            pointerEvents="none"
            testID="pass-shimmer"
            style={[styles.shimmer, { width: passW / 3 }, shimmerStyle]}
          >
            <LinearGradient
              colors={['rgba(255,244,222,0)', 'rgba(255,249,236,0.55)', 'rgba(255,244,222,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmerFill}
            />
          </Animated.View>
        )}
      </PressableScale>
    </Animated.View>
    </>
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
  startCue: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
    backgroundColor: '#4f46e5',
  },
  startCueText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  // Breathe wrapper carries the outer spacing so the glow overlay's inset
  // coordinates match the pass face exactly.
  wrap: { position: 'relative', marginBottom: 12, marginHorizontal: -HOME_BOARD_BLEED },
  // Geometry is applied inline from the board's own measurements: see the
  // call site for why a 1pt inset stopped working when the face became art.
  glow: {
    position: 'absolute',
    borderRadius: 17,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  // NO CARD STOCK OF ITS OWN ANY MORE. The face is the carved board's art, so
  // this is only a clip box for the shimmer and the press scale. It keeps the
  // build-28 belt: the height must stay content-driven, and if any future
  // child measures itself unbounded again this cap stops a full-screen hero
  // from ever shipping. Never remove it; raise it only for real content
  // growth, in step with HOME_PANEL_H.
  press: {
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
    maxHeight: 320,
  },
  // While tearing the clip box opens, so the ticket can sail clear of the
  // board instead of being cut off at its edge.
  pressTearing: { overflow: 'visible' },
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

  tornEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TORN_EDGE_W,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  // The board's own words. No padding of its own: CarvedBoard already insets
  // everything to the drawn frame, and padding here would cross it.
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  // Colour is applied at the call site from the line's accent: an eyebrow over
  // a city is exactly what the zone card's panel does.
  eyebrow: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 1.4 },
  // Nastaliq glyphs cascade above/below the baseline; give the one-line
  // eyebrow enough line height that the brand isn't clipped.
  eyebrowTall: { lineHeight: 24 },
  eyebrowNative: { fontSize: 11, letterSpacing: 0 },
  // The board's ink, not a theme token. The panel is cream in both themes and
  // a cool slate reads cold on it.
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 19,
    lineHeight: 23,
    color: ZONE_BOARD.ink,
    marginTop: 1,
  },
  subtitle: {
    fontFamily: AppFonts.semibold,
    fontSize: 11,
    color: ZONE_BOARD.inkMuted,
    marginTop: 2,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: `${ZONE_BOARD.inkMuted}33`,
    overflow: 'hidden',
  },
  // Fill colour comes from the line at the call site.
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
    color: ZONE_BOARD.inkMuted,
    flexShrink: 0,
  },
  // The same bordered plate the zone card gives its test-out link, so both
  // screens offer an action the same way. Border colour from the line.
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  ctaText: { fontFamily: AppFonts.extrabold, fontSize: 12, lineHeight: 15, flex: 1 },
  // R1: top-anchored column (space-between let the circle drift low when the
  // body side grew taller); the stamp docks under the top padding and the
  // wordmark slot soaks up the remaining run.
  // THE TICKET LYING ON THE BOARD. Its own paper (the line's accent, applied
  // at the call site) and its own corners, because it is a separate object
  // from the board rather than a region of it.
  // THE TICKET LYING ON THE BOARD. Cut from TICKET, the element sheet's own
  // stock, so it is the same paper as every stop card on the map rather than a
  // slab of the line's accent. The edge and the rule are what make it read as
  // a separate object resting on the panel.
  stub: {
    width: STUB_W,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    gap: 6,
    borderRadius: TICKET_SHAPE.radius,
    borderWidth: TICKET_SHAPE.borderWidth,
    borderColor: TICKET.edge,
    overflow: 'hidden',
    backgroundColor: TICKET.stockTop,
    // It is ON the board, not part of it. iOS shadow; Android takes elevation.
    shadowColor: TICKET.ink,
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stubStock: { ...StyleSheet.absoluteFillObject },
  stubRule: {
    position: 'absolute',
    top: TICKET_SHAPE.ruleInset,
    bottom: TICKET_SHAPE.ruleInset,
    left: TICKET_SHAPE.ruleInset,
    right: TICKET_SHAPE.ruleInset,
    borderWidth: 1,
    borderColor: TICKET.rule,
    borderRadius: TICKET_SHAPE.radius - TICKET_SHAPE.ruleInset,
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
    color: TICKET.inkMuted,
    transform: [{ rotate: '90deg' }],
    textAlign: 'center',
  },
});
