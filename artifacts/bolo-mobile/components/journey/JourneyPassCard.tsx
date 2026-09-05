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
import { Image, StyleSheet, Text, View } from 'react-native';
import { useContentWidth } from '@/lib/contentWidth';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { JOURNEY_ZONES, getJourneyLine, getRailBrand } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { playStopSplash } from '@/lib/stopSplash';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { PARCHMENT_TOP, ParchmentPass } from '@/components/journey/ParchmentPass';
import { RailTicket, TICKET as RAIL } from '@/components/journey/RailTicket';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketStripes,
  ZoneStamp,
  stampSizeForExtent,
  zoneStampExtent,
} from '@/components/journey/TicketParts';
import { BADGE, TICKET, TICKET_SHAPE } from '@/lib/ticketStock';
import { ZONE_BOARD } from '@/lib/zoneBackdrops';
import { StopDots } from './StopDots';
import { ChaiGlyph } from '@/components/ChaiStall';
import { playTearSfx } from '@/lib/tearAudio';
import { loadSoundPref } from '@/lib/soundPref';

// Web tuning constants (index.css :root block + PASS_PRESS_* in home.tsx).
// Exported for AttentionPulse (build 21): home's View Map glow rides this
// same heartbeat, because a second rate beside the pass "feels messy" (owner).
export const PASS_CYCLE_MS = 3200; // breathe + shimmer + glow share one heartbeat
const ARROW_CYCLE_MS = 2400; // CTA arrow double-pump
const PASS_BREATHE_SCALE = 1.025;
const PASS_GLOW_MIN = 0.4;
const PASS_GLOW_MAX = 0.95;
const ARROW_SLIDE = 7;
const PASS_PRESS_SCALE = 0.94;
const TEAR_DURATION_MS = 600;
const TEAR_NAV_DELAY_MS = 500; // activation → navigation; never blocked
/** THE FILM WAITS FOR THE TEAR (build 22, owner: "the ticket tear doesn't
 *  happen now"). Build 21 started the journey's arrival film at the tear's
 *  first frame, and the film's fade covered the pass before the stub had
 *  moved a point: recorded at 8fps, the stub never left its seat. A third
 *  of a second of tear shows first; the film then dissolves in while the
 *  stub is still sailing, ahead of the navigation at 500. */
const TEAR_SPLASH_DELAY_MS = 320;
// After navigation covers the screen, quietly restore the intact pass so the
// learner never returns to a torn/empty hero (mobile keeps home mounted
// under the stack — the web page unmounts instead).
const TEAR_RESET_MS = 1200;
// Stub tear travel (web --tear-* variables).
// IT TEARS, IT DOES NOT FLY. First these were 34 and the halves never cleared
// the board's frame; then 120 and they shot off the card: "ticket moves too
// fast too far after tear, just tear and leave it there" (owner, chat 12).
// What a tear actually looks like is a small gap opening and the two halves
// settling slightly askew, so that is what these are now. THE HALVES DO NOT
// FADE EITHER: the torn ticket stays on the board, visible, until the reset
// window quietly restores it under the incoming screen.
const TEAR_DISTANCE = 16;
const TEAR_DROP = 5;
const TEAR_ROTATE = 5;
// THE TICKET'S LEFT HALF TRAVELS TOO, and these came BACK on purpose after
// being retired earlier the same session. They were retired because they moved
// the BOARD: "the words shouldn't drop off the board when the ticket tears,
// left side stays put", and a carved board bolted to a wall does not flinch.
// That still holds and the board still does not move.
//
// What moves now is the ticket's own left half. Once the stub became a real
// ticket with a body and a perforation, a stub tearing off it wanted the other
// half to give way as paper does: "bonus if both sides fall off" (owner, chat
// 12). Same keyframes, a different object.
const TICKET_BODY_DISTANCE = -9;
const TICKET_BODY_DROP = 3;
const TICKET_BODY_ROTATE = -2.5;

const TORN_EDGE_W = 6;

