/**
 * THE DAILY GIFT BOX. Closed it wobbles; tapped, the lid lifts and it says
 * what today was worth and what tomorrow is.
 *
 * NOT A NEW REWARD. The app has paid 1 Chai a day for showing up since long
 * before this, granted silently on the first attempt, and nobody ever saw it
 * happen. This box IS that grant, made visible, tappable and growing. THE TAP
 * IS THE GRANT (owner ruling, 2026-09-04), so a learner who practised and never
 * taps forfeits the day, which is only fair because the box is offered where
 * practice ENDS as well as on Home.
 *
 * DRAWN, NOT CUT ART, and that is the whole reason there is no PNG to ship
 * ahead. Asset maps on mobile are COMPILE TIME: art for a feature has to ride a
 * build weeks before the feature can be switched on, which is the trap the
 * Diwali gift paid for. Four boxes drawn in svg have no asset map, no
 * build-ahead requirement, and scale to a fifth tier for free.
 *
 * ONE SVG PER BOX, SIZED TO ITS OWN ART. A react-native-svg root spanning
 * tappable UI eats every touch under it even with pointerEvents none, proven on
 * device when a zone-wide overlay killed every stop-card tap on the journey.
 * This Svg sits INSIDE the Pressable and covers nothing else.
 *
 * RN Animated WITH useNativeDriver: false, NEVER REANIMATED. The native
 * animation driver is dead in this app's release builds (CLAUDE.md, build 270,
 * measured on device): a native-driven animation comes out flat in the store
 * build while animating perfectly in a simulator, and reanimated 4 drives from
 * native too, so its frame loop never starts either.
 *
 * AND THE LOOP IS GATED, WHICH IS NOT OPTIONAL. AttentionPulse's own comment
 * records what an always-on RN Animated loop did to this app's tests: it was
 * the only one on the home screen, RN Animated is REAL under jest, and every
 * home suite driving fake timers ticked it outside act() on each flush until
 * one suite hung. The wobble runs ONLY while there is an unclaimed box to
 * wobble, so it is off by construction wherever the gift query is idle, which
 * is every existing suite. It also stops on unmount and the moment the box is
 * opened.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. The four tiers differ by SIZE and by whether
 * they wear a ribbon, not by hue, and the opened state is a lifted lid rather
 * than a colour change.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { GIFT_LADDER_CAP, type GiftTier } from '@workspace/daily-gift';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { hapticMedium } from '@/lib/haptics';

/** One wobble, out and back, in ms. Slow enough to read as a nudge. */
export const GIFT_WOBBLE_MS = 1400;
/** How far the closed box tips at the top of a wobble, in degrees. */
export const GIFT_WOBBLE_DEG = 5;
/** How far the lid lifts when the box opens, in points. */
export const GIFT_LID_LIFT = 18;

/** Box width in points per tier. The tier is the picture of how long you kept it up. */
const TIER_SIZE: Record<GiftTier, number> = {
  small: 54,
  medium: 64,
  large: 76,
  grand: 88,
};

/** The gold ribbon is the grand box's alone: a week, and it looks like one. */
function hasRibbon(tier: GiftTier): boolean {
  return tier === 'grand';
}

const RIBBON_GOLD = '#D9A521';

/**
 * The box itself: a body, a lid that can lift, and a ribbon on the grand one.
 *
 * Sized in EXPLICIT POINTS rather than a percentage and an aspect ratio. An
 * element sized that way inside this tree can resolve to its intrinsic size on
 * device, which was the whole blank-board saga of builds 511 to 515.
 */
function BoxArt({
  tier,
  accent,
  lidLift,
}: {
  tier: GiftTier;
  accent: string;
  lidLift: Animated.AnimatedInterpolation<number> | number;
}) {
  const w = TIER_SIZE[tier];
  const bodyH = w * 0.62;
  const lidH = w * 0.24;
  const ribbon = hasRibbon(tier);
  return (
    <View
      // The frame the two svgs are laid out in. Named so a test can read the
      // TIER'S WIDTH rather than walking children by index, which is how the
      // first cut of that test broke.
      testID="gift-box-frame"
      style={{ width: w, height: bodyH + lidH + GIFT_LID_LIFT }}
    >
      {/* The lid, drawn above the body and free to rise off it. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: GIFT_LID_LIFT,
          transform: [{ translateY: typeof lidLift === 'number' ? -lidLift : lidLift }],
        }}
      >
        <Svg width={w} height={lidH} viewBox={`0 0 ${w} ${lidH}`}>
          <Rect x={0} y={0} width={w} height={lidH} rx={3} fill={accent} />
          {ribbon ? (
            <Rect x={w / 2 - 4} y={0} width={8} height={lidH} fill={RIBBON_GOLD} />
          ) : null}
        </Svg>
      </Animated.View>
      {/* The body. */}
      <View style={{ position: 'absolute', left: 0, top: GIFT_LID_LIFT + lidH }}>
        <Svg width={w} height={bodyH} viewBox={`0 0 ${w} ${bodyH}`}>
          <Rect x={2} y={0} width={w - 4} height={bodyH} rx={3} fill={accent} opacity={0.88} />
          {ribbon ? (
            <>
              <Rect x={w / 2 - 4} y={0} width={8} height={bodyH} fill={RIBBON_GOLD} />
              {/* A small bow above the ribbon, so the grand box reads as
                  different in SHAPE and not only in size. */}
              <Path
                d={`M ${w / 2} 4 L ${w / 2 - 11} -6 L ${w / 2 - 3} 6 Z`}
                fill={RIBBON_GOLD}
              />
              <Path
                d={`M ${w / 2} 4 L ${w / 2 + 11} -6 L ${w / 2 + 3} 6 Z`}
                fill={RIBBON_GOLD}
              />
            </>
          ) : null}
        </Svg>
      </View>
    </View>
  );
}

