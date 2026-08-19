import React from 'react';
import { Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { appearDown, useAppearSkip } from '@/lib/entrance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useListBadges } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { badgeIcon } from '@/lib/badge-icons';
import { findNearestLockedBadge, progressRatio } from '@/lib/badge-progress';

/**
 * A prominent "next goal" card at the top of the badges area that calls out the
 * single locked badge the learner is closest to unlocking, turning the gallery
 * into a directed goal rather than a reference grid. When every badge is earned
 * it shows a celebratory all-earned state instead. Mirrors the web
 * NextBadgeSpotlight so the highlighted goal matches across platforms.
 */
export function NextBadgeSpotlight({ lang }: { lang: string }) {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const reduceMotion = useReducedMotion();
  const { data: badges, isLoading } = useListBadges({ lang });

  // Shimmer pulse on the badge icon: opacity 1 → 0.5 → 1 repeating.
  // Opacity is not a layout prop so Reanimated useAnimatedStyle is safe here
  // (no New Architecture crash risk). Skipped entirely for reduced-motion users.
  const iconOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (reduceMotion) return;
    iconOpacity.value = withRepeat(withTiming(0.5, { duration: 1200 }), -1, true);
  }, [reduceMotion, iconOpacity]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  // Derive nearest/ratio before any early returns so hooks below stay
  // unconditional. Defaults to null/0 while data is still loading.
  const nearest =
    badges && badges.length > 0 ? findNearestLockedBadge(badges) : null;
  const ratio = nearest ? progressRatio(nearest) : 0;

  // Progress bar spring: width is a layout prop, must use RNAnimated (not
  // Reanimated useAnimatedStyle) to avoid the New Architecture layout-prop
  // crash. Matches TopicBar physics (stiffness 120, damping 14).
  // Hooks are declared unconditionally here, before any early returns.
  const barAnim = React.useRef(new RNAnimated.Value(0)).current;
  React.useEffect(() => {
    if (!nearest) return; // nothing to animate while loading or all-earned
    if (reduceMotion) {
      barAnim.setValue(ratio * 100);
      return;
    }
    barAnim.setValue(0);
    RNAnimated.spring(barAnim, {
      toValue: ratio * 100,
      stiffness: 120,
      damping: 14,
      mass: 1,
      useNativeDriver: false, // width cannot use the native driver
    }).start();
  }, [ratio, reduceMotion, barAnim, nearest]);

  const barWidthPct = barAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Nothing to spotlight until we know the catalog for this language.
  if (isLoading || !badges || badges.length === 0) return null;

  if (!nearest) {
    return (
      <Animated.View
        entering={skipEnter ? undefined : appearDown(0, 400)}
        style={[
          styles.card,
          styles.allEarned,
          {
            backgroundColor: `${colors.secondary}14`,
            borderColor: `${colors.secondary}4D`,
          },
        ]}
      >
        <View
          style={[styles.trophy, { backgroundColor: colors.secondary }]}
        >
          <MaterialCommunityIcons
            name="trophy"
            size={26}
            color={colors.secondaryForeground}
          />
        </View>
        <Text style={[styles.eyebrow, { color: colors.secondary }]}>
          All badges earned
        </Text>
        <Text style={[styles.allEarnedTitle, { color: colors.foreground }]}>
          You've unlocked them all!
        </Text>
        <Text style={[styles.allEarnedSub, { color: colors.mutedForeground }]}>
          Keep practicing to stay sharp, new goals await.
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={skipEnter ? undefined : appearDown(0, 400)}
      style={[
        styles.card,
        {
          backgroundColor: `${colors.secondary}14`,
          borderColor: `${colors.secondary}66`,
        },
      ]}
    >
      <Text style={[styles.eyebrow, { color: colors.secondary }]}>
        Next goal
      </Text>
      <View style={styles.row}>
        {/* Animated.View is safe here: opacity is not a layout prop and does
            not trigger the New Architecture crash that width/height would. */}
        <Animated.View
          style={[
            styles.icon,
            { backgroundColor: `${colors.secondary}26` },
            iconAnimStyle,
          ]}
        >
          <MaterialCommunityIcons
            name={badgeIcon(nearest.iconName)}
            size={30}
            color={colors.secondary}
          />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {nearest.title}
          </Text>
          <Text
            style={[styles.desc, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {nearest.description}
          </Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          {/* RNAnimated.View required: width is a layout prop and crashes New
              Architecture if driven by Reanimated useAnimatedStyle. */}
          <RNAnimated.View
            style={{
              width: barWidthPct,
              height: '100%',
              borderRadius: 999,
              backgroundColor: colors.secondary,
            }}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.pctLabel, { color: colors.secondary }]}>
            {Math.round(ratio * 100)}% there
          </Text>
          <Text style={[styles.count, { color: colors.foreground }]}>
            {nearest.progressCurrent} / {nearest.progressTarget}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  desc: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  progressWrap: { marginTop: 16 },
  track: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pctLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  count: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  // All-earned celebratory variant.
  allEarned: { alignItems: 'center' },
  trophy: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  allEarnedTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    marginTop: 4,
  },
  allEarnedSub: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
