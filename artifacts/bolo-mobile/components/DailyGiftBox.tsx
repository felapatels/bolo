import { DailyGiftRow } from '@/components/DailyGiftRow';
/**
 * THE DAILY GIFT. Resting it is one row; opened it earns its height.
 *
 * REBUILT 2026-09-08 from the owner's design canvas, and the shape is his:
 * "this whole module needs to be much smaller", "expand if needed after
 * clicking the gift box", "the gift box should gently shake like it is alive
 * and begging for you to click it", "write directly on it, Day 4 Gift", "get
 * rid of tomorrow 5 to 25", "confetti pop for celebration".
 *
 * WHAT IT SHOWS AND WHY EACH PART IS THERE:
 *
 *   RESTING   the box, shaking, with its own day written on it, beside the
 *             distance the Chai is FOR. Roughly 100 points.
 *   OPENED    a fare panel whose two cards flip like a rolodex and land on the
 *             draw, confetti, then the same meter with today's length named.
 *
 * THE METER IS THE HALF THAT MATTERS, and it is the owner's reasoning rather
 * than a designer's: "a spin with nothing to spend it on is a number going up
 * on its own. What gives it a reason is knowing what it is FOR." Production
 * said the old fixed ladder was not working: 28 learners with any Chai and a
 * MEDIAN BALANCE OF 1, which is one box claimed and no second visit.
 *
 * ALL-ACCESS GETS NO METER, ON HIS RULING. They cannot buy a stop at all
 * (lib/stopUnlock.ts sells stops only in a language the plan EXCLUDES), so a
 * bar counting toward something unreachable would be a lie. They get their
 * wallet and the door to the bazaar.
 *
 * THE RANGE IS ALWAYS ON SCREEN AND THE SUM IS SHOWN BOTH WAYS. He proposed a
 * wheel that pays generously five times then lands just short of a stop, and
 * declined it himself the same day: the app is rated 4+ and Everyone, a
 * randomiser with a purchase path is the loot-box shape both stores watch, and
 * a wheel whose odds are not what they appear is a misrepresentation rather
 * than an undisclosed odd. A doubled number with its base hidden is the same
 * kind of small dishonesty, which is why an All-Access learner is told
 * "18 drawn, doubled to 36" rather than just 36.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Today's length on the track is named in
 * words beside the count, not left to the difference between two ambers; the
 * locked stop is a grey ring AND a padlock; the tier is size and a ribbon.
 *
 * RN Animated WITH useNativeDriver: false. The native driver is no longer
 * believed dead (CLAUDE.md, retired 2026-09-08), but the five components
 * already on the JS driver STAY: migrating working animation on a rule change
 * is regression risk for a theoretical gain. This is one of the five.
 *
 * AND THE LOOP IS GATED, WHICH IS NOT OPTIONAL. AttentionPulse's comment
 * records what an always-on RN Animated loop did to this app's tests: RN
 * Animated is REAL under jest, and every home suite driving fake timers ticked
 * it outside act() on each flush until one suite hung. The shake runs ONLY
 * while there is an unclaimed box to shake, so it is off by construction
 * wherever the gift query is idle, which is every existing suite.
 *
 * ONE SVG PER PIECE OF ART, SIZED TO IT. A react-native-svg root spanning
 * tappable UI eats every touch under it even with pointerEvents none, proven on
 * device when a zone-wide overlay killed every stop-card tap on the journey.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { giftRangeCopy, type GiftTier } from '@workspace/daily-gift';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { hapticMedium } from '@/lib/haptics';

/** One shake, out and back, in ms. Slow enough to read as a nudge. */
export const GIFT_WOBBLE_MS = 2600;
/** How far the box tips at the top of a shake, in degrees. */
export const GIFT_WOBBLE_DEG = 5;
/**
 * RETAINED FOR THE SUITE THAT PINS IT, and it no longer lifts a lid.
 * The opened state replaces the box with the fare panel rather than opening it
 * in place, which is the owner's "expand if needed after clicking". Kept as the
 * panel's entry rise so the number still describes something real.
 */
export const GIFT_LID_LIFT = 18;

