/**
 * Persistent XP strip showing today's XP against the next daily train class.
 *
 * It used to divide today's XP by `dailyGoal`, which is an ATTEMPTS target, so
 * it read things like "254/10 XP" with the bar clamped full. The denominator
 * now comes from the shared ladder in @workspace/train-class — the same module
 * web reads, which is why both platforms show the same number, the same class
 * and the same bar for the same learner at the same moment. Nothing here
 * re-derives a class, a denominator or a fill from the raw XP. `dailyGoal` is
 * untouched and still correct on its other surfaces (the home attempts line,
 * the Day Streak arc, the MilestoneToast).
 *
 * variant="chrome"  — shown in the Home tab header. Slightly larger.
 * variant="session" — shown inside the PracticeHeader / ReviewHeader. Compact.
 * variant="call"    — on Chacha-ji's call screen, which is a dark video and not
 *                     a themed surface, so its three colours are fixed light
 *                     values rather than theme tokens. Owner asked for the XP
 *                     meter up top on the call, 2026-08-28; reusing this rather
 *                     than drawing a second meter is what keeps the number, the
 *                     denominator and the class the same everywhere.
 *
 * Registers its View ref with xpCounterRef so Spec 1's arc animation can
 * target it via measureInWindow without knowing which variant is mounted.
 * Session wins when both are mounted.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  useGetProgressSummary,
  getGetProgressSummaryQueryKey,
} from '@workspace/api-client-react';
import {
  dailyTrainClassMeter,
  msUntilNextLocalDay,
} from '@workspace/train-class';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { registerXpCounter, registerXpCounterPop } from '@/lib/xpCounterRef';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

export function XpCounter({ variant }: { variant: 'chrome' | 'session' | 'call' }) {
  const { activeLang, timezone } = useLanguage();
  const colors = useColors();
  const queryClient = useQueryClient();
  const viewRef = useRef<View>(null);
  const reduceMotion = useReducedMotion();
  const popScale = useSharedValue(1);

  const params = { lang: activeLang };
  const summary = useGetProgressSummary(params, {
    query: {
      enabled: !!activeLang,
      queryKey: getGetProgressSummaryQueryKey(params),
    },
  });

  // Register position for Spec 1 arc targeting + landing pop.
  //
  // THE CALL VARIANT DELIBERATELY DOES NOT REGISTER. The registry is a module
  // level pair of slots that the XP arc animation aims at, and the call screen
  // is a full-screen modal with no arc of its own; claiming a slot from there
  // would point another screen's animation at a counter it cannot see.
  useEffect(() => {
    if (variant === 'call') return;
    registerXpCounter(variant, viewRef.current);
    registerXpCounterPop(variant, () => {
      if (reduceMotion) return; // sound/haptics elsewhere still fire
      popScale.value = withSequence(
        withSpring(1.18, { damping: 12, stiffness: 400 }),
        withSpring(1, { damping: 14, stiffness: 300 }),
      );
    });
    return () => {
      // Unreachable for 'call': the effect returns before this is created.
      registerXpCounter(variant, null);
      registerXpCounterPop(variant, null);
    };
  }, [variant, reduceMotion, popScale]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }));

  // Invalidate at the LEARNER'S local midnight so the strip resets without an
  // app restart. This used to read the device's own calendar fields, which is
  // the wrong moment for anyone whose stored zone is not their device's; the
  // boundary now comes from the same shared helper web uses, against the
  // stored zone the server buckets todayXp with. Web's timer was the one
  // called out in the brief, but the two platforms resetting at different
  // moments would breach "same number at the same moment", so mobile moves too.
  useEffect(() => {
    if (!activeLang) return;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: getGetProgressSummaryQueryKey(params),
      });
    }, msUntilNextLocalDay(timezone));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, activeLang, timezone]);

  const meter = dailyTrainClassMeter(summary.data?.todayXp ?? 0);

  if (!activeLang) return null;

  const isChrome = variant === 'chrome';
  const isCall = variant === 'call';
  // The session track grew from 44px: the row above it now reads "254/400 XP"
  // (a three-digit numerator over a three-digit denominator) where it used to
  // hold one or two digits, and the class name sits under it. 64px matches the
  // widest numbers row without crowding the header's language chip and gear.
  // The call screen has room the practice header does not, and its meter has
  // to hold against a moving film, so it takes the roomier chrome measurements.
  const trackWidth = isChrome || isCall ? 76 : 64;
  // A class in hand is the state worth colouring, the way "goal hit" used to
  // be. Below the first rung the strip stays muted.
  const held = meter.heldClass !== null;
  // The call screen is a dark film, so the theme's own primary and muted
  // foreground can both vanish into it. Fixed light values there, and the same
  // green the waveform uses for "you are being heard".
  const fillColor = isCall
    ? held ? '#7CFFB2' : 'rgba(255,255,255,0.45)'
    : held ? colors.primary : `${colors.primary}66`;
  const textColor = isCall
    ? held ? '#7CFFB2' : 'rgba(255,255,255,0.82)'
    : held ? colors.primary : colors.mutedForeground;
  const trackColor = isCall ? 'rgba(255,255,255,0.24)' : colors.border;
  const fontSize = isChrome || isCall ? 12 : 10;

  const classBadge = meter.heldClass ? (
    <Text
      testID="xp-train-class"
      numberOfLines={1}
      style={[
        styles.classText,
        {
          color: isCall ? '#FFD79A' : colors.primary,
          fontSize: isChrome || isCall ? 10 : 9,
        },
      ]}
    >
      {meter.heldClass}
    </Text>
  ) : null;

  return (
    <Animated.View
      ref={viewRef}
      testID={isCall ? 'xp-counter-call' : 'xp-counter'}
      accessibilityLabel={
        meter.atTop
          ? `${meter.heldClass} class — ${meter.xp} XP today, top class reached`
          : meter.heldClass
            ? `${meter.xp} of ${meter.target} XP today, ${meter.heldClass} class`
            : `${meter.xp} of ${meter.target} XP today`
      }
      style={[isChrome || isCall ? styles.chrome : styles.session, popStyle]}
    >
      {meter.atTop ? (
        // Top of the ladder: nothing further to fill, so the class name stands
        // alone — no bar, no fraction.
        classBadge
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[styles.xpNum, { color: textColor, fontSize }]}>
              {meter.xp}
              <Text style={[styles.xpDenom, { color: textColor }]}>
                /{meter.target}
              </Text>
            </Text>
            <Text style={[styles.xpLabel, { color: textColor }]}>XP</Text>
          </View>
          {/* Own line on both variants, matching web's compact treatment: the
              numbers row is already ~64px and the header has no width to
              spare beside the language chip and the settings gear. */}
          {classBadge}
          <View
            testID="xp-meter-bar"
            style={[
              styles.track,
              { width: trackWidth, backgroundColor: trackColor },
            ]}
          >
            <View
              style={[
                styles.fill,
                { width: meter.fill * trackWidth, backgroundColor: fillColor },
              ]}
            />
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chrome: { flexDirection: 'column', gap: 3 },
  session: { flexDirection: 'column', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  xpNum: {
    fontFamily: AppFonts.bold,
    lineHeight: 14,
  },
  xpDenom: {
    fontFamily: AppFonts.regular,
    fontSize: 10,
    opacity: 0.5,
  },
  xpLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    lineHeight: 12,
  },
  classText: {
    fontFamily: AppFonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
});