export interface DailyGiftBoxProps {
  /** The day the box belongs to, which is also what it holds. */
  day: number;
  chai: number;
  tier: GiftTier;
  tomorrowChai: number;
  /** True once today's box has been opened. */
  claimed: boolean;
  /** True while it is worth tapping: practised today, not yet opened. */
  claimable: boolean;
  /** The tap. It is the grant, so it must reach the server. */
  onClaim: () => void;
  /** Reduce Motion just opens: no wobble, no lift, same information. */
  reduceMotion?: boolean;
  testID?: string;
}

export function DailyGiftBox({
  day,
  chai,
  tier,
  tomorrowChai,
  claimed,
  claimable,
  onClaim,
  reduceMotion = false,
  testID = 'daily-gift-box',
}: DailyGiftBoxProps) {
  const colors = useColors();
  const wobble = useRef(new Animated.Value(0)).current;
  const lid = useRef(new Animated.Value(0)).current;

  // THE WOBBLE, AND ITS GATE. It runs only while there is an unclaimed box to
  // wobble, so it is inert wherever the gift query has not resolved, which is
  // every test that does not deliberately hand it one. See the note at the top
  // of this file for what an ungated RN Animated loop did to the home suites.
  const wobbling = claimable && !claimed && !reduceMotion;
  useEffect(() => {
    if (!wobbling) {
      wobble.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 1,
          duration: GIFT_WOBBLE_MS / 2,
          easing: Easing.inOut(Easing.ease),
          // FALSE, ALWAYS. See the file header: true comes out dead flat in a
          // release build of this app.
          useNativeDriver: false,
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: GIFT_WOBBLE_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      wobble.setValue(0);
    };
  }, [wobbling, wobble]);

  // The lid rises once, when the box opens. Reduce Motion skips the rise and
  // lands on the open frame, which carries exactly the same words.
  useEffect(() => {
    if (!claimed) {
      lid.setValue(0);
      return;
    }
    if (reduceMotion) {
      lid.setValue(1);
      return;
    }
    const rise = Animated.timing(lid, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    rise.start();
    return () => rise.stop();
  }, [claimed, reduceMotion, lid]);

  const press = useCallback(() => {
    if (!claimable || claimed) return;
    hapticMedium();
    onClaim();
  }, [claimable, claimed, onClaim]);

  const rotate = wobble.interpolate({
    inputRange: [0, 1],
    outputRange: [`-${GIFT_WOBBLE_DEG}deg`, `${GIFT_WOBBLE_DEG}deg`],
  });
  const lift = lid.interpolate({ inputRange: [0, 1], outputRange: [0, GIFT_LID_LIFT] });

  // THE ONE LINE THAT DOES THE WORK is the third one, and it is composed here
  // from the lib's numbers rather than templated in two client files. At the
  // cap it stops counting and says a week is the habit, because "Tomorrow: 7"
  // after "7 Chai" reads as a ladder that has stalled.
  const openedTomorrow =
    day >= GIFT_LADDER_CAP
      ? 'A full week. Same again tomorrow.'
      : `Tomorrow: ${tomorrowChai}`;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !claimable || claimed }}
      accessibilityLabel={
        claimed
          ? `Day ${day}. ${chai} Chai. ${openedTomorrow}`
          : `Open today's gift, day ${day}`
      }
      onPress={press}
      disabled={!claimable || claimed}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Animated.View
        testID={`${testID}-art`}
        style={{ transform: [{ rotate: claimed ? '0deg' : rotate }] }}
      >
        <BoxArt tier={tier} accent={colors.primary} lidLift={claimed ? lift : 0} />
      </Animated.View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {claimed ? `${chai} Chai` : `Day ${day}`}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {claimed ? `Day ${day} in a row` : 'Tap to open'}
        </Text>
        {claimed ? (
          <Text testID={`${testID}-tomorrow`} style={[styles.tomorrow, { color: colors.primary }]}>
            {openedTomorrow}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  body: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  tomorrow: { fontFamily: AppFonts.bold, fontSize: 13, marginTop: 3 },
});
