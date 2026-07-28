/**
 * Persistent XP progress counter showing today's XP against the daily goal.
 *
 * variant="chrome"  — shown in the Home tab header. Slightly larger.
 * variant="session" — shown inside the PracticeHeader / ReviewHeader. Compact.
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
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { registerXpCounter } from '@/lib/xpCounterRef';

export function XpCounter({ variant }: { variant: 'chrome' | 'session' }) {
  const { activeLang } = useLanguage();
  const colors = useColors();
  const queryClient = useQueryClient();
  const viewRef = useRef<View>(null);

  const params = { lang: activeLang };
  const summary = useGetProgressSummary(params, {
    query: {
      enabled: !!activeLang,
      queryKey: getGetProgressSummaryQueryKey(params),
    },
  });

  // Register position for Spec 1 arc targeting.
  useEffect(() => {
    registerXpCounter(variant, viewRef.current);
    return () => {
      registerXpCounter(variant, null);
    };
  }, [variant]);

  // Invalidate at local midnight so the counter resets without an app restart.
  useEffect(() => {
    if (!activeLang) return;
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: getGetProgressSummaryQueryKey(params),
      });
    }, ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, activeLang]);

  const todayXp = summary.data?.todayXp ?? 0;
  const dailyGoal = summary.data?.dailyGoal ?? 10;
  const pct = Math.min(1, dailyGoal > 0 ? todayXp / dailyGoal : 0);
  const done = todayXp >= dailyGoal && dailyGoal > 0;

  if (!activeLang) return null;

  const isChrome = variant === 'chrome';
  const trackWidth = isChrome ? 60 : 44;
  const fillColor = done ? colors.primary : `${colors.primary}66`;
  const textColor = done ? colors.primary : colors.mutedForeground;
  const fontSize = isChrome ? 12 : 10;

  return (
    <View ref={viewRef} style={isChrome ? styles.chrome : styles.session}>
      <View style={styles.row}>
        <Text
          style={[styles.xpNum, { color: textColor, fontSize }]}
        >
          {todayXp}
          <Text style={[styles.xpDenom, { color: textColor }]}>
            /{dailyGoal}
          </Text>
        </Text>
        <Text style={[styles.xpLabel, { color: textColor }]}>XP</Text>
      </View>
      <View
        style={[
          styles.track,
          { width: trackWidth, backgroundColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.fill,
            { width: pct * trackWidth, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
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
