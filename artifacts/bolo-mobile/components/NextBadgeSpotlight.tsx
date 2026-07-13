import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
  const { data: badges, isLoading } = useListBadges({ lang });

  // Nothing to spotlight until we know the catalog for this language.
  if (isLoading || !badges || badges.length === 0) return null;

  const nearest = findNearestLockedBadge(badges);

  if (!nearest) {
    return (
      <Animated.View
        entering={FadeInDown.duration(400)}
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
          Keep practicing to stay sharp — new goals await.
        </Text>
      </Animated.View>
    );
  }

  const ratio = progressRatio(nearest);

  return (
    <Animated.View
      entering={FadeInDown.duration(400)}
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
        <View
          style={[styles.icon, { backgroundColor: `${colors.secondary}26` }]}
        >
          <MaterialCommunityIcons
            name={badgeIcon(nearest.iconName)}
            size={30}
            color={colors.secondary}
          />
        </View>
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
          <View
            style={{
              width: `${ratio * 100}%`,
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