/** Box width in points per tier. The tier is the picture of how long you kept it up. */
const TIER_SIZE: Record<GiftTier, number> = {
  small: 60,
  medium: 66,
  large: 72,
  grand: 80,
};

/** The gold ribbon is the grand box's alone: a week, and it looks like one. */
function hasRibbon(tier: GiftTier): boolean {
  return tier === 'grand';
}

/** The bazaar's marigold, and the app's own violet rails. Fixed scene colours. */
const MARIGOLD = '#F0A32B';
const MARIGOLD_DEEP = '#E08A16';
const MARIGOLD_LIGHT = '#FBBF24';
const TRACK_SPENT = '#C97F17';
const RAIL_VIOLET = '#8B5CF6';
const SLEEPER = '#6B4130';
const PAPER_TOP = '#FBEECF';
const PAPER_MID = '#F3DFB8';
const PAPER_INK = '#8E672D';
const PAPER_EDGE = '#B48628';
const FLAP_FACE = '#42240F';
const FLAP_TEXT = '#FFF5DC';

/** The confetti's inks: the app's own, never a party palette. */
const CONFETTI_INK = [MARIGOLD, '#4F46E5', RAIL_VIOLET, PAPER_EDGE, FLAP_TEXT, '#F59E0B', '#0D9488'];

/**
 * THE BOX, DRAWN RATHER THAN CUT, and that is the whole reason there is no PNG.
 * Asset maps on mobile are COMPILE TIME: art for a feature has to ride a build
 * weeks before the feature can be switched on, which is the trap the Diwali
 * gift paid for. Four boxes in svg have no asset map and scale to a fifth tier
 * for free.
 *
 * The day is written ON it, on the owner's instruction, which also means the
 * box carries its own label if it is ever seen without its row.
 */
/**
 * `locked` DRAWS A PADLOCK SHACKLE OVER THE LID, AND IT IS A SHAPE RATHER THAN A
 * COLOUR ON PURPOSE. The owner is partially colour blind, so a dimmed gold box
 * and a gold box are the same box to him. A silhouette that changes is readable
 * without seeing a hue at all, and it survives a greyscale screenshot.
 */