// THE HOME BOARD'S PANEL, IN POINTS, and it is a budget rather than a taste.
// ZONE_BOARD's content insets take about 27% of the panel before a word is
// drawn, and inside what is left the panel has to hold the eyebrow, the
// station name, the stop line, the progress row and the CTA plate, beside a
// ticket that is itself the stamp plus a vertical wordmark. Written out here
// for the same reason journey-board-budget.test.ts writes PC_H out: a board
// that does not fit its content does not look wrong, it looks BLANK, because
// the panel clips. Raise it for real content growth, never lower it to taste.
// 222 WAS 200 (build 21, the owner's home mockup): the CTA row grew from a
// 22pt line of type to a 38pt filled Resume button, and the panel clips, so
// the extra 18 is the button's own height plus a little. Checked on the
// simulator with the populated Hindi pass: nothing clipped at 222, and the
// CTA row's foot cleared the frame's inner rule. Raise for real growth,
// never lower to taste.
export const HOME_PANEL_H = 222;
// Home's own column: the tab screen pads its scroll content by 20 a side.
/** The ticket face, on. False puts the parchment sheet back, unchanged. */
const RAIL_TICKET_FACE = false;
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
// Home's "Your Journey" frame nets out to 2.5 INSIDE the content pad on each
// side: it bleeds 8 past the pad, then spends 1.5 on its border and 4 on its
// padding. Only the first-frame guess reads it; the wrap's onLayout is
// authoritative after that.
const HOME_FRAME_INSET = -2.5;

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
  bleed = true,
  onPress,
  goldPalette,
}: {
  onPress: () => void;
  /** If non-null, the boarding-pass engine renders in First Class gold. */
  /**
   * Bleed to the screen edge (the default, what the pass has always done) or
   * sit inside whatever frames it. Home frames it in a "Your Journey" card
   * from build 17 and passes false; the glow and shimmer are unaffected.
   */
  bleed?: boolean;
  goldPalette?: TrainGoldPalette;
}) {
  const colors = useColors();
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);
  const brand = getRailBrand(activeLang);
  const reduceMotion = useReducedMotion();
  // Face width for the shimmer band's travel (band = 1/3 of the face) and for
  // the board's own geometry. The window minus home's padding is the answer on
  // the first frame; onLayout confirms it and is authoritative after that, so
  // the board never has to render at a guessed width for more than one pass.
  const windowW = useContentWidth() /* the column, not the window: build 25 */;
  const [passW, setPassW] = React.useState(0);
  // The station name's own column, measured. Derived width would have to know
  // the ticket, the gap and both content insets, and it is the one number the
  // fit depends on.
  const [titleW, setTitleW] = React.useState(0);
  // MEASURED ON THE WRAP, NOT THE PRESS (build 17). The press is centred and
  // sized by the board, so measuring it only ever read back whatever width
  // the board had guessed: inside home's "Your Journey" frame the full-bleed
  // guess became the measurement and the board poked through both sides of
  // the frame. The wrap is what the parent constrains, so it is the truth.
  const boardW =
    passW > 0
      ? passW
      : Math.max(
          1,
          windowW - HOME_CONTENT_PAD * 2 + (bleed ? HOME_BOARD_BLEED * 2 : -HOME_FRAME_INSET * 2),
        );
  // THE PARCHMENT (build 21): the plate's overhang and the zone line above
  // the panel, where the carved pediment used to be.
  const boardH = PARCHMENT_TOP + HOME_PANEL_H;

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

  // The breathe and the art's own off-centre correction share one transform,
  // because `transform` is a single property: a second style object carrying
  // its own array would replace this one outright rather than merge with it.
  const breatheStyle = useAnimatedStyle(() => ({
    transform: [
      // No art nudge any more (build 21): the carved board's painted margins
      // were unequal and the whole pass slid right to compensate; the parchment
      // is symmetric and sits centred in the frame (owner: "it needs to move
      // very slightly to the left to be centered inside the outer box").
      { translateX: 0 },
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
  const ticketBodyTearStyle = useAnimatedStyle(() => {
    const t = tearProgress.value;
    return {
      transform: [
        { translateX: interpolate(t, [0, 0.16, 0.45, 1], [0, -1.5, TICKET_BODY_DISTANCE * 0.35, TICKET_BODY_DISTANCE]) },
        { translateY: interpolate(t, [0, 0.16, 0.45, 1], [0, 0, TICKET_BODY_DROP * 0.25, TICKET_BODY_DROP]) },
        { rotate: `${interpolate(t, [0, 0.16, 0.45, 1], [0, 2.5, TICKET_BODY_ROTATE * 0.55, TICKET_BODY_ROTATE])}deg` },
      ],
    };
  });
  const stubTearStyle = useAnimatedStyle(() => {
    const t = tearProgress.value;
    return {
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
  // THE ARRIVAL FILM STARTS HERE, AT THE TEAR, NOT WHEN THE JOURNEY MOUNTS
  // (build 21, owner: "the click from boarding pass to journey still feels
  // choppy, can't we crossfade the homepage with the splash that plays?").
  // The journey used to start its own zone film only once its queries
  // resolved, so the learner saw home dissolve into a bare loading screen and
  // THEN the film fade in: two dissolves with a stall between them. The
  // overlay lives at the root above the stack, so started here it covers the
  // navigation and the map build, and home dissolves straight into the
  // scene. The journey sees the film already up for its zone and stands
  // down (currentStopSplashZone). Journey 1's zone ids are the six in
  // JOURNEY_ZONES; with no current stop there is no zone to name and the
  // journey keeps its own arrival.
  const arrivalZoneId = journey.current
    ? (JOURNEY_ZONES[journey.current.zoneIndex]?.id ?? null)
    : null;
  const handleActivate = () => {
    if (tearingRef.current) return;
    if (reduceMotion) {
      // No tear to wait for: the film and the navigation come at once.
      if (arrivalZoneId != null) playStopSplash(arrivalZoneId);
      onPressRef.current();
      return;
    }
    schedule(() => {
      if (arrivalZoneId != null) playStopSplash(arrivalZoneId);
    }, TEAR_SPLASH_DELAY_MS);
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
  // THE VERB, AND NOTHING THE BOARD ALREADY SAYS. It used to read "Resume at
  // Stop 5 · 10 phrases to go", which wrapped to two lines in the plate and
  // repeated the two things sitting directly above it: "Stop 5 of 11" and the
  // progress bar. "Just make next to the train say Resume in bigger letters, it
  // already shows they are on stop 5 and the progress" (owner, chat 12).
  //
  // planBlocked keeps its words. It is the one state where the board above says
  // nothing useful, because there IS no current stop to name, so a bare verb
  // would leave a learner staring at a button with no reason attached.
  const journeyCta = !hasJourneyProgress
    ? 'Start'
    : journey.current
      ? 'Resume'
      : journey.planBlocked
        ? 'Unlock with All-Access'
        : 'Continue';
  // THE SECOND LINE IN THE PLATE. The verb alone left a wide button mostly
  // empty once the ticket went landscape and the plate got the whole panel
  // back: "add the text back to the button after Resume, Only 6 more stops to
  // go, or whatever was there so it fills the button" (owner, chat 12).
  //
  // STOPS LEFT IN THE ZONE, not phrases at this stop, and that is the change
  // rather than a restoration. The old sentence counted phrases, which the
  // progress bar directly above now draws; stops left is the one number
  // nothing else on the card says. It counts against stopCount, which is the
  // MAP's row count, so "6 more" means six more rows the learner will actually
  // scroll past rather than six lesson groups the payload happens to hold.
  const stopsLeftInZone = journey.current
    ? Math.max(journey.current.stopCount - journey.current.stopNumber, 0)
    : 0;
  /**
   * THE CHAI PROMISE RIDES IN THE BUTTON (owner, 2026-08-28: "just add the text
   * in the resume button text", after a standalone line under the progress bar
   * turned out to be invisible against the ticket art).
   *
   * IT SAYS "SURPRISES" ON PURPOSE, and that is not padding. Chai on the
   * journey is not only the predictable 10 for finishing a zone: Chacha-ji
   * turns up trackside every fourth station with a gift (chachaEncounters.ts,
   * ENCOUNTER_STRIDE 4), clearing a signal pays, and a capstone pays more. A
   * learner who is told only about the zone bonus will not notice the rest, and
   * the unexpected ones are the ones worth riding for.
   *
   * The stop count stays: it is the one number nothing else on the card says.
   */
  const journeyCtaTail = !journey.current
    ? null
    : stopsLeftInZone === 0
      ? 'Last stop in this zone! Chai and surprises along the way.'
      : `Only ${stopsLeftInZone} more ${stopsLeftInZone === 1 ? 'stop' : 'stops'} to go. Chai and surprises along the way.`;

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
    <Animated.View
      style={[styles.wrap, bleed ? null : styles.wrapFramed, breatheStyle]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== passW) setPassW(w);
      }}
    >
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
              left: boardW * 0.12,
              right: boardW * 0.12,
              // Well under the paper, which starts half a plate down (build 21):
              // the torn edge is ragged, so the glow sits clear of it.
              top: PARCHMENT_TOP * 0.6,
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
        style={tearing ? [styles.press, styles.pressTearing] : styles.press}
      >
        {/* THE PARCHMENT, NOT THE CARVED BOARD (build 21, the owner's home
            mockup: "change the actual pass to the parchment paper look in my
            example, and the icon landmark seeping through"). The board with
            its pediment stays the journey's zone header; the pass is a sheet
            of aged paper with a brass nameplate on its top edge. Open for the
            length of the tear, as the board was. */}
        {/* THE RAIL TICKET (owner, 2026-09-05, spec handed over as a component
            and a stylesheet). Behind RAIL_TICKET_FACE so the parchment is one
            word away: it is still the twin the web home draws, and it is the
            fallback if this is not what was meant. */}
        {RAIL_TICKET_FACE ? (
          <RailTicket
            testID="home-rail-ticket"
            width={boardW}
            height={boardH}
            line={line.lineName}
            city={journey.current ? journey.current.geoName : line.zones[0]}
            zone={journey.current ? journey.current.zoneIndex + 1 : 1}
            stop={journey.current ? journey.current.stopNumber : 1}
            totalStops={journey.current ? journey.current.stopCount : 12}
            platform={journey.current ? journey.current.zoneIndex + 1 : 1}
          />
        ) : (
        <ParchmentPass
          testID="home-parchment-pass"
          width={boardW}
          height={boardH}
          nameplate={line.lineName}
          plate={journey.current ? `ZONE ${journey.current.zoneIndex + 1}` : 'DEPARTURES'}
          landmark={journey.current ? journey.current.geoName : line.zones[0]}
          clipContent={!tearing}
        >
          {/* THE FRAME IS NOT SYMMETRIC, SO THE CONTENT BOX CANNOT BE EITHER.
              CarvedBoard insets its content by ZONE_BOARD.contentInset, one
              number on both sides, but the panel ART has a 3.68% transparent
              margin on the left against 5.39% on the right, so the DRAWN frame
              sits further in on the right than on the left. At the journey's
              width nobody could see it; full bleed, the ticket and the plate
              ran up against the frame line: "the resume button and ticket
              overlap the right border" (owner, chat 12). The pad is exactly
              that asymmetry, off the same two numbers, so re-cutting the art
              moves it rather than leaving a stale correction. */}
          <View style={styles.body}>
            {/* THE BOARD'S TOP LINE, with the ticket lying in the corner beside
                it. The ticket was a full-height column down the right and it
                pushed everything under it into a narrow run: "no I want it
                horizontal in that area... above the progress bar" (owner, chat
                12). Landscape in the corner, the progress bar and the plate get
                the whole panel back. */}
            <View style={styles.topRow}>
              <View
                style={styles.topText}
                onLayout={(e) => {
                  const w = Math.round(e.nativeEvent.layout.width);
                  if (w > 0 && w !== titleW) setTitleW(w);
                }}
              >
                {/* The brand is native-script ("Bolo Rail" in the learner's own
                    script) and MUST render with the language font or the Latin
                    UI font shows tofu. Same per-script handling as the picker.
                    The board's ink, not the line's accent: see the retheme. */}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.eyebrow,
                    // THE HYBRID TICKET (owner's mockup, build 17): the pass
                    // keeps its paper and takes the app's purple for its
                    // accents, so it reads as part of the app rather than as a
                    // prop from another one. The eyebrow, the station dots and
                    // the verb are the accents; the ink stays for the copy.
                    { color: colors.primary },
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
                <Text
                  numberOfLines={2}
                  style={[
                    styles.title,
                    (() => {
                      const size = stationFontSize(
                        journey.current ? journey.current.geoName : line.lineName,
                        titleW,
                      );
                      return { fontSize: size, lineHeight: Math.round(size * 1.2) };
                    })(),
                  ]}
                >
                  {journey.current ? journey.current.geoName : `Ride the ${line.lineName}`}
                </Text>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {journey.current
                    ? `Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                    : `${line.zones[0]} to ${line.zones[5]}, station by station`}
                </Text>
              </View>
              {/* A WHOLE TICKET, NOT A TORN-OFF STRIP, and it lies landscape in
                  the corner. It was a bare vertical stub, a stamp with the
                  line's name rotated beside it, which read as crammed in a
                  column that tall: "this area can fit a full smaller ticket
                  with stub, only keep stamp on stub".
                  IT DOES NOT REPEAT THE BOARD. The station and the stop are
                  named six points to its left, so the ticket carries its own
                  furniture instead: what it admits, and which line it admits
                  you to.
                  THE BOARD'S OWN PERFORATION WENT WITH THIS. A dashed line
                  between the board and the ticket said they were two halves of
                  one piece of paper, which was true of the old pass and is not
                  true of a ticket lying on a carved board. The only perforation
                  left is the ticket's own. */}
              <View style={styles.ticket}>
                {/* THE LEFT HALF. Its own paper, its own three borders and its
                    own rounded outer corners: the middle edge is square and
                    borderless so the two halves read as ONE ticket at rest and
                    as two pieces of paper the moment they part. */}
                {/* THE OUTLINE IS THE APP'S INDIGO (build 22, owner: "change
                    the dark black outline to the same blue/purple color
                    weaved throughout the pass and journey"). The stock, the
                    rules and the stamp keep their ink; only the cut edge and
                    the notches that continue it take the primary. */}
                <Animated.View
                  style={[
                    styles.ticketHalf,
                    { borderColor: RAIL.gold },
                    styles.ticketBody,
                    ticketBodyTearStyle,
                    tearing && [styles.tearHalf, styles.ticketBodyTorn],
                  ]}
                >
                  {/* THE TICKET'S OWN PAPER, and it is the app's paper rather
                      than a colour picked to contrast. TICKET was sampled off
                      the owner's element sheet, so the ticket is cut from the
                      same stock as every stop card on the map. Cream on cream
                      is what a real ticket lying on a cream board looks like:
                      what separates them is the brown edge, the hairline rule
                      inside it and the small shadow, not a different colour. */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={[TICKET.stockTop, TICKET.stockBottom]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.stubStock}
                  />
                  <View pointerEvents="none" style={styles.halfRule}>
                    <View style={styles.halfRuleInner} />
                  </View>
                  {/* HALF A BITE EACH. A real ticket is notched where it tears,
                      so each half carries a disc of the PANEL'S cream pushed
                      past its own inner edge; `overflow: hidden` crops it to a
                      quarter, and the stub's mirror image completes the
                      semicircle. Two of them, top and bottom.
                      A cutout may only ever straddle an EDGE, which is the
                      standing ruling that took the floating punch hole out of
                      this card and off the web twin. */}
                  <View pointerEvents="none" style={[styles.notch, { borderColor: RAIL.gold }, styles.notchBodyTop]} />
                  <View pointerEvents="none" style={[styles.notch, { borderColor: RAIL.gold }, styles.notchBodyBottom]} />
                  {/* CENTRED, BIGGER AND TRACKED OUT (owner, 2026-08-28: "spread
                      out the words or center them, and make them bigger, maybe
                      add some more rustic details"). It was 9pt and 6pt, hard
                      left, and read as a caption rather than as printing on a
                      ticket. Real ticket stock sets its fare class centred and
                      letterspaced, with a rule between the class and the route.
                      The hairline rules above and below are the rustic detail
                      asked for and they cost nothing: two 1px Views in the
                      ticket's own edge ink at low opacity, no new asset and no
                      Svg, which matters because an Svg here would eat the taps
                      for the whole pass. */}
                  <View style={styles.miniBody}>
                    <View style={styles.miniRule} />
                    <Text numberOfLines={1} style={styles.miniAdmit}>
                      ADMIT ONE
                    </Text>
                    <View style={styles.miniRule} />
                    <Text numberOfLines={1} style={styles.miniLine}>
                      {line.lineName.toUpperCase()}
                    </Text>
                  </View>
                  {tearing && <TornEdge color={TICKET.stockBottom} side="right" />}
                </Animated.View>
                {/* DRAWN AS VIEWS, NOT AN SVG. An Svg eats every touch under it
                    even with pointerEvents none, and this one sits inside the
                    card's own Pressable, so a tap landing on the perforation
                    would be a tap the hero never received. Flat dashes cost
                    nothing and behave the same on both platforms. It hides
                    while tearing: the dashed line is replaced by the two jagged
                    torn edges. */}
                {!tearing && (
                  <View pointerEvents="none" style={styles.miniPerf}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <View key={i} style={styles.miniPerfDash} />
                    ))}
                  </View>
                )}
                {/* THE STUB, AND ONLY THE STAMP ON IT. Fixed slot so the
                    stamp's ROTATED extent is part of the layout: it is tilted
                    12 degrees, which inflates its bounding box by about 1.19x,
                    and an exact-size slot clips the corners. */}
                <Animated.View
                  style={[
                    styles.ticketHalf,
                    { borderColor: RAIL.gold },
                    styles.ticketStub,
                    stubTearStyle,
                    tearing && [styles.tearHalf, styles.ticketStubTorn],
                  ]}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={[TICKET.stockTop, TICKET.stockBottom]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.stubStock}
                  />
                  <View pointerEvents="none" style={styles.halfRule}>
                    <View style={styles.halfRuleInner} />
                  </View>
                  <View pointerEvents="none" style={[styles.notch, { borderColor: RAIL.gold }, styles.notchStubTop]} />
                  <View pointerEvents="none" style={[styles.notch, { borderColor: RAIL.gold }, styles.notchStubBottom]} />
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
                  {tearing && <TornEdge color={TICKET.stockBottom} side="left" />}
                </Animated.View>
              </View>
            </View>
            {/* THE STATIONS, NOT A BAR (owner's mockup, build 17). The brass
                bar drew mastered phrases within ONE stop; the mockup draws the
                zone as a row of stops with the learner's own ringed, which is
                what "Stop 5 of 11" above already says in words. StopDots is
                the one drawing of that row; the cards use it too. */}
            {journey.current && journey.current.stopCount > 0 && (
              <View style={styles.stopsRow}>
                <StopDots
                  testID="pass-stops-row"
                  total={journey.current.stopCount}
                  done={journey.current.stopNumber - 1}
                  current={journey.current.stopNumber}
                  accent={colors.primary}
                  muted={ZONE_BOARD.inkMuted}
                />
                {/* THE LOCOMOTIVE CLOSES THE ROW (build 21, the owner's home
                    mockup): a real engine at the end of the line where a
                    16pt skyline glyph stood. It is the same TrainEngine that
                    drove in the CTA row, drawn large enough to be a picture,
                    and it still drives on the heartbeat. First Class still
                    recolours it. */}
                {/* Sat a little below the dots' line, wheels on the rail, so
                    the plume above the stack clears the ticket stub's foot;
                    the negative bottom margin gives the row back the height. */}
                <View style={styles.engineSeat}>
                  <TrainEngine
                    tint={ZONE_BOARD.ink}
                    width={72}
                    height={46}
                    motion="drive"
                    palette={goldPalette}
                  />
                </View>
              </View>
            )}

            {/* THE DOOR. Same bordered plate the zone card uses for its
                test-out link, so the two screens offer an action the same
                way. The engine stands in it rather than up beside the
                title: it is the train at the platform, and pressing boards
                it. */}
            {/* A DARKER PLATE THAN THE PAPER IT SITS ON (owner, 2026-08-28:
                "this button is the same color as the rest, shouldn't it be a
                shade or 2 darker"). He is right and it was: the plate had a
                border and no fill, so it read as an outline drawn on the ticket
                rather than as a pressed key sitting in it. TICKET.stockBottom
                is the paper's own darker end, so this deepens the existing
                gradient rather than introducing a colour the stock does not
                already contain. */}
            {/* UNBOXED (owner's mockup, build 17). The darker plate was the
                owner's own ruling on 2026-08-28 and the mockup reverses it: the
                train, the reason and the verb sit straight on the paper, and
                the verb and its arrow carry the accent instead of a box. */}
            {/* BOXED AGAIN (build 21, the owner's home mockup: a filled violet
                Resume pill at the right, the reason beside a chai cup at the
                left). The unboxed verb was the owner's earlier mockup and the
                newer one reverses it; the newest wins. The engine moved up to
                close the stops row, so the reason now sits where it did. */}
            <View style={styles.ctaBtn}>
              {/* THE CUP BEFORE THE REASON: the sentence says where Chai
                  comes from, and the kulhad is Chai's mark on every surface. */}
              {journeyCtaTail && (
                <View style={styles.ctaReason}>
                  <ChaiGlyph size={18} testID="pass-chai-glyph" />
                  <Text numberOfLines={3} style={[styles.ctaTail, styles.ctaTailMiddle]}>
                    {journeyCtaTail}
                  </Text>
                </View>
              )}
              {/* THE VERB TRAVELS WITH THE ARROW (owner, 2026-08-28: "move the
                  resume to next to the arrow and center it vertically"), now
                  inside one filled pill so the two halves of the ACTION are
                  one control, and the primary CTA stands out the way the
                  mockup's "Clear Actions" note asks. */}
              <View
                testID="pass-cta-button"
                style={[styles.ctaButton, { backgroundColor: colors.primary }]}
              >
                <Text numberOfLines={1} style={styles.ctaText}>
                  {journeyCta}
                </Text>
                {/* A SOLID ARROW, not a hairline one. Feather draws a thin
                    stroke at any size and beside a 17pt extrabold word it read
                    as a different weight of voice: "make that bouncing arrow on
                    the resume stop heavy like the Resume word" (owner, chat 12). */}
                <Animated.View style={arrowStyle}>
                  <MaterialCommunityIcons name="arrow-right-thick" size={20} color="#FFFFFF" />
                </Animated.View>
              </View>
            </View>
          </View>
        </ParchmentPass>
        )}
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

/**
 * THE STATION NAME FITS. IT DOES NOT ELLIPSIZE.
 *
 * `numberOfLines={1}` shrinks nothing: it cuts. The line table ships names up
 * to 26 characters ("Thiruvananthapuram Central", and "Bolpur Shantiniketan"
 * behind it), and at 19pt one of those is about 290 points of type in a column
 * roughly 140 wide. Flagged before it shipped: "if the zone name is long, make
 * sure the text shrinks and doesn't eat up the boarding pass" (owner, chat 12).
 *
 * FITTED, NOT `adjustsFontSizeToFit`. That prop's behaviour differs between the
 * platforms and this repo has already been bitten once by an iOS-only text
 * property (react-native-svg's textAnchor). Arithmetic behaves the same on
 * both, and it is testable without a device.
 *
 * TWO BUDGETS, AND THE SMALLER WINS. The LONGEST WORD has to fit one line, or
 * it breaks mid-word; the WHOLE NAME has to fit two. "Thiruvananthapuram
 * Central" is bound by its first word, "Bolpur Shantiniketan" by its second.
 * 0.58em per glyph is the extrabold Latin average at these sizes, measured off
 * the rendered card rather than taken from a font table.
 */
export const STATION_FONT_MAX = 19;
export const STATION_FONT_MIN = 12;
export function stationFontSize(name: string, width: number): number {
  const trimmed = name.trim();
  if (width <= 0 || trimmed.length === 0) return STATION_FONT_MAX;
  const words = trimmed.split(/\s+/);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
  const byWord = width / Math.max(1, longest.length * 0.58);
  const byWholeOverTwoLines = (width * 2) / Math.max(1, trimmed.length * 0.58);
  return Math.max(
    STATION_FONT_MIN,
    Math.min(STATION_FONT_MAX, Math.floor(Math.min(byWord, byWholeOverTwoLines))),
  );
}

// R1: the stub column's fixed width, and the stamp that fits it.
// THE MINI TICKET'S WIDTH. It grew from 64 when the stub became a whole
// ticket: a body that names the line, the station and the stop needs a run to
// name them in, and the board has the room now that it bleeds to the screen.
// 148 FROM BUILD 17, WAS 176. Inside home's "Your Journey" frame the board is
// about 35 narrower than at full bleed, and the stub took none of the loss, so
// the eyebrow ("BOARDING PASS · बोलो रेल") truncated. The stamp's extent (46)
// and the wordmark still fit: both size off STUB_W with margin to spare.
const STUB_W = 207;
// 207 FROM 2026-09-05, WAS 148 (owner: "left side of the ticket should be
// wider, should end under Zone 1 text"). Measured rather than nudged: ZONE 1
// sits at x 200 to 238 on a 440pt phone and the ticket's left edge was at
// about 218, so it ended under the middle of the word rather than its start.
// THIS WALKS BACK TOWARD 176, WHICH IS THE WIDTH THAT TRUNCATED THE EYEBROW
// at build 17, so "BOARDING PASS · बोलो रेल" is the thing to check first if
// this ever needs to grow again.
// THE STAMP FITS THE TICKET'S INTERIOR, not its outer width. The ticket now
// carries a 2pt border AND a hairline rule set 4 in from it, so the usable run
// is ~20 narrower than the card. Sizing off STUB_W - 8, as this did when the
// stub had neither, put a stamp wider than the frame it sits in and `overflow:
// hidden` cropped its corners rather than reporting it.
// THE STAMP FITS THE TICKET'S INTERIOR, not its outer box. The ticket carries
// a 2pt border AND a hairline rule set 4 in from it, and it is landscape now,
// so the stamp's ROTATED extent is what has to clear the frame: at 52 it was
// crossing the right border and `overflow: hidden` cropped it rather than
// reporting it. It also sets the ticket's height, which is why shrinking it is
// how the ticket got "wider and less tall".
export const STAMP_SIZE = stampSizeForExtent(46);
// The bite taken out of both edges where the ticket tears.
const TICKET_NOTCH = 12;

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
  // Inside home's "Your Journey" frame (build 17): no bleed, the frame owns
  // the margins.
  wrapFramed: { marginHorizontal: 0, marginBottom: 0 },
  // Geometry is applied inline from the board's own measurements: see the
  // call site for why a 1pt inset stopped working when the face became art.
  glow: {
    position: 'absolute',
    borderRadius: 17,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    // ANDROID GETS NOTHING FROM THE FOUR LINES ABOVE. CLAUDE.md already
    // records it as a device checklist item: Android draws no shadow for a
    // view whose shadow is the only visible part of it. This layer's body is
    // deliberately hidden behind the opaque cream panel, so without elevation
    // the hero simply does not glow on Android at all, and the glow is one of
    // the pieces of life the owner asked to keep.
    //
    // elevation gives Android a shadow to draw, and from API 28 it honours
    // shadowColor with it, so the pulse should read in the line's accent
    // rather than in grey. UNVERIFIED ON A DEVICE: there is no Android here,
    // and this app's own rules say a dev build cannot clear an animation
    // question. Check it on the Play internal build before believing it.
    elevation: 14,
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
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  topText: { flex: 1, minWidth: 0 },
  // The board's own words. No padding of its own: CarvedBoard already insets
  // everything to the drawn frame, and padding here would cross it.
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  // Colour is applied at the call site from the line's accent: an eyebrow over
  // a city is exactly what the zone card's panel does.
  eyebrow: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 0.9 },
  // Nastaliq glyphs cascade above/below the baseline; give the one-line
  // eyebrow enough line height that the brand isn't clipped.
  eyebrowTall: { lineHeight: 24 },
  eyebrowNative: { fontSize: 11, letterSpacing: 0 },
  // The board's ink, not a theme token. The panel is cream in both themes and
  // a cool slate reads cold on it.
  // fontSize and lineHeight are applied at the call site from the measured
  // column: see stationFontSize.
  title: { fontFamily: AppFonts.extrabold, color: ZONE_BOARD.ink, marginTop: 1 },
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
    gap: 8,
    marginTop: 14, // 10 until build 22: air between the wheels and the pill
    paddingVertical: 2,
  },
  // The reason, with its cup, takes the slack; the pill keeps its shape.
  ctaReason: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // THE FILLED PILL (build 21). 38 tall: two lines of the reason beside it
  // stand 26, so the pill is the tallest thing in the row and sets it.
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 999,
    shadowColor: '#3B2A1E',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  // The zone's painting behind the paper's rows; see the JSX for why.
  // Kept INSIDE the content box: run out past it and the painting crosses
  // the frame's inner rule, which the first simulator look showed on the
  // right edge.
  backdrop: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -6,
    overflow: 'hidden',
    borderRadius: 6,
  },
  // EXPLICIT POINTS, NOT '100%' (the render trap proven on device, chat 11:
  // an Image sized by percentages or absoluteFill can resolve to its intrinsic
  // pixel size). The box above is sized by its insets; the picture fills it.
  backdropImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    opacity: 0.13,
  },
  // The stops row (build 17), in place of the brass bar; StopDots draws it.
  stopsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingRight: 2 },
  // The engine no longer hangs into the CTA row (owner, build 22: "move the
  // resume button lower on the card away from train"): its overhang below
  // the dots' line shrank from 14 to 4, which pushes the Resume pill 10
  // lower, and the pill's own top margin grew by 4 for air.
  engineSeat: { marginLeft: 6, marginTop: 14, marginBottom: -4 },
  // BIGGER, because it is one word now rather than a sentence that had to be
  // shrunk to fit the plate beside the ticket.
  // BESIDE THE VERB, not under it: "Only 6 more stops to go should go to the
  // right of resume" (owner, chat 12). Baseline-aligned so the 17pt verb and
  // the 11pt tail sit on one line rather than reading as two rows.
  ctaTextCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  // 16 was 17. Still the loudest thing on the plate and still clearly the verb;
  // one point back buys the sentence beside it a useful amount of width.
  ctaText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 17,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  // Takes the slack between the cup and the pill, so the pill keeps its
  // shape however long the sentence is.
  ctaTailMiddle: { flex: 1, minWidth: 0 },
  // 10 was 11, and THREE lines rather than two. Moving the verb to the right
  // took roughly a fifth of this column's width, so the sentence clipped at
  // "Chai and surprises along t…", losing exactly the clause it was added for
  // (owner, 2026-08-28: "too much padding, words truncated... or font is too
  // big"). Three levers moved a little each, rather than one cut hard: the
  // plate keeps its shape and the sentence fits whole.
  ctaTail: {
    fontFamily: AppFonts.semibold,
    fontSize: 10,
    lineHeight: 13,
    color: ZONE_BOARD.inkMuted,
    flexShrink: 1,
  },
  // R1: top-anchored column (space-between let the circle drift low when the
  // body side grew taller); the stamp docks under the top padding and the
  // wordmark slot soaks up the remaining run.
  // THE TICKET LYING ON THE BOARD. Its own paper (the line's accent, applied
  // at the call site) and its own corners, because it is a separate object
  // from the board rather than a region of it.
  // THE TICKET LYING ON THE BOARD, IN TWO HALVES. Cut from TICKET, the element
  // sheet's own stock, so it is the same paper as every stop card on the map
  // rather than a slab of the line's accent. The edge and the rule are what
  // make it read as a separate object resting on the panel.
  //
  // TWO BOXES RATHER THAN ONE, because they have to come apart. Each half
  // carries its own paper and its own THREE borders: the middle edge is square
  // and borderless, so at rest the perforation runs between two halves of one
  // ticket, and the moment they part each is a whole piece of paper with a
  // jagged edge where the other used to be.
  ticket: { width: STUB_W, flexShrink: 0, flexDirection: 'row', alignItems: 'stretch' },
  ticketHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderColor: TICKET.edge,
    borderTopWidth: TICKET_SHAPE.borderWidth,
    borderBottomWidth: TICKET_SHAPE.borderWidth,
    overflow: 'hidden',
    backgroundColor: TICKET.stockTop,
    // It is ON the board, not part of it. iOS shadow; Android takes elevation.
    shadowColor: TICKET.ink,
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ticketBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
    borderLeftWidth: TICKET_SHAPE.borderWidth,
    borderTopLeftRadius: TICKET_SHAPE.radius,
    borderBottomLeftRadius: TICKET_SHAPE.radius,
  },
  ticketStub: {
    paddingHorizontal: 5,
    borderRightWidth: TICKET_SHAPE.borderWidth,
    borderTopRightRadius: TICKET_SHAPE.radius,
    borderBottomRightRadius: TICKET_SHAPE.radius,
  },
  // Once they are apart, each half gets the corners it was missing, so neither
  // sails away with one square end.
  ticketBodyTorn: {
    borderRightWidth: 0,
    borderTopRightRadius: TICKET_SHAPE.radius,
    borderBottomRightRadius: TICKET_SHAPE.radius,
  },
  ticketStubTorn: {
    borderLeftWidth: 0,
    borderTopLeftRadius: TICKET_SHAPE.radius,
    borderBottomLeftRadius: TICKET_SHAPE.radius,
  },
  // THE BITE, and it is the detail that makes a rectangle read as a ticket.
  // Sized once: a disc of the panel's own cream, half of it hanging past the
  // half's inner edge so the crop leaves a quarter circle behind.
  notch: {
    position: 'absolute',
    width: TICKET_NOTCH,
    height: TICKET_NOTCH,
    borderRadius: TICKET_NOTCH / 2,
    backgroundColor: ZONE_BOARD.panel,
    borderWidth: 1,
    borderColor: TICKET.edge,
  },
  notchBodyTop: { right: -TICKET_NOTCH / 2, top: -TICKET_NOTCH / 2 },
  notchBodyBottom: { right: -TICKET_NOTCH / 2, bottom: -TICKET_NOTCH / 2 },
  notchStubTop: { left: -TICKET_NOTCH / 2, top: -TICKET_NOTCH / 2 },
  notchStubBottom: { left: -TICKET_NOTCH / 2, bottom: -TICKET_NOTCH / 2 },
  // The sheet's inner frame, set in from the border, per half.
  halfRule: {
    position: 'absolute',
    top: TICKET_SHAPE.ruleInset,
    bottom: TICKET_SHAPE.ruleInset,
    left: TICKET_SHAPE.ruleInset,
    right: TICKET_SHAPE.ruleInset,
    borderWidth: 1,
    borderColor: 'rgba(141, 96, 23, 0.9)',
    borderRadius: TICKET_SHAPE.radius - TICKET_SHAPE.ruleInset,
  },
  /** The stylesheet's .ticket-inner-border::before: a second, fainter rule a
   *  couple of points inside the first. It is what makes the frame read as
   *  engraved rather than as one drawn box. */
  halfRuleInner: {
    position: 'absolute',
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
    borderWidth: 1,
    borderColor: 'rgba(177, 130, 47, 0.45)',
    borderRadius: 3,
  },
  stubStock: { ...StyleSheet.absoluteFillObject },
  // The ticket's own words, above its own perforation.
  // The ticket's own words, to the LEFT of its own perforation.
  miniBody: { flex: 1, minWidth: 0, gap: 3, alignItems: 'center', justifyContent: 'center' },
  // 12 was 9, and tracked out: this is the ticket's fare class, not a caption.
  // Two points smaller and a point less tracking from build 17: the stub is
  // 148 wide inside home's frame and ADMIT ONE clipped at the old size.
  miniAdmit: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
    color: TICKET.ink,
  },
  // 8 was 6. Still the quieter of the two, still clearly the route under the
  // class, but legible rather than decorative.
  miniLine: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1.4,
    textAlign: 'center',
    color: TICKET.inkMuted,
  },
  // The rustic detail. A printed rule above and below the fare class, in the
  // ticket's own edge ink rather than a new colour, at the width of the words.
  miniRule: {
    alignSelf: 'stretch',
    marginHorizontal: 6,
    height: 1,
    backgroundColor: TICKET.edge,
    opacity: 0.28,
  },
  // Vertical now that the ticket is landscape: the stub is the right-hand end.
  // THE DASHES STOP AT THE BITES. At 3 they ran to the paper's very edge and
  // straight through the notches, so the perforation read as a line drawn ON
  // the ticket rather than the tear it is: "perforation passes ticket here"
  // (owner, chat 12). The notch is TICKET_NOTCH across and half of it hangs
  // outside, so it reaches TICKET_NOTCH / 2 into the paper; the dashes start
  // clear of that.
  miniPerf: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: TICKET_NOTCH / 2 + 3,
  },
  // ROUND DOTS, not dashes (owner's RailTicket.css, 2026-09-05). The
  // stylesheet punches 7px circles down the fold; at this ticket's scale that
  // is 3, which is the smallest a circle can be and still read as one rather
  // than as a square.
  miniPerfDash: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: RAIL.perfDot },
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
  // Font size + tracking computed per measured extent in the render (R1).
});