function BoxArt({
  tier,
  day,
  accent,
  locked = false,
}: { tier: GiftTier; day: number; accent: string; locked?: boolean }) {
  const w = TIER_SIZE[tier];
  const h = Math.round(w * (104 / 96));
  const ribbon = hasRibbon(tier);
  return (
    // NAMED SO A TEST CAN READ THE TIER'S WIDTH rather than walking children by
    // index, which is how the first cut of that test broke. The tiers must be
    // tellable apart by SIZE, because the owner is partially colour blind and
    // hue is never allowed to be the only signal.
    <Svg testID="gift-box-frame" width={w} height={h} viewBox="0 0 96 104">
      {/* The shackle is drawn LAST below so it sits over the lid; declared here
          only so the testID is findable whatever the tier. */}
      <Defs>
        <LinearGradient id="giftBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6366F1" />
          <Stop offset="1" stopColor="#4338CA" />
        </LinearGradient>
        <LinearGradient id="giftLid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#818CF8" />
          <Stop offset="1" stopColor={accent} />
        </LinearGradient>
        <LinearGradient id="giftRibbon" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={MARIGOLD_LIGHT} />
          <Stop offset="1" stopColor={MARIGOLD_DEEP} />
        </LinearGradient>
      </Defs>
      {/* The ground shadow, so it sits rather than floats. */}
      <Ellipse cx={48} cy={99} rx={31} ry={4} fill="#0F172A" opacity={0.14} />
      <Rect x={10} y={44} width={76} height={52} rx={5} fill="url(#giftBody)" />
      {/* A lighter left third, so the body reads as a solid rather than a panel. */}
      <Rect x={10} y={44} width={20} height={52} rx={5} fill="#FFFFFF" opacity={0.08} />
      <Rect x={10} y={48} width={76} height={10} fill="url(#giftRibbon)" />
      <Rect x={10} y={58} width={76} height={1.5} fill="#0F172A" opacity={0.18} />
      <SvgText
        x={48}
        y={76}
        fill={FLAP_TEXT}
        fontFamily={AppFonts.extrabold}
        fontSize={13}
        textAnchor="middle"
      >
        {`Day ${day}`}
      </SvgText>
      <SvgText
        x={48}
        y={88}
        fill={FLAP_TEXT}
        fontFamily={AppFonts.bold}
        fontSize={9}
        textAnchor="middle"
        opacity={0.88}
      >
        GIFT
      </SvgText>
      {/* The lid overhangs, which is what makes it read as a lid. */}
      <Rect x={4} y={30} width={88} height={16} rx={4} fill="url(#giftLid)" />
      <Rect x={4} y={43} width={88} height={3} rx={1.5} fill="#0F172A" opacity={0.16} />
      <Rect x={42} y={30} width={12} height={16} fill="url(#giftRibbon)" />
      {ribbon ? (
        <>
          {/* THE GRAND BOX'S BOW, and it is a difference in SHAPE rather than
              in hue, because the tiers must be tellable apart without colour. */}
          <Path d="M 48 31 C 33 26, 28 11, 39 11 C 47 11, 48 25, 48 31 Z" fill={MARIGOLD_LIGHT} />
          <Path d="M 48 31 C 63 26, 68 11, 57 11 C 49 11, 48 25, 48 31 Z" fill={MARIGOLD} />
          <Rect x={43} y={25} width={10} height={10} rx={5} fill={MARIGOLD_DEEP} />
        </>
      ) : null}
      {locked ? (
        <>
          {/* THE PADLOCK, over the lid. Shackle drawn as a stroked arc so it
              reads at 60pt as well as 80, and a body beneath it. Cream on the
              box rather than a new colour, because the CUE IS THE SILHOUETTE. */}
          <Path
            d="M 40 46 v -7 a 8 8 0 0 1 16 0 v 7"
            fill="none"
            stroke={PAPER_TOP}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Rect x={36} y={45} width={24} height={19} rx={4} fill={PAPER_TOP} />
          <Rect x={46} y={51} width={4} height={8} rx={2} fill={MARIGOLD_DEEP} />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * THE THIN TRACK. The app already owns a picture of "how far along you are",
 * and it is a railway: sleepers, two violet rails, and a lit centre.
 *
 * IT IS NOT THE JOURNEY'S RAIL AND MUST NOT BORROW ITS COLOUR. The map's lime
 * means TRAVELLED. This measures Chai, which is money, so it is marigold. The
 * two were the same colour for one draft and the distinction is the point.
 */
function StopTrack({
  spentPct,
  todayPct,
  border,
  muted,
}: {
  spentPct: number;
  todayPct: number;
  border: string;
  muted: string;
}) {
  const sleepers = useMemo(() => {
    const out: number[] = [];
    for (let x = 8; x <= 224; x += 15) out.push(x);
    return out;
  }, []);
  return (
    <View style={styles.track}>
      <Svg width="100%" height={26} viewBox="0 0 240 26" preserveAspectRatio="none">
        {sleepers.map((x) => (
          <Rect key={x} x={x} y={6} width={4} height={14} rx={1} fill={SLEEPER} />
        ))}
        <Rect x={4} y={9} width={222} height={2} rx={1} fill={RAIL_VIOLET} />
        <Rect x={4} y={15} width={222} height={2} rx={1} fill={RAIL_VIOLET} />
      </Svg>
      <View style={styles.trackInner} pointerEvents="none">
        <View style={[styles.trackSpent, { width: `${spentPct}%` }]} />
        {todayPct > 0 ? (
          <View style={[styles.trackToday, { left: `${spentPct}%`, width: `${todayPct}%` }]} />
        ) : null}
      </View>
      {/* LOCKED, AND IT SAYS SO WITH A SHAPE. A grey ring plus a padlock, never
          a shade the reader has to tell apart from another shade. */}
      <View style={[styles.trackGate, { borderColor: muted, backgroundColor: border }]}>
        <Svg width={8} height={8} viewBox="0 0 24 24">
          <Rect x={4} y={11} width={16} height={10} rx={2} fill="none" stroke={muted} strokeWidth={3} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={muted} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </View>
    </View>
  );
}

export interface DailyGiftBoxProps {
  /** The streak day this box belongs to. NEVER the amount: see lib/daily-gift. */
  day: number;
  /** What is banked, after any plan multiplier. */
  chai: number;
  /** The draw before the multiplier, so the sum can be shown both ways. */
  baseAmount?: number;
  /** What the base was multiplied by. 1 for Free. */
  multiplier?: number;
  tier: GiftTier;
  claimed: boolean;
  claimable: boolean;
  busy?: boolean;
  /** Chai still needed for the next stop. Absent for an entitled learner. */
  chaiToNextStop?: number;
  /** What a stop costs, so the bar has a denominator. */
  stopCost?: number;
  /** The wallet, shown to All-Access in place of a meter they cannot use. */
  balance?: number;
  /** True for All-Access: no meter, a shop door instead. */
  isPlus?: boolean;
  error?: string;
  onClaim: () => void;
  /** All-Access taps this to reach the bazaar. */
  onShop?: () => void;
  /** A Free learner short of a stop taps this. */
  onGetMore?: () => void;
  /** Reduce Motion just opens: no shake, no flip, same information. */
  reduceMotion?: boolean;
  testID?: string;
}

export function DailyGiftBox({
  day,
  chai,
  baseAmount,
  multiplier = 1,
  tier,
  claimed,
  claimable,
  busy = false,
  chaiToNextStop,
  stopCost,
  balance,
  isPlus = false,
  error,
  onClaim,
  onShop,
  onGetMore,
  reduceMotion = false,
  testID = 'daily-gift-box',
}: DailyGiftBoxProps) {
  const colors = useColors();
  const shake = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  // THE SHAKE, AND ITS GATE. It runs only while there is an unclaimed box to
  // shake, so it is inert wherever the gift query has not resolved, which is
  // every test that does not deliberately hand it one. See the file header for
  // what an ungated RN Animated loop did to the home suites.
  const shaking = claimable && !claimed && !reduceMotion;
  useEffect(() => {
    if (!shaking) {
      shake.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: GIFT_WOBBLE_MS * 0.55,
          easing: Easing.inOut(Easing.ease),
          // FALSE, ALWAYS, for this component. See the file header.
          useNativeDriver: false,
        }),
        // THE REST IS THE POINT. A shake then a pause reads as asking for
        // attention; a continuous wiggle reads as a broken animation.
        Animated.timing(shake, {
          toValue: 0,
          duration: GIFT_WOBBLE_MS * 0.45,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      shake.setValue(0);
    };
  }, [shaking, shake]);

  // The flaps drop into place once, on opening, and the confetti fires with
  // them. Reduce Motion lands on the settled frame with the same words.
  useEffect(() => {
    if (!claimed) {
      flip.setValue(1);
      burst.setValue(0);
      return;
    }
    if (reduceMotion) {
      flip.setValue(1);
      burst.setValue(0);
      return;
    }
    flip.setValue(0);
    burst.setValue(0);
    const run = Animated.parallel([
      Animated.timing(flip, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: false,
      }),
      Animated.timing(burst, {
        toValue: 1,
        duration: 950,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [claimed, reduceMotion, flip, burst]);

  const press = useCallback(() => {
    if (!claimable || claimed) return;
    hapticMedium();
    onClaim();
  }, [claimable, claimed, onClaim]);

  const rotate = shake.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      '0deg',
      `-${GIFT_WOBBLE_DEG}deg`,
      `${GIFT_WOBBLE_DEG}deg`,
      `-${Math.round(GIFT_WOBBLE_DEG * 0.6)}deg`,
      '0deg',
    ],
  });

  // ONE ANIMATED VALUE DRIVES ALL SIXTEEN PIECES, deliberately. Sixteen values
  // on the JS driver is sixteen bridge writes a frame; one value with sixteen
  // interpolations is one.
  const confetti = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (-74 + i * 9.8) * (Math.PI / 180);
        const reach = 58 + ((i * 37) % 100) * 0.5;
        return {
          key: i,
          ink: CONFETTI_INK[i % CONFETTI_INK.length]!,
          round: i % 3 === 0,
          dx: Math.sin(angle) * reach,
          dy: -Math.cos(angle) * reach,
        };
      }),
    [],
  );

  const spentPct = useMemo(() => {
    if (isPlus || stopCost == null || chaiToNextStop == null || stopCost <= 0) return 0;
    const have = Math.max(0, stopCost - chaiToNextStop);
    return Math.min(100, Math.round((have / stopCost) * 100));
  }, [isPlus, stopCost, chaiToNextStop]);

  const doubled = multiplier > 1 && baseAmount != null && baseAmount !== chai;
  const digits = String(Math.max(0, Math.floor(chai))).padStart(2, '0').split('');

  const remainLabel =
    chaiToNextStop != null && chaiToNextStop > 0
      ? `${chaiToNextStop} more Chai to open your next stop`
      : 'Enough for your next stop';

  const shopButton = (
    <Pressable
      testID={`${testID}-shop`}
      accessibilityRole="button"
      onPress={onShop}
      style={[styles.button, { backgroundColor: colors.primary, shadowColor: colors.primaryShadow }]}
    >
      <Text style={styles.buttonLabel}>Go Shopping</Text>
    </Pressable>
  );

  // A single row until opened; the receipt keeps its existing reveal below.
  if (!claimed) {
    return <DailyGiftRow
      testID={`${testID}-row`} giftTestID={testID}
      instructionTestID={`${testID}-locked`} rangeTestID={`${testID}-range`} shopTestID={`${testID}-shop`}
      art={<Animated.View style={{ transform: [{ rotate }] }}><BoxArt tier={tier} day={day} accent={colors.primary} locked={!claimable} /></Animated.View>}
      artWidth={80}
      title={claimable ? 'Tap to open' : 'Finish a stop today to open it'}
      range={giftRangeCopy(multiplier)} locked={!claimable} busy={busy}
      onOpen={press} onShop={onShop} error={error}
    />;
  }

  // ── OPENED ────────────────────────────────────────────────────────────────
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* THE FARE PANEL. Paper, because the whole app's money surface is paper:
          the boarding pass, the ticket, the stop cards. */}
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.panelEyebrow}>TODAY&apos;S FARE</Text>
          {doubled ? (
            <View testID={`${testID}-multiplier`} style={styles.plate}>
              <Text style={styles.plateTimes}>{`×${multiplier}`}</Text>
              <Text style={styles.plateLabel}>ALL-ACCESS</Text>
            </View>
          ) : (
            <Text style={styles.panelDay}>{`Day ${day}`}</Text>
          )}
        </View>

        <View style={styles.flaps}>
          {digits.map((ch, i) => (
            <Animated.View
              key={`${i}-${ch}`}
              testID={`${testID}-flap-${i}`}
              style={[
                styles.flap,
                {
                  opacity: flip.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                  transform: [
                    { perspective: 320 },
                    {
                      rotateX: flip.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-84deg', '0deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.flapDigit}>{ch}</Text>
              {/* The hinge is what makes it read as a flap rather than as a
                  number that changed. */}
              <View style={styles.flapHinge} />
            </Animated.View>
          ))}
          <Text style={styles.flapUnit}>CHAI</Text>
        </View>

        {/* THE SUM BOTH WAYS, so a learner can check it. */}
        <Text testID={`${testID}-sum`} style={styles.panelFoot}>
          {doubled ? `${baseAmount} drawn, doubled to ${chai}` : giftRangeCopy(multiplier)}
        </Text>

        {claimed && !reduceMotion ? (
          <View style={styles.burstLayer} pointerEvents="none">
            {confetti.map((p) => (
              <Animated.View
                key={p.key}
                style={[
                  p.round ? styles.confettiRound : styles.confettiChip,
                  {
                    backgroundColor: p.ink,
                    opacity: burst.interpolate({
                      inputRange: [0, 0.12, 1],
                      outputRange: [0, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, p.dx],
                        }),
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, p.dy],
                        }),
                      },
                      {
                        rotate: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '560deg'],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>

      {isPlus ? (
        // NO METER FOR ALL-ACCESS, on the owner's ruling. They cannot buy a
        // stop, so a bar counting toward one would be a lie. The wallet and the
        // door to the bazaar are what their Chai is actually for.
        <>
          <View style={styles.walletRow}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>YOUR CHAI</Text>
            <Text testID={`${testID}-balance`} style={[styles.walletValue, { color: colors.foreground }]}>
              {balance ?? 0}
            </Text>
          </View>

        </>
      ) : (
        <>
          <View style={styles.meterBlock}>
            <View style={styles.meterHead}>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>NEXT STOP</Text>
              {/* TODAY'S LENGTH IS NAMED IN WORDS, not left to the difference
                  between two ambers. The reader may not see that difference. */}
              <Text testID={`${testID}-count`} style={[styles.body, { color: colors.mutedForeground }]}>
                {stopCost != null && chaiToNextStop != null
                  ? `${Math.max(0, stopCost - chaiToNextStop)} of ${stopCost}, +${chai} today`
                  : `+${chai} today`}
              </Text>
            </View>
            <StopTrack
              spentPct={Math.max(0, spentPct - (stopCost ? (chai / stopCost) * 100 : 0))}
              todayPct={stopCost ? Math.min(spentPct, (chai / stopCost) * 100) : 0}
              border={colors.card}
              muted={colors.mutedForeground}
            />
            <Text testID={`${testID}-remain`} style={[styles.remain, { color: colors.foreground }]}>
              {remainLabel}
            </Text>
          </View>
          <Pressable
            testID={`${testID}-getmore`}
            accessibilityRole="button"
            onPress={onGetMore}
            style={[styles.button, { backgroundColor: colors.primary, shadowColor: colors.primaryShadow }]}
          >
            <Text style={styles.buttonLabel}>Get more Chai</Text>
          </Pressable>
        </>
      )}
      {shopButton}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 1,
  },
  body: { fontFamily: AppFonts.regular, fontSize: 11 },
  remain: { fontFamily: AppFonts.bold, fontSize: 13 },
  meterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  meterBlock: { gap: 4 },

  track: { position: 'relative', height: 26, justifyContent: 'center' },
  trackInner: { position: 'absolute', left: 6, right: 22, top: 11.5, height: 3 },
  trackSpent: { position: 'absolute', left: 0, top: 0, height: 3, borderRadius: 2, backgroundColor: TRACK_SPENT },
  trackToday: { position: 'absolute', top: -1, height: 5, borderRadius: 2, backgroundColor: MARIGOLD },
  trackGate: {
    position: 'absolute',
    right: 0,
    top: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  panel: {
    position: 'relative',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PAPER_EDGE,
    backgroundColor: PAPER_TOP,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 8,
    gap: 2,
    overflow: 'hidden',
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelEyebrow: { fontFamily: AppFonts.extrabold, fontSize: 10, letterSpacing: 1.2, color: PAPER_INK },
  panelDay: { fontFamily: AppFonts.semibold, fontSize: 10, color: '#9E6F25' },
  panelFoot: { textAlign: 'center', fontFamily: AppFonts.semibold, fontSize: 10, color: '#9E6F25' },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: FLAP_FACE,
    borderWidth: 1,
    borderColor: '#D4AC52',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  plateTimes: { fontFamily: AppFonts.extrabold, fontSize: 12, color: MARIGOLD_LIGHT },
  plateLabel: { fontFamily: AppFonts.extrabold, fontSize: 9, letterSpacing: 1, color: PAPER_MID },

  flaps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 6 },
  flap: {
    width: 40,
    height: 50,
    borderRadius: 6,
    backgroundColor: FLAP_FACE,
    borderWidth: 1,
    borderColor: PAPER_INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flapDigit: { fontFamily: AppFonts.extrabold, fontSize: 27, color: FLAP_TEXT, lineHeight: 30 },
  flapHinge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  flapUnit: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: PAPER_INK,
    alignSelf: 'flex-end',
    paddingBottom: 7,
  },

  burstLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 62,
    height: 0,
    alignItems: 'center',
  },
  confettiChip: { position: 'absolute', width: 5, height: 9, borderRadius: 1 },
  confettiRound: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },

  walletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  walletValue: { fontFamily: AppFonts.extrabold, fontSize: 20 },

  button: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontFamily: AppFonts.bold, fontSize: 14, color: '#FFFFFF' },
});
